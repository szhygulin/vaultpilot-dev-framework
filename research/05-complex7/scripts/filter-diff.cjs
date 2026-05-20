#!/usr/bin/env node
// filter-diff.cjs — strip non-implementation file blocks from a git-format-patch
// style diff. KEEP src/**, test/**, tests/**, bin/**, package.json, tsconfig*.json,
// and any *.ts/*.js/*.tsx outside the strip list. STRIP CLAUDE.md, AGENTS.md,
// ROADMAP.md, README.md, INSTALL.md, CONTRIBUTING.md, Dockerfile, .gitignore,
// .npmrc, .dockerignore, package-lock.json, pnpm-lock.yaml, *.tar.gz,
// research/curve-redo-bundle/**, .github/workflows/*.yml, docs/**.
//
// Splits on `^diff --git ` blocks. Empty result is a valid (no-op) patch.
//
// Usage: node filter-diff.cjs <inDiff> <outDiff>

const fs = require("node:fs");

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: filter-diff.cjs <inDiff> <outDiff>");
  process.exit(2);
}

const STRIP_EXACT = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "ROADMAP.md",
  "README.md",
  "INSTALL.md",
  "CONTRIBUTING.md",
  "Dockerfile",
  ".gitignore",
  ".npmrc",
  ".dockerignore",
  "package-lock.json",
  "pnpm-lock.yaml",
]);

const STRIP_PREFIX = [
  "docs/",
  ".github/workflows/",
  "research/curve-redo-bundle/",
  "research/curve-redo-data/",
  "agents/",
  "state/",
  "logs/",
  "dist/",
  "node_modules/",
];

const STRIP_SUFFIX = [
  ".tar.gz",
  ".tgz",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".pdf",
  ".lock",
];

function shouldStrip(filePath) {
  if (STRIP_EXACT.has(filePath)) return true;
  for (const p of STRIP_PREFIX) if (filePath.startsWith(p)) return true;
  for (const s of STRIP_SUFFIX) if (filePath.endsWith(s)) return true;
  // strip top-level non-source markdown (e.g., MIGRATION.md, NOTES.md)
  if (/^[A-Z][A-Z0-9_-]*\.md$/.test(filePath)) return true;
  return false;
}

function extractFilePath(diffLine) {
  // `diff --git a/<path> b/<path>` — paths may contain spaces; ssh-style
  // diffs use quoting for those. For our corpus the simple regex suffices.
  const m = diffLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!m) return null;
  // Prefer b-side (the post-image path); files moved between blocks have
  // different a/b but the b path is what `git apply` resolves against.
  return m[2];
}

function main() {
  const text = fs.readFileSync(inPath, "utf8");
  const lines = text.split("\n");
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) blocks.push(current);
      current = { headerLine: line, lines: [line] };
    } else {
      if (current) current.lines.push(line);
      // pre-amble before first `diff --git` is discarded — git format-patch
      // headers (commit / author / etc.) aren't needed by `git apply`.
    }
  }
  if (current) blocks.push(current);

  let kept = 0;
  let stripped = 0;
  const keptBlocks = [];
  const strippedPaths = [];
  for (const block of blocks) {
    const filePath = extractFilePath(block.headerLine);
    if (!filePath) {
      // Unparseable block — keep, let git apply complain.
      keptBlocks.push(block);
      kept++;
      continue;
    }
    if (shouldStrip(filePath)) {
      stripped++;
      strippedPaths.push(filePath);
      continue;
    }
    keptBlocks.push(block);
    kept++;
  }

  // Each block's lines are stored without trailing newlines (split() drops them).
  // Re-join each block with "\n" AND ensure each block ends with "\n" so the
  // next block's `diff --git` header starts on a fresh line — otherwise `git
  // apply` sees a malformed patch.
  const out = keptBlocks
    .map((b) => b.lines.join("\n") + (b.lines[b.lines.length - 1] === "" ? "" : "\n"))
    .join("");
  fs.writeFileSync(outPath, out.endsWith("\n") ? out : out + "\n", "utf8");
  console.error(
    `filter-diff: kept=${kept} stripped=${stripped} in=${inPath} out=${outPath}`,
  );
  if (strippedPaths.length > 0) {
    console.error(`  stripped paths:`);
    for (const p of strippedPaths) console.error(`    ${p}`);
  }
}

main();
