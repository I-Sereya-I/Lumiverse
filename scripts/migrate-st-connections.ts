#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

type STSecretEntry = {
  id?: string;
  value?: string;
  active?: boolean;
  label?: string;
};

type STProfile = {
  id?: string;
  name?: string;
  mode?: string;
  api?: string;
  model?: string;
  proxy?: string;
  preset?: string;
  "api-url"?: string;
  "secret-id"?: string;
};

type STProxy = {
  name?: string;
  url?: string;
  password?: string;
};

type LumiConnection = {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  model: string;
  metadata?: Record<string, unknown>;
};

type Candidate = {
  name: string;
  provider: string;
  api_url: string;
  model: string;
  api_key?: string;
  metadata: Record<string, unknown>;
  sourceKind: "profile" | "proxy";
};

const args = parseArgs(process.argv.slice(2));
const stDataDir = resolve(String(args["st-data-dir"] || "G:/AI/SillyTavern/data/default-user"));
const settingsPath = resolve(String(args["settings"] || join(stDataDir, "settings.json")));
const secretsPath = resolve(String(args["secrets"] || join(stDataDir, "secrets.json")));
const baseUrl = String(args["base-url"] || process.env.LUMIVERSE_URL || `http://localhost:${process.env.PORT || "9999"}`).replace(/\/+$/, "");
const username = String(args.username || process.env.LUMIVERSE_USERNAME || process.env.OWNER_USERNAME || "Escanor");
const password = String(args.password || process.env.LUMIVERSE_PASSWORD || "");
const dryRun = Boolean(args["dry-run"]);
const includeTextCompletion = Boolean(args["include-text-completion"]);
const repairExisting = Boolean(args["repair-existing"]);

