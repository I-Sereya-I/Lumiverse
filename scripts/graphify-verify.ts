import { existsSync, readdirSync, readFileSync } from "node:fs";

type GraphNode = {
  id: string;
  label: string;
  source_file?: string;
  _origin?: string;
};

type GraphLink = {
  source: string;
  target: string;
  relation: string;
};

type GraphData = {
  nodes: GraphNode[];
  links?: GraphLink[];
  edges?: GraphLink[];
};

type QueryFixture = {
  query: string;
  expects: string[];
};

const graphPath = "graphify-out/graph.json";
const reportPath = "graphify-out/GRAPH_REPORT.md";

function fail(message: string): never {
  console.error(`[graphify-verify] ${message}`);
  process.exit(1);
}

function runGraphify(args: string[]): string {
  const result = Bun.spawnSync({
    cmd: ["graphify", ...args],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    fail(`graphify ${args.join(" ")} failed:\n${stderr || stdout}`);
  }
  return `${stdout}\n${stderr}`;
}

if (!existsSync(graphPath)) fail(`${graphPath} does not exist`);
if (!existsSync(reportPath)) fail(`${reportPath} does not exist`);

const graph = JSON.parse(readFileSync(graphPath, "utf8")) as GraphData;
const links = graph.links ?? graph.edges ?? [];
const nodeIds = new Set<string>();

for (const node of graph.nodes) {
  if (nodeIds.has(node.id)) fail(`duplicate node id: ${node.id}`);
  nodeIds.add(node.id);
}

for (const link of links) {
  if (!nodeIds.has(link.source)) {
    fail(`dangling ${link.relation} source: ${link.source}`);
  }
  if (!nodeIds.has(link.target)) {
    fail(`dangling ${link.relation} target: ${link.target}`);
  }
}

for (const node of graph.nodes) {
  if (
    node._origin === "guide-enrichment" &&
    node.source_file &&
    !existsSync(node.source_file)
  ) {
    fail(`guide node references missing file: ${node.source_file}`);
  }
}

const hub = graph.nodes.find(
  (node) =>
    node.label === "Edit Anything in Lumiverse" &&
    node.source_file === "developer-docs/docs/frontend-and-extensions.md"
);
if (!hub) fail("Edit Anything in Lumiverse hub node is missing");

const routedLabels = new Set(
  links
    .filter((link) => link.source === hub.id && link.relation === "routes_to")
    .map((link) => graph.nodes.find((node) => node.id === link.target)?.label)
);
for (const expected of [
  "Installed Extension Inventory",
  "Settings to CSS Map",
  "Backend Modification Map",
]) {
  if (!routedLabels.has(expected)) fail(`hub does not route to ${expected}`);
}

const fixtures: QueryFixture[] = [
  {
    query: "Change Any Frontend Feature",
    expects: [
      "Change Any Frontend Feature",
      "Edit Anything in Lumiverse",
      "Settings to CSS Map",
      "Backend Modification Map",
    ],
  },
  {
    query: "Edit Any Setting",
    expects: ["Edit Any Setting", "Edit Anything in Lumiverse"],
  },
  {
    query: "Add Persisted Setting Workflow",
    expects: ["settings.ts", "settings.service.ts"],
  },
  {
    query: "Edit Custom CSS Workflow",
    expects: ["useCustomCSSApplicator.ts", "cssValidator.ts"],
  },
  {
    query: "Add Backend API Workflow",
    expects: ["app.ts", "settings.service.ts"],
  },
  {
    query: "Add Spindle Capability Workflow",
    expects: ["worker-runtime.ts", "worker-host.ts"],
  },
  {
    query: "Create Extension Workflow",
    expects: ["manager.service.ts", "loader.ts"],
  },
];

const extensionRoot = "data/extensions";
const extensionNames = existsSync(extensionRoot)
  ? readdirSync(extensionRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(`${extensionRoot}/${entry.name}/repo/spindle.json`)
      )
      .map((entry) => entry.name)
      .sort()
  : [];

for (const extensionName of extensionNames) {
  const section = graph.nodes.find(
    (node) =>
      node.label === `${extensionName} Extension` &&
      node.source_file === "developer-docs/docs/extension-inventory.md"
  );
  if (!section) fail(`inventory section missing for ${extensionName}`);
  const manifestPath = `${extensionRoot}/${extensionName}/repo/spindle.json`;
  const referencesManifest = links.some((link) => {
    if (
      link.source !== section.id ||
      link.relation !== "guide_references"
    ) {
      return false;
    }
    return graph.nodes.find((node) => node.id === link.target)?.source_file ===
      manifestPath;
  });
  if (!referencesManifest) {
    fail(`${extensionName} inventory section does not reference spindle.json`);
  }
  fixtures.push({
    query: `${extensionName} Extension`,
    expects: [`${extensionName} Extension`],
  });
}

for (const fixture of fixtures) {
  const output = runGraphify([
    "query",
    fixture.query,
    "--budget",
    "2000",
    "--graph",
    graphPath,
  ]);
  for (const expected of fixture.expects) {
    if (!output.includes(expected)) {
      fail(`query "${fixture.query}" did not include "${expected}"`);
    }
  }
}

const report = readFileSync(reportPath, "utf8");
for (const marker of ["\u00c2", "\u00c3", "\u00e2\u0080"]) {
  if (report.includes(marker)) {
    fail(`report contains mojibake marker ${JSON.stringify(marker)}`);
  }
}

for (const required of [
  "## Developer Modification Index",
  "## Report Quality Notes",
  "dirty worktree",
]) {
  if (!report.includes(required)) fail(`report is missing "${required}"`);
}

const guideEdges = links.filter((link) => link.relation === "guide_references");
const routeEdges = links.filter((link) => link.relation === "routes_to");
const aliasEdges = links.filter((link) => link.relation === "aliases");

console.log(
  `[graphify-verify] passed: ${graph.nodes.length} nodes, ${links.length} links, ` +
    `${guideEdges.length} guide references, ${routeEdges.length} guide routes, ` +
    `${aliasEdges.length} aliases, ${fixtures.length} query fixtures`
);
