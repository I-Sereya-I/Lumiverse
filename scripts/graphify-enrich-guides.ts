import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

type GraphNode = {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  _origin?: string;
  norm_label?: string;
  [key: string]: unknown;
};

type GraphLink = {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  confidence_score: number;
  weight?: number;
  source_file?: string;
  source_location?: string;
  [key: string]: unknown;
};

type GraphData = {
  nodes: GraphNode[];
  links?: GraphLink[];
  edges?: GraphLink[];
  graph?: { hyperedges?: unknown[]; [key: string]: unknown };
  hyperedges?: unknown[];
  [key: string]: unknown;
};

const GRAPH_PATH = "graphify-out/graph.json";

const GUIDE_DOCS = [
  "developer-docs/docs/frontend-and-extensions.md",
  "developer-docs/docs/extension-inventory.md",
  "developer-docs/docs/settings-to-css-map.md",
  "developer-docs/docs/backend-modification-map.md",
];

const STALE_GUIDE_DOCS = [
  "developer-docs/docs/graph-report-critique.md",
];

const WORKFLOW_ALIASES: Record<string, Record<string, string[]>> = {
  "developer-docs/docs/frontend-and-extensions.md": {
    "Edit Anything in Lumiverse": [
      "Change Any Frontend Feature",
      "Change Frontend Styling",
      "Edit Any Setting",
      "Edit Theme or CSS",
      "Modify Any Backend Feature",
      "Add Database or Realtime Behavior",
      "Create Spindle Extension",
      "Change Installed Extension",
    ],
  },
};

const CROSS_GUIDE_REFS: Record<string, Record<string, string[]>> = {
  "developer-docs/docs/frontend-and-extensions.md": {
    "Edit Anything in Lumiverse": [
      "developer-docs/docs/extension-inventory.md",
      "developer-docs/docs/settings-to-css-map.md",
      "developer-docs/docs/backend-modification-map.md",
    ],
  },
};

