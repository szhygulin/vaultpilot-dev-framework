#!/usr/bin/env node
// Aggressive diff filter — keep ONLY actual implementation/test code files.
// Drops .claude/worktrees/, research/, feature-plans/, docs/, *.md, *.json (except package.json).
// Caps output at MAX_BYTES bytes; further blocks are dropped (still produces valid patch).

const fs = require("node:fs");

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error("usage: strict-filter-diff.cjs <in> <out>"); process.exit(2); }

const MAX_BYTES = 350_000; // ~85K tokens, leaves room for system+issue+output

function shouldKeep(filePath) {
  // Drop noise directories
  if (filePath.startsWith(".claude/")) return false;
  if (filePath.startsWith("research/")) return false;
  if (filePath.startsWith("feature-plans/")) return false;
  if (filePath.startsWith("docs/")) return false;
  if (filePath.startsWith("agents/")) return false;
  if (filePath.startsWith("state/")) return false;
  if (filePath.startsWith("logs/")) return false;
  if (filePath.startsWith("dist/")) return false;
  if (filePath.startsWith("node_modules/")) return false;
  if (filePath.startsWith(".github/")) return false;
  // Drop noise files
  if (filePath.endsWith(".md")) return false;
  if (filePath === "package-lock.json") return false;
  if (filePath === "pnpm-lock.yaml") return false;
  if (filePath === ".gitignore") return false;
  if (filePath === ".npmrc") return false;
  // Drop binaries / archives
  if (/\.(tar|tgz|zip|png|jpg|jpeg|gif|pdf|lock)(\.gz)?$/.test(filePath)) return false;
  // Keep src/, test/, bin/, package.json, tsconfig*, *.ts, *.js, *.tsx, *.json (excluded above for noise specifics)
  return true;
}

const input = fs.readFileSync(inPath, "utf8");
const blocks = input.split(/(?=^diff --git )/m).filter(b => b.length > 0);

const kept = [];
let bytes = 0;
let droppedSize = 0;
let droppedFilter = 0;
let droppedBudget = 0;

for (const block of blocks) {
  const m = /^diff --git a\/(\S+) b\/\S+/m.exec(block);
  if (!m) continue;
  const filePath = m[1];
  if (!shouldKeep(filePath)) { droppedFilter++; continue; }
  if (bytes + block.length > MAX_BYTES) { droppedBudget++; droppedSize += block.length; continue; }
  kept.push(block);
  bytes += block.length;
}

fs.writeFileSync(outPath, kept.join(""));
process.stderr.write(`kept=${kept.length} droppedFilter=${droppedFilter} droppedBudget=${droppedBudget} (lost=${droppedSize}b) outBytes=${bytes}\n`);
