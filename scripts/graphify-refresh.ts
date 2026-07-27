import { existsSync, unlinkSync } from "node:fs";

type Step = {
  name: string;
  command: string[];
};

const steps: Step[] = [
  {
    name: "extract source graph",
    command: ["graphify", "update", ".", "--no-cluster"],
  },
  {
    name: "enrich developer guides",
    command: ["bun", "run", "scripts/graphify-enrich-guides.ts"],
  },
  {
    name: "cluster and render graph",
    command: ["graphify", "cluster-only", ".", "--no-label"],
  },
  {
    name: "curate graph report",
    command: ["bun", "run", "scripts/graphify-curate-report.ts"],
  },
  {
    name: "verify graph",
    command: ["bun", "run", "scripts/graphify-verify.ts"],
  },
];

const startedAt = performance.now();
const htmlPath = "graphify-out/graph.html";

if (existsSync(htmlPath)) {
  unlinkSync(htmlPath);
  console.log("[graphify-refresh] removed stale graph.html before rendering");
}

for (const step of steps) {
  console.log(`[graphify-refresh] ${step.name}`);
  const result = Bun.spawnSync({
    cmd: step.command,
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    console.error(
      `[graphify-refresh] failed during "${step.name}" with exit code ${result.exitCode}`
    );
    process.exit(result.exitCode);
  }
}

const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
console.log(`[graphify-refresh] complete in ${seconds}s`);
