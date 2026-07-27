import { readFileSync, writeFileSync } from "node:fs";

const reportPath = "graphify-out/GRAPH_REPORT.md";
let report = readFileSync(reportPath, "utf8").replace(/\r\n/g, "\n");

const mojibakeReplacements: Array<[string, string]> = [
  ["\u00c3\u0082\u00c2\u00b7", " | "],
  ["\u00c2\u00b7", " | "],
  ["\u00e2\u0080\u0094", "-"],
  ["\u00e2\u0080\u0093", "-"],
  ["\u00e2\u0086\u0092", "->"],
  ["\u00e2\u0089\u00a4", "<="],
];

for (const [broken, replacement] of mojibakeReplacements) {
  report = report.replaceAll(broken, replacement);
}

const communityMatch = report.match(
  /- \d+ nodes .*? \d+ edges .*? (\d+) communities/
);
const communityCount = communityMatch?.[1] ?? "many";
const gapMatch = report.match(/- \*\*(\d+) isolated node/);
const isolatedCount = gapMatch?.[1] ?? "many";

report = report.replace(
  /\n## Community Hubs \(Navigation\)\n[\s\S]*?(?=\n## God Nodes)/,
  ""
);

report = report.replace(
  /\n## Developer Modification Index\n[\s\S]*?(?=\n## God Nodes)/,
  ""
);

report = report.replace(
  /\n## Hyperedges \(group relationships\)\n[\s\S]*?(?=\n## Communities)/,
  "\n\n## Hyperedges\n- Detailed document-section hyperedges are available in `graph.json`; omitted here to keep the report navigable.\n"
);

const insertion = `
## Developer Modification Index

- Frontend behavior and extension creation:
  [Frontend and Extension Editing Map](../developer-docs/docs/frontend-and-extensions.md)
- Every installed extension:
  [Installed Extension Inventory](../developer-docs/docs/extension-inventory.md)
- Settings, themes, CSS, component overrides, and layout:
  [Settings to CSS Map](../developer-docs/docs/settings-to-css-map.md)
- Backend APIs, migrations, events, jobs, and Spindle capabilities:
  [Backend Modification Map](../developer-docs/docs/backend-modification-map.md)

Use specific workflow anchors:

\`\`\`bash
graphify query "Change Any Frontend Feature"
graphify query "Edit Frontend Feature Workflow"
graphify query "Create Extension Workflow"
graphify query "Add Persisted Setting Workflow"
graphify query "Edit Custom CSS Workflow"
graphify query "Add Backend API Workflow"
graphify query "Add Spindle Capability Workflow"
graphify query "auto_retry Extension"
\`\`\`

## Report Quality Notes

- The graph is structurally useful, but ${communityCount} communities are too
  many for linear manual browsing. Start from the modification index or a
  specific query.
- Community labels remain numeric because no semantic LLM backend was used.
  Numeric communities are an audit surface, not the primary developer index.
- Broad questions containing generic terms such as \`add\`, \`any\`, \`setting\`,
  or \`behavior\` can resolve to common symbols. Use the workflow labels above.
- The recorded commit identifies the checked-out revision, but it does not
  detect dirty worktree changes. Run \`bun run graphify:refresh\` after edits.
- ${isolatedCount} low-degree nodes indicate a mix of legitimate leaves,
  duplicate/common symbol names, and missing semantic cross-file edges.
- Inferred "surprising connections" to generic symbols such as \`fetch()\`
  require source verification before they are treated as architecture facts.
- Import-cycle entries involving one file or same-named modules can be symbol
  normalization false positives; confirm the actual import statement.
- Guide sections are deterministically linked to the source files they describe
  by \`scripts/graphify-enrich-guides.ts\`.
- \`EXTRACTED\` guide links are deterministic documentation relationships;
  \`INFERRED\` links remain hypotheses that require source verification.
`;

report = report.replace(
  /(\n## Graph Freshness\n[\s\S]*?)(?=\n## God Nodes)/,
  `$1\n${insertion}`
);

writeFileSync(reportPath, report);
console.log("[graphify-curate-report] curated GRAPH_REPORT.md");