let authCookie = "";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function readJson(path: string): any {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function getProfiles(settings: any): STProfile[] {
  const extensionProfiles = settings?.extension_settings?.connectionManager?.profiles;
  if (Array.isArray(extensionProfiles)) return extensionProfiles;
  const rootProfiles = settings?.connectionManager?.profiles;
  if (Array.isArray(rootProfiles)) return rootProfiles;
  return [];
}

function getProxies(settings: any): STProxy[] {
  return Array.isArray(settings?.proxies) ? settings.proxies : [];
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: unknown): string {
  return normalize(value).replace(/\s+/g, " ");
}

function buildSecretLookup(secrets: any): {
  byId: Map<string, string>;
  activeByCategory: Map<string, string>;
} {
  const byId = new Map<string, string>();
  const activeByCategory = new Map<string, string>();

  for (const [category, rawEntries] of Object.entries(secrets || {})) {
    if (!Array.isArray(rawEntries)) continue;
    const entries = rawEntries as STSecretEntry[];
    for (const entry of entries) {
      const id = normalize(entry?.id);
      const value = typeof entry?.value === "string" ? entry.value : "";
      if (id && value) byId.set(id, value);
    }

    const active = entries.find((entry) => entry?.active && typeof entry.value === "string" && entry.value);
    const fallback = entries.find((entry) => typeof entry?.value === "string" && entry.value);
    const selected = active || fallback;
    if (selected?.value) activeByCategory.set(category, selected.value);
  }

  return { byId, activeByCategory };
}

function providerFrom(api: string, apiUrl: string): string {
  const normalizedApi = api.toLowerCase();
  const url = apiUrl.toLowerCase();

  if (normalizedApi === "claude") return "anthropic";
  if (normalizedApi === "google" || normalizedApi === "makersuite") return "google";
  if (normalizedApi === "vertexai") return "google_vertex";
  if (normalizedApi === "openai") return url.includes("api.openai.com") || !url ? "openai" : "custom";
  if (normalizedApi === "openrouter") return "openrouter";
  if (normalizedApi === "groq") return "groq";
  if (normalizedApi === "mistral") return "mistral";
  if (normalizedApi === "infermaticai") return "infermatic";

  if (url.includes("openrouter.ai")) return "openrouter";
  if (url.includes("api.deepseek.com")) return "deepseek";
  if (url.includes("api.groq.com")) return "groq";
  if (url.includes("api.mistral.ai")) return "mistral";
  if (url.includes("api.x.ai")) return "xai";
  if (url.includes("api.fireworks.ai")) return "fireworks";
  if (url.includes("api.perplexity.ai")) return "perplexity";
  if (url.includes("electronhub")) return "electronhub";
  if (url.includes("siliconflow")) return "siliconflow";
  if (url.includes("nano-gpt.com")) return "nanogpt";
  if (url.includes("chutes.ai")) return "chutes";
  if (url.includes("infermatic")) return "infermatic";
  if (url.includes("pollinations.ai")) return "pollinations_text";

  return "custom";
}

function secretCategoryFor(api: string, provider: string): string[] {
  const normalizedApi = api.toLowerCase();
  const categories = [
    `api_key_${normalizedApi}`,
    `api_key_${provider}`,
  ];

  if (provider === "anthropic") categories.push("api_key_claude");
  if (provider === "google") categories.push("api_key_makersuite", "api_key_makersuite_custom");
  if (provider === "google_vertex") categories.push("api_key_vertexai", "vertexai_service_account_json");
  if (provider === "openrouter") categories.push("api_key_openrouter");
  if (provider === "custom") categories.push("api_key_custom", "api_key_generic");

  return [...new Set(categories.filter((value) => value && value !== "api_key_"))];
}

function resolveSecret(profile: STProfile, provider: string, lookup: ReturnType<typeof buildSecretLookup>): string | undefined {
  const secretId = normalize(profile["secret-id"]);
  if (secretId && lookup.byId.has(secretId)) return lookup.byId.get(secretId);

  for (const category of secretCategoryFor(normalize(profile.api), provider)) {
    const value = lookup.activeByCategory.get(category);
    if (value) return value;
  }

  return undefined;
}

function isNoneProxyName(name: string): boolean {
  return !name || name.toLowerCase() === "none";
}

function buildCandidates(settings: any, secrets: any): { candidates: Candidate[]; skippedTextCompletion: string[]; skippedInvalid: string[] } {
  const profiles = getProfiles(settings);
  const proxies = getProxies(settings);
  const proxyByName = new Map(proxies.map((proxy) => [normalizeName(proxy.name), proxy]));
  const lookup = buildSecretLookup(secrets);

  const candidates: Candidate[] = [];
  const skippedTextCompletion: string[] = [];
  const skippedInvalid: string[] = [];

  for (const profile of profiles) {
    const name = normalizeName(profile.name);
    const mode = normalize(profile.mode).toLowerCase();
    if (mode === "tc" && !includeTextCompletion) {
      skippedTextCompletion.push(name || "(unnamed text completion profile)");
      continue;
    }

    const proxyName = normalizeName(profile.proxy);
    const directUrl = normalize(profile["api-url"]);
    const apiUrl = directUrl;
    if (!name || !apiUrl) {
      skippedInvalid.push(name || profile.id || "(unnamed profile)");
      continue;
    }

    const provider = providerFrom(normalize(profile.api), apiUrl);
    const apiKey = resolveSecret(profile, provider, lookup);

    candidates.push({
      name,
      provider,
      api_url: apiUrl,
      model: normalize(profile.model),
      api_key: apiKey,
      sourceKind: "profile",
      metadata: {
        source: "sillytavern",
        source_kind: "connection_profile",
        st_profile_id: normalize(profile.id) || undefined,
        st_api: normalize(profile.api) || undefined,
        st_mode: normalize(profile.mode) || undefined,
        st_direct_api_url: directUrl || undefined,
        st_proxy_name: proxyName || undefined,
        st_preset: normalize(profile.preset) || undefined,
      },
    });
  }

  for (const proxy of proxies) {
    const name = normalizeName(proxy.name);
    const apiUrl = normalize(proxy.url);
    if (isNoneProxyName(name)) continue;
    if (!name || !apiUrl) {
      skippedInvalid.push(`proxy:${name || "(unnamed proxy)"}`);
      continue;
    }

    candidates.push({
      name: `Proxy: ${name}`,
      provider: providerFrom("custom", apiUrl),
      api_url: apiUrl,
      model: "",
      api_key: normalize(proxy.password) || undefined,
      sourceKind: "proxy",
      metadata: {
        source: "sillytavern",
        source_kind: "reverse_proxy",
        st_proxy_name: name,
      },
    });
  }

  return { candidates, skippedTextCompletion, skippedInvalid };
}

function duplicateKey(input: { name: string; provider: string; api_url: string; model: string }): string {
  return [
    input.name.trim().toLowerCase(),
    input.provider.trim().toLowerCase(),
    input.api_url.trim().replace(/\/+$/, "").toLowerCase(),
    input.model.trim().toLowerCase(),
  ].join("\u0000");
}

function findRepairTarget(existing: LumiConnection[], candidate: Candidate): LumiConnection | undefined {
  const sourceKind = candidate.metadata.source_kind;
  const stProfileId = candidate.metadata.st_profile_id;
  const stProxyName = candidate.metadata.st_proxy_name;

  return existing.find((connection) => {
    const metadata = connection.metadata || {};
    if (metadata.source !== "sillytavern") return false;
    if (metadata.source_kind !== sourceKind) return false;
    if (sourceKind === "connection_profile" && stProfileId && metadata.st_profile_id === stProfileId) return true;
    if (sourceKind === "reverse_proxy" && stProxyName && metadata.st_proxy_name === stProxyName) return true;
    return connection.name.trim().toLowerCase() === candidate.name.trim().toLowerCase();
  });
}

async function authenticate(): Promise<void> {
  if (!password) throw new Error("Missing password. Pass --password or set LUMIVERSE_PASSWORD.");

  const emailVariants = [`${username}@lumiverse.local`, username];
  for (const email of emailVariants) {
    const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });

    const setCookie = res.headers.getSetCookie?.() || [];
    const sessionCookie = setCookie.find((cookie: string) => cookie.includes("better-auth.session_token"));
    if (sessionCookie) {
      authCookie = sessionCookie.split(";")[0];
      return;
    }

    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.token) {
        authCookie = `better-auth.session_token=${body.token}`;
        return;
      }
    }
  }

  throw new Error(`Authentication failed for ${username} at ${baseUrl}`);
}