const GUIDE_REFS: Record<string, Record<string, string[]>> = {
  "developer-docs/docs/frontend-and-extensions.md": {
    "Edit Anything in Lumiverse": [
      "frontend/src/App.tsx",
      "frontend/src/store/slices/settings.ts",
      "src/app.ts",
      "src/spindle/manager.service.ts",
    ],
    "Edit Frontend Feature Workflow": [
      "frontend/src/main.tsx",
      "frontend/src/App.tsx",
      "frontend/src/router.tsx",
      "frontend/src/store/index.ts",
      "frontend/src/api/client.ts",
      "frontend/src/ws/client.ts",
      "frontend/src/ws/useWebSocket.ts",
      "frontend/src/types/ws-events.ts",
      "frontend/src/components/chat/ChatView.tsx",
    ],
    "Edit Frontend Styling Workflow": [
      "frontend/src/theme/variables.css",
      "frontend/src/theme/engine.ts",
      "frontend/src/hooks/useThemeApplicator.ts",
      "frontend/src/hooks/useCustomCSSApplicator.ts",
      "frontend/src/components/modals/CustomCSSModal.tsx",
    ],
    "Create Extension Workflow": [
      "src/spindle/manager.service.ts",
      "src/routes/spindle.routes.ts",
      "frontend/src/lib/spindle/loader.ts",
      "frontend/src/lib/spindle/placement-helper.ts",
      "developer-docs/docs/getting-started/manifest.md",
      "developer-docs/docs/getting-started/permissions.md",
      "developer-docs/docs/examples/frontend-only.md",
      "developer-docs/docs/examples/full-stack.md",
    ],
    "Extension Frontend Surfaces": [
      "frontend/src/lib/spindle/loader.ts",
      "frontend/src/lib/spindle/placement-helper.ts",
      "frontend/src/store/slices/spindle-placement.ts",
      "frontend/src/components/spindle/SpindleUIManager.tsx",
      "developer-docs/docs/frontend-api/ui-placement.md",
      "developer-docs/docs/frontend-api/backend-communication.md",
    ],
    "Extension Backend Surfaces": [
      "src/spindle/worker-runtime.ts",
      "src/spindle/worker-host.ts",
      "src/spindle/manager.service.ts",
      "developer-docs/docs/backend-api/index.md",
      "developer-docs/docs/backend-api/frontend-communication.md",
      "developer-docs/docs/backend-api/storage.md",
    ],
  },
  "developer-docs/docs/settings-to-css-map.md": {
    "Settings Ownership": [
      "frontend/src/store/slices/settings.ts",
      "frontend/src/store/slices/chat.ts",
      "frontend/src/store/slices/characters.ts",
      "frontend/src/store/slices/personas.ts",
      "frontend/src/store/slices/connections.ts",
      "frontend/src/store/slices/summary.ts",
      "frontend/src/store/slices/expressions.ts",
      "frontend/src/store/slices/image-gen-connections.ts",
      "frontend/src/store/slices/chat-heads.ts",
      "frontend/src/store/slices/spindle-placement.ts",
      "frontend/src/store/slices/spindle.ts",
      "src/services/settings.service.ts",
    ],
    "Add Persisted Setting Workflow": [
      "frontend/src/types/store.ts",
      "frontend/src/store/slices/settings.ts",
      "frontend/src/api/settings.ts",
      "src/services/settings.service.ts",
      "frontend/src/components/modals/SettingsModal.tsx",
      "frontend/src/components/panels/ThemePanel.tsx",
      "frontend/src/components/panels/WallpaperPanel.tsx",
      "frontend/src/components/modals/CustomCSSModal.tsx",
    ],
    "Theme Layer Order": [
      "frontend/src/theme/variables.css",
      "frontend/src/store/slices/settings.ts",
      "frontend/src/hooks/useCharacterTheme.ts",
      "frontend/src/hooks/useThemeApplicator.ts",
      "frontend/src/hooks/useCustomCSSApplicator.ts",
      "frontend/src/store/slices/spindle.ts",
    ],
    "Edit Theme Token Workflow": [
      "frontend/src/types/theme.ts",
      "frontend/src/theme/engine.ts",
      "frontend/src/theme/presets.ts",
      "frontend/src/components/panels/ThemePanel.tsx",
      "frontend/src/theme/variables.css",
    ],
    "Edit Custom CSS Workflow": [
      "frontend/src/components/modals/CustomCSSModal.tsx",
      "frontend/src/hooks/useCustomCSSApplicator.ts",
      "frontend/src/lib/cssValidator.ts",
      "frontend/src/lib/themeAssetCss.ts",
      "frontend/src/lib/cssModuleRegistry.ts",
      "frontend/src/hooks/useComponentOverride.tsx",
      "frontend/src/components/chat/BubbleMessage.tsx",
      "frontend/src/components/chat/MinimalMessage.tsx",
    ],
    "Layout Settings Map": [
      "frontend/src/App.tsx",
      "frontend/src/components/panels/ViewportDrawer.tsx",
      "frontend/src/components/chat/ChatView.tsx",
      "frontend/src/components/landing/LandingPage.tsx",
      "frontend/src/components/chat-heads/ChatHeads.tsx",
      "frontend/src/store/slices/settings.ts",
    ],
  },
  "developer-docs/docs/backend-modification-map.md": {
    "Boot Sequence": [
      "src/index.ts",
      "src/main.ts",
      "src/app.ts",
    ],
    "Add Backend API Workflow": [
      "src/app.ts",
      "src/routes/settings.routes.ts",
      "src/services/settings.service.ts",
      "frontend/src/api/client.ts",
      "frontend/src/store/index.ts",
    ],
    "Database Migration Workflow": [
      "src/db/migrate.ts",
      "src/services/settings.service.ts",
      "src/db/migrations/078_chats_character_id_nullable.sql",
    ],
    "Realtime Event Workflow": [
      "src/ws/events.ts",
      "src/ws/bus.ts",
      "src/ws/handler.ts",
      "frontend/src/ws/useWebSocket.ts",
      "frontend/src/types/ws-events.ts",
    ],
    "Background Workflows": [
      "src/services/vectorization-queue.service.ts",
      "src/services/chat-memory-cache.service.ts",
      "src/services/disk-monitor.service.ts",
      "src/db/maintenance.ts",
      "src/db/maintenance-scheduler.ts",
      "src/spindle/bulk-update.service.ts",
    ],
    "Spindle Extension Lifecycle": [
      "src/routes/spindle.routes.ts",
      "src/spindle/manager.service.ts",
      "src/spindle/lifecycle.ts",
      "src/spindle/worker-host.ts",
      "src/spindle/worker-runtime.ts",
      "src/spindle/runtime-transport.ts",
      "src/spindle/worker-runtime-sandbox.ts",
      "src/spindle/shared-rpc-pool.service.ts",
      "src/spindle/bulk-update.service.ts",
    ],
    "Add Spindle Capability Workflow": [
      "src/spindle/worker-runtime.ts",
      "src/spindle/worker-host.ts",
      "src/spindle/manager.service.ts",
      "src/spindle/runtime-transport.ts",
      "developer-docs/docs/backend-api/index.md",
    ],
    "Extension Install and Update": [
      "src/spindle/manager.service.ts",
      "src/routes/spindle.routes.ts",
    ],
  },
  "developer-docs/docs/extension-inventory.md": {
    "auto_retry Extension": [
      "data/extensions/auto_retry/repo/spindle.json",
      "data/extensions/auto_retry/repo/src/frontend.ts",
    ],
    "canvas Extension": [
      "data/extensions/canvas/repo/spindle.json",
      "data/extensions/canvas/repo/package.json",
      "data/extensions/canvas/repo/src/setup.ts",
      "data/extensions/canvas/repo/src/sidebar/secondary.tsx",
      "data/extensions/canvas/repo/src/tabs/assignment.ts",
      "data/extensions/canvas/repo/src/layout/persist.ts",
      "data/extensions/canvas/repo/src/backend.ts",
    ],
    "creator_notes_html_renderer Extension": [
      "data/extensions/creator_notes_html_renderer/repo/spindle.json",
      "data/extensions/creator_notes_html_renderer/repo/package.json",
      "data/extensions/creator_notes_html_renderer/repo/src/frontend.ts",
      "data/extensions/creator_notes_html_renderer/repo/src/sanitizer.ts",
      "data/extensions/creator_notes_html_renderer/repo/src/backend.ts",
    ],
    "lumiagent Extension": [
      "data/extensions/lumiagent/repo/spindle.json",
      "data/extensions/lumiagent/repo/package.json",
      "data/extensions/lumiagent/repo/src/backend.ts",
      "data/extensions/lumiagent/repo/src/agent/loop.ts",
      "data/extensions/lumiagent/repo/src/ui/drawer.ts",
      "data/extensions/lumiagent/repo/src/types.ts",
    ],
    "lumirealm Extension": [
      "data/extensions/lumirealm/repo/spindle.json",
      "data/extensions/lumirealm/repo/package.json",
      "data/extensions/lumirealm/repo/src/backend.ts",
      "data/extensions/lumirealm/repo/src/frontend.ts",
      "data/extensions/lumirealm/repo/src/types/messages.ts",
      "data/extensions/lumirealm/repo/src/lumiagent-phoneline.ts",
    ],
    "lumiscript Extension": [
      "data/extensions/lumiscript/repo/spindle.json",
      "data/extensions/lumiscript/repo/package.json",
      "data/extensions/lumiscript/repo/src/frontend.tsx",
      "data/extensions/lumiscript/repo/src/backend.ts",
      "data/extensions/lumiscript/repo/src/engine/executor.ts",
      "data/extensions/lumiscript/repo/src/types/messages.ts",
    ],
    "lumi_books Extension": [
      "data/extensions/lumi_books/repo/spindle.json",
      "data/extensions/lumi_books/repo/package.json",
      "data/extensions/lumi_books/repo/src/backend/index.ts",
      "data/extensions/lumi_books/repo/src/backend/pipeline.ts",
      "data/extensions/lumi_books/repo/src/backend/injection.ts",
      "data/extensions/lumi_books/repo/src/backend/storage.ts",
      "data/extensions/lumi_books/repo/src/ui/app.ts",
    ],
    "prompt_viewer Extension": [
      "data/extensions/prompt_viewer/repo/spindle.json",
      "data/extensions/prompt_viewer/repo/package.json",
      "data/extensions/prompt_viewer/repo/src/backend.ts",
      "data/extensions/prompt_viewer/repo/src/frontend.ts",
      "data/extensions/prompt_viewer/repo/src/storage/prompt-store.ts",
    ],
    "shutter Extension": [
      "data/extensions/shutter/repo/spindle.json",
      "data/extensions/shutter/repo/package.json",
      "data/extensions/shutter/repo/src/frontend.ts",
      "data/extensions/shutter/repo/src/backend.ts",
      "data/extensions/shutter/repo/defaults/settings.json",
    ],
    "silly_sim_tracker Extension": [
      "data/extensions/silly_sim_tracker/repo/spindle.json",
      "data/extensions/silly_sim_tracker/repo/package.json",
      "data/extensions/silly_sim_tracker/repo/src/backend.ts",
      "data/extensions/silly_sim_tracker/repo/src/frontend.ts",
    ],
    "vishrun Extension": [
      "data/extensions/vishrun/repo/spindle.json",
      "data/extensions/vishrun/repo/package.json",
      "data/extensions/vishrun/repo/src/frontend.ts",
      "data/extensions/vishrun/repo/src/backend/index.ts",
      "data/extensions/vishrun/repo/src/render/inject-into-message.ts",
      "data/extensions/vishrun/repo/src/render/widget-iframe.ts",
    ],
  },
};

