#!/usr/bin/env node
// Super-agent tailored arm — Phase B: mint per-issue tailored agents.
//
// Reads selections.json (from select-rules.cjs) + super-agent file. For
// each issue, writes a per-issue CLAUDE.md = concatenation of `keep`
// sections in their original source order, and registers
// `agent-super-tailored-<issueId>` in state/agents-registry.json.
//
// Snapshots agents-registry.json before mutation (defense in depth, per
// prose-baseline §11). Idempotent: re-running on the same selections
// produces byte-identical CLAUDE.mds.
//
// Usage:
//   node research/curve-redo-bundle/super-agent-tailored/build-tailored-agents.cjs \
//     --super-agent  research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md \
//     --selections   research/curve-redo-data/super-agent-tailored/selections.json \
//     --out-dir      research/curve-redo-data/super-agent-tailored
//     [--no-mint]                # render CLAUDE.mds only, skip registry mutation
//
// Reads built dist/ — run `npm run build` first.

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--no-mint") { args["no-mint"] = true; continue; }
    if (k.startsWith("--") && i + 1 < argv.length) {
      args[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function slugify(heading) {
  const base = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 80) : "section";
}

const SECTION_BOUNDARY =
  /(<!--\s*run:[^\n]*-->)\s*\n##\s+([^\n]+)\n/g;

function parseSuperAgentSections(md) {
  const matches = [];
  for (const m of md.matchAll(SECTION_BOUNDARY)) {
    matches.push({ start: m.index, sentinel: m[1], heading: m[2].trim() });
  }
  if (matches.length === 0) {
    throw new Error("No sentinel-tagged H2 sections found in super-agent file.");
  }
  const sections = [];
  const taken = new Map();
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : md.length;
    const fullBlock = md.slice(start, end).replace(/\s+$/, "");
    let id = slugify(matches[i].heading);
    const seen = taken.get(id) ?? 0;
    if (seen > 0) id = `${id}-${seen + 1}`;
    taken.set(slugify(matches[i].heading), seen + 1);
    sections.push({ id, heading: matches[i].heading, fullBlock });
  }
  return sections;
}

async function main() {
  const args = parseArgs();
  const required = ["super-agent", "selections", "out-dir"];
  for (const r of required) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { mutateRegistry, ensureAgent } = require(path.join(distRoot, "state", "registry.js"));
  const { agentClaudeMdPath, agentDir } = require(path.join(distRoot, "agent", "specialization.js"));

  const superMd = fs.readFileSync(path.resolve(args["super-agent"]), "utf-8");
  const sections = parseSuperAgentSections(superMd);
  const sectionsById = new Map(sections.map((s) => [s.id, s]));
  process.stderr.write(`Parsed ${sections.length} sections from super-agent file.\n`);

  const selectionsRaw = JSON.parse(fs.readFileSync(path.resolve(args.selections), "utf-8"));
  const byIssueId = selectionsRaw.byIssueId ?? {};
  const issueIds = Object.keys(byIssueId).map(Number).sort((a, b) => a - b);
  if (issueIds.length === 0) {
    process.stderr.write("No issues in selections.json — nothing to mint.\n");
    process.exit(0);
  }
  process.stderr.write(`Selections cover ${issueIds.length} issue(s): ${issueIds.join(", ")}\n`);

  const outDir = path.resolve(args["out-dir"]);
  fs.mkdirSync(outDir, { recursive: true });
  const sizesPath = path.join(outDir, "sizes.json");

  // Snapshot the registry before any mutation. Mirrors the prose-baseline
  // §11 defense — recoverable if the run goes sideways.
  const registryPath = path.join(repoRoot, "state", "agents-registry.json");
  const snapshotPath = path.join(repoRoot, "state", "agents-registry.snapshot-pre-tailored.json");
  if (fs.existsSync(registryPath) && !fs.existsSync(snapshotPath)) {
    fs.copyFileSync(registryPath, snapshotPath);
    process.stderr.write(`Registry snapshotted to ${snapshotPath}\n`);
  } else if (fs.existsSync(snapshotPath)) {
    process.stderr.write(`Snapshot already exists at ${snapshotPath} (idempotent skip).\n`);
  } else {
    process.stderr.write(`No registry at ${registryPath} yet — minting will create it.\n`);
  }

  const sizes = [];
  const renderedByIssueId = new Map();

  for (const issueId of issueIds) {
    const sel = byIssueId[String(issueId)];
    const keepIds = sel.selections.filter((s) => s.decision === "keep").map((s) => s.sectionId);
    const keepIdSet = new Set(keepIds);
    const keptInOrder = sections.filter((s) => keepIdSet.has(s.id));
    const missingIds = keepIds.filter((id) => !sectionsById.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `Issue #${issueId}: selections reference unknown sectionIds: ${missingIds.join(", ")}`,
      );
    }

    const header = [
      `# Tailored CLAUDE.md for issue #${issueId} (${sel.repo})`,
      ``,
      `Built by \`research/curve-redo-bundle/super-agent-tailored/build-tailored-agents.cjs\`.`,
      `Source: \`research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md\` (${sections.length} sections).`,
      `Selector: ${sel.model}; kept ${keptInOrder.length}/${sections.length} sections.`,
      ``,
    ].join("\n");

    const body = keptInOrder.map((s) => s.fullBlock).join("\n\n");
    const claudeMd = keptInOrder.length === 0 ? header + "\n_(All sections dropped by the selector for this issue.)_\n" : `${header}\n${body}\n`;

    renderedByIssueId.set(issueId, { agentId: `agent-super-tailored-${issueId}`, claudeMd, keptInOrder });

    sizes.push({
      issueId,
      sectionsKept: keptInOrder.length,
      sectionsTotal: sections.length,
      bytesKept: claudeMd.length,
      keepRatio: keptInOrder.length / sections.length,
    });
  }

  // Mint registry entries first so `agentDir()` is consistent with state.
  if (!args["no-mint"]) {
    await mutateRegistry((reg) => {
      for (const issueId of issueIds) {
        const agentId = `agent-super-tailored-${issueId}`;
        const rec = ensureAgent(reg, agentId);
        rec.tags = ["super-agent-tailored", `issue-${issueId}`];
        rec.lastActiveAt = new Date().toISOString();
      }
    });
    process.stderr.write(`Minted ${issueIds.length} agent record(s) in registry.\n`);
  } else {
    process.stderr.write(`--no-mint: skipping registry mutation.\n`);
  }

  // Write per-issue CLAUDE.mds.
  for (const issueId of issueIds) {
    const { agentId, claudeMd } = renderedByIssueId.get(issueId);
    const dir = agentDir(agentId);
    fs.mkdirSync(dir, { recursive: true });
    const claudePath = agentClaudeMdPath(agentId);
    fs.writeFileSync(claudePath, claudeMd);
  }

  fs.writeFileSync(sizesPath, JSON.stringify({ generatedAt: new Date().toISOString(), sectionsTotal: sections.length, sizes }, null, 2));

  process.stderr.write(`\nSize distribution (sorted by bytes asc):\n`);
  const sorted = [...sizes].sort((a, b) => a.bytesKept - b.bytesKept);
  for (const s of sorted) {
    process.stderr.write(
      `  #${s.issueId}: ${s.sectionsKept}/${s.sectionsTotal} sections, ${s.bytesKept} bytes (${(s.keepRatio * 100).toFixed(1)}%)\n`,
    );
  }
  process.stderr.write(`\nSizes written to ${sizesPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