async function apiRequest(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = { Cookie: authCookie };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} failed with ${res.status}: ${text}`);
  }
  return res.json();
}

async function listExistingConnections(): Promise<LumiConnection[]> {
  const all: LumiConnection[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await apiRequest("GET", `/connections?limit=${limit}&offset=${offset}`);
    const data = Array.isArray(page) ? page : page.data;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function main(): Promise<void> {
  const settings = readJson(settingsPath);
  const secrets = readJson(secretsPath);
  const profiles = getProfiles(settings);
  const proxies = getProxies(settings);
  const { candidates, skippedTextCompletion, skippedInvalid } = buildCandidates(settings, secrets);

  console.log(`ST settings: ${settingsPath}`);
  console.log(`Found ${profiles.length} current connection profile(s), ${proxies.length} reverse proxy row(s).`);
  console.log(`Prepared ${candidates.length} Lumiverse connection(s).`);

  if (dryRun) {
    for (const candidate of candidates) {
      console.log(`[dry-run] ${candidate.sourceKind}: ${candidate.name} -> ${candidate.provider} ${candidate.api_url} ${candidate.model || ""}`.trim());
    }
    console.log(`Skipped text completion: ${skippedTextCompletion.length}`);
    console.log(`Skipped invalid: ${skippedInvalid.length}`);
    return;
  }

  await authenticate();
  const existing = await listExistingConnections();
  const existingKeys = new Set(existing.map(duplicateKey));
  const seenKeys = new Set<string>();

  let created = 0;
  let duplicate = 0;
  let repaired = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const key = duplicateKey(candidate);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicate++;
      console.log(`skip duplicate: ${candidate.name}`);
      continue;
    }

    const repairTarget = repairExisting ? findRepairTarget(existing, candidate) : undefined;
    if (repairTarget) {
      try {
        await apiRequest("PUT", `/connections/${repairTarget.id}`, {
          name: candidate.name,
          provider: candidate.provider,
          api_url: candidate.api_url,
          model: candidate.model,
          api_key: candidate.api_key,
          is_default: false,
          metadata: candidate.metadata,
        });
        seenKeys.add(key);
        repaired++;
        console.log(`repaired: ${candidate.name}`);
      } catch (err: any) {
        failed++;
        console.log(`failed repair: ${candidate.name} - ${err.message || err}`);
      }
      continue;
    }

    try {
      await apiRequest("POST", "/connections", {
        name: candidate.name,
        provider: candidate.provider,
        api_url: candidate.api_url,
        model: candidate.model,
        api_key: candidate.api_key,
        is_default: false,
        metadata: candidate.metadata,
      });
      seenKeys.add(key);
      created++;
      console.log(`created: ${candidate.name}`);
    } catch (err: any) {
      failed++;
      console.log(`failed: ${candidate.name} - ${err.message || err}`);
    }
  }

  const after = await listExistingConnections();
  console.log("");
  console.log("Migration summary");
  console.log(`Created: ${created}`);
  console.log(`Repaired: ${repaired}`);
  console.log(`Skipped duplicates: ${duplicate}`);
  console.log(`Skipped text completion: ${skippedTextCompletion.length}${skippedTextCompletion.length ? ` (${skippedTextCompletion.join(", ")})` : ""}`);
  console.log(`Skipped invalid: ${skippedInvalid.length}${skippedInvalid.length ? ` (${skippedInvalid.join(", ")})` : ""}`);
  console.log(`Failed: ${failed}`);
  console.log(`Lumiverse connections now visible to API: ${after.length}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Migration failed: ${err.message || err}`);
  process.exit(1);
});