function slug(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/[`*]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function lineNodeId(source: string, line: number, label: string): string {
  return `guide_${slug(source)}_${line}_${slug(label).slice(0, 100)}`;
}

function sectionNodeId(source: string, label: string): string {
  return `guide_${slug(source)}_${slug(label)}`;
}

function aliasNodeId(source: string, label: string): string {
  return `guide_alias_${slug(source)}_${slug(label)}`;
}

function addNode(nodes: GraphNode[], seen: Set<string>, node: GraphNode): void {
  if (seen.has(node.id)) return;
  nodes.push(node);
  seen.add(node.id);
}

function addLink(links: GraphLink[], seen: Set<string>, link: GraphLink): void {
  const key = [
    link.source,
    link.target,
    link.relation,
    link.source_file ?? "",
    link.source_location ?? "",
  ].join("\u0000");
  if (seen.has(key)) return;
  links.push(link);
  seen.add(key);
}

function findFileNodeId(nodes: GraphNode[], sourceFile: string): string | null {
  const source = normalizePath(sourceFile);
  const base = basename(source);
  const exact = nodes.find((node) =>
    normalizePath(String(node.source_file ?? "")) === source &&
    node.label === base &&
    node.source_location === "L1"
  );
  if (exact) return exact.id;

  const fallback = nodes.find((node) =>
    normalizePath(String(node.source_file ?? "")) === source &&
    node.source_location === "L1"
  );
  if (fallback) return fallback.id;

  if (!existsSync(source)) return null;
  const id = `guide_file_${slug(source)}`;
  nodes.push({
    id,
    label: base,
    file_type: "code",
    source_file: source,
    source_location: "L1",
    _origin: "guide-enrichment",
    norm_label: base.toLowerCase(),
  });
  return id;
}

function parseGuide(data: GraphData, source: string): {
  sectionIds: Record<string, string>;
  sectionLines: Record<string, string>;
  rootId: string;
  sectionList: string[];
} {
  const text = readFileSync(source, "utf8");
  const lines = text.split(/\r?\n/);
  const links = data.links ?? data.edges ?? [];
  const nodeIds = new Set(data.nodes.map((node) => node.id));
  const linkIds = new Set<string>();
  const rootLabel = stripMarkdown(
    lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ||
      basename(source)
  );
  const rootId = sectionNodeId(source, rootLabel);
  const sectionIds: Record<string, string> = { [rootLabel]: rootId };
  const sectionLines: Record<string, string> = { [rootLabel]: "L1" };
  const sectionList = [rootId];

  addNode(data.nodes, nodeIds, {
    id: rootId,
    label: rootLabel,
    file_type: "document",
    source_file: source,
    source_location: "L1",
    _origin: "guide-enrichment",
    norm_label: rootLabel.toLowerCase(),
  });

  let currentSection = rootId;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      const label = stripMarkdown(heading[2]);
      const id = sectionNodeId(source, label);
      sectionIds[label] = id;
      sectionLines[label] = `L${lineNumber}`;
      sectionList.push(id);
      addNode(data.nodes, nodeIds, {
        id,
        label,
        file_type: "document",
        source_file: source,
        source_location: `L${lineNumber}`,
        _origin: "guide-enrichment",
        norm_label: label.toLowerCase(),
      });
      addLink(links, linkIds, {
        source: rootId,
        target: id,
        relation: "contains",
        confidence: "EXTRACTED",
        confidence_score: 1,
        weight: 1,
        source_file: source,
        source_location: `L${lineNumber}`,
      });
      currentSection = id;
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      const label = stripMarkdown(bullet[1]).slice(0, 180);
      if (!label) continue;
      const id = lineNodeId(source, lineNumber, label);
      addNode(data.nodes, nodeIds, {
        id,
        label,
        file_type: "concept",
        source_file: source,
        source_location: `L${lineNumber}`,
        _origin: "guide-enrichment",
        norm_label: label.toLowerCase(),
      });
      addLink(links, linkIds, {
        source: currentSection,
        target: id,
        relation: "explains",
        confidence: "EXTRACTED",
        confidence_score: 1,
        weight: 1,
        source_file: source,
        source_location: `L${lineNumber}`,
      });
    }
  }

  data.links = links;
  return { sectionIds, sectionLines, rootId, sectionList };
}

if (!existsSync(GRAPH_PATH)) {
  throw new Error(`${GRAPH_PATH} not found. Run graphify update . first.`);
}

const data = JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as GraphData;
const links = data.links ?? data.edges ?? [];
data.links = links;

const uniqueNodes = new Map<string, GraphNode>();
let duplicateNodeIds = 0;
for (const node of data.nodes) {
  if (uniqueNodes.has(node.id)) {
    duplicateNodeIds += 1;
    continue;
  }
  uniqueNodes.set(node.id, node);
}
data.nodes = Array.from(uniqueNodes.values());

const guideSources = new Set(
  [...GUIDE_DOCS, ...STALE_GUIDE_DOCS].map(normalizePath)
);
const removedNodeIds = new Set(
  data.nodes
    .filter((node) => guideSources.has(normalizePath(String(node.source_file ?? ""))))
    .map((node) => node.id)
);

data.nodes = data.nodes.filter((node) => !removedNodeIds.has(node.id));
data.links = links.filter(
  (link) => !removedNodeIds.has(link.source) && !removedNodeIds.has(link.target)
);

if (Array.isArray(data.hyperedges)) {
  data.hyperedges = data.hyperedges.filter((edge: any) =>
    !guideSources.has(normalizePath(String(edge?.source_file ?? "")))
  );
}
if (Array.isArray(data.graph?.hyperedges)) {
  data.graph.hyperedges = data.graph.hyperedges.filter((edge: any) =>
    !guideSources.has(normalizePath(String(edge?.source_file ?? "")))
  );
}

let guideEdges = 0;
const linkIds = new Set<string>();
const parsedGuides = new Map<string, ReturnType<typeof parseGuide>>();

for (const source of GUIDE_DOCS) {
  if (!existsSync(source)) continue;
  const parsed = parseGuide(data, source);
  parsedGuides.set(source, parsed);
}

const extensionRoot = "data/extensions";
if (existsSync(extensionRoot)) {
  const inventorySource = "developer-docs/docs/extension-inventory.md";
  const inventoryRefs = GUIDE_REFS[inventorySource] ?? {};
  for (const extensionName of readdirSync(extensionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const repo = `${extensionRoot}/${extensionName}/repo`;
    if (!existsSync(repo)) continue;
    const section = `${extensionName} Extension`;
    const discovered = [
      `${repo}/spindle.json`,
      `${repo}/package.json`,
      `${repo}/src/frontend.ts`,
      `${repo}/src/frontend.tsx`,
      `${repo}/src/backend.ts`,
      `${repo}/src/backend/index.ts`,
    ].filter(existsSync);
    inventoryRefs[section] = Array.from(
      new Set([...(inventoryRefs[section] ?? []), ...discovered])
    );
  }
  GUIDE_REFS[inventorySource] = inventoryRefs;
}

for (const source of GUIDE_DOCS) {
  const parsed = parsedGuides.get(source);
  if (!parsed) continue;
  const refs = GUIDE_REFS[source] ?? {};
  for (const [sectionLabel, targetFiles] of Object.entries(refs)) {
    const sourceId = parsed.sectionIds[sectionLabel];
    if (!sourceId) {
      console.warn(`[graphify-enrich-guides] Missing section "${sectionLabel}" in ${source}`);
      continue;
    }
    for (const targetFile of targetFiles) {
      const targetId = findFileNodeId(data.nodes, targetFile);
      if (!targetId) {
        console.warn(`[graphify-enrich-guides] Missing graph node for ${targetFile}`);
        continue;
      }
      addLink(data.links, linkIds, {
        source: sourceId,
        target: targetId,
        relation: "guide_references",
        confidence: "EXTRACTED",
        confidence_score: 1,
        weight: 2,
        source_file: source,
        source_location: parsed.sectionLines[sectionLabel] ?? "L1",
      });
      guideEdges += 1;
    }
  }

  for (const [sectionLabel, aliases] of Object.entries(
    WORKFLOW_ALIASES[source] ?? {}
  )) {
    const targetId = parsed.sectionIds[sectionLabel];
    if (!targetId) {
      console.warn(
        `[graphify-enrich-guides] Missing alias target "${sectionLabel}" in ${source}`
      );
      continue;
    }
    for (const alias of aliases) {
      const id = aliasNodeId(source, alias);
      addNode(data.nodes, new Set(data.nodes.map((node) => node.id)), {
        id,
        label: alias,
        file_type: "concept",
        source_file: source,
        source_location: parsed.sectionLines[sectionLabel] ?? "L1",
        _origin: "guide-enrichment",
        norm_label: alias.toLowerCase(),
      });
      addLink(data.links, linkIds, {
        source: id,
        target: targetId,
        relation: "aliases",
        confidence: "EXTRACTED",
        confidence_score: 1,
        weight: 3,
        source_file: source,
        source_location: parsed.sectionLines[sectionLabel] ?? "L1",
      });
    }
  }

  for (const [sectionLabel, targetGuides] of Object.entries(
    CROSS_GUIDE_REFS[source] ?? {}
  )) {
    const sourceId = parsed.sectionIds[sectionLabel];
    if (!sourceId) continue;
    for (const targetGuide of targetGuides) {
      const targetId = parsedGuides.get(targetGuide)?.rootId;
      if (!targetId) {
        console.warn(
          `[graphify-enrich-guides] Missing cross-guide target ${targetGuide}`
        );
        continue;
      }
      addLink(data.links, linkIds, {
        source: sourceId,
        target: targetId,
        relation: "routes_to",
        confidence: "EXTRACTED",
        confidence_score: 1,
        weight: 3,
        source_file: source,
        source_location: parsed.sectionLines[sectionLabel] ?? "L1",
      });
      guideEdges += 1;
    }
  }

  const hyperedge = {
    id: `${slug(source)}_guide_sections`,
    label: `${basename(source)} guide sections`,
    nodes: parsed.sectionList,
    relation: "participate_in",
    confidence: "EXTRACTED",
    confidence_score: 1,
    source_file: source,
  };
  if (!Array.isArray(data.graph?.hyperedges)) {
    data.graph = { ...(data.graph ?? {}), hyperedges: [] };
  }
  data.graph.hyperedges.push(hyperedge);
}

writeFileSync(GRAPH_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(
  `[graphify-enrich-guides] removed ${removedNodeIds.size} stale guide nodes, ` +
    `${duplicateNodeIds} duplicate node ids; ` +
    `wrote ${data.nodes.length} nodes, ${data.links.length} links, ${guideEdges} guide edges`
);
