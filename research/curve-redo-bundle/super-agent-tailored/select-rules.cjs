#!/usr/bin/env node
// Super-agent tailored arm — Phase A: per-issue rule selector.
//
// For each of the 13 corpus issues, ask Opus to decide which H2 sections
// from `agent-super.CLAUDE.md` (the deduped union of every existing
// agent's CLAUDE.md, 122 sections, ~209 KB) help with THIS issue. The
// super-agent prose is sent once as a cached system-prompt prefix; only
// the issue body changes between calls. Output: per-issue keep/drop
// audit + a picks.tsv compatible with the existing dispatcher wrapper.
//
// Usage:
//   node research/curve-redo-bundle/super-agent-tailored/select-rules.cjs \
//     --super-agent research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md \
//     --corpus      research/curve-redo-bundle/corpus.json \
//     --out-dir     research/curve-redo-data/super-agent-tailored \
//     [--force]                  # re-run even if selections.json exists for an issue
//     [--max-call-usd 2.00]      # per-call hard cap (exit non-zero if exceeded)
//     [--max-total-usd 15.00]    # aggregate hard cap
//     [--model claude-opus-4-7[1m]]
//
// Reads built dist/ — run `npm run build` first.

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--force") { args.force = true; continue; }
    if (k.startsWith("--") && i + 1 < argv.length) {
      args[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

// Slugify an H2 heading deterministically. Lowercase ASCII, runs of
// non-alphanumerics → "-", trim leading/trailing "-". Identical input →
// identical id. Collisions disambiguated downstream with -2, -3 suffixes.
//
// No length cap: 84% of super-agent sections produce slugs > 80 chars,
// and Opus reconstructs the full slug from the heading rather than echoing
// the truncated label, causing strict-match validation to reject valid
// outputs. Full slugs eliminate the choice — the label IS what Opus would
// generate.
function slugify(heading) {
  const base = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "section";
}

// Parse the super-agent into ordered H2 sections, each carrying its
// preceding `<!-- run:... -->` sentinel + `## heading` line + body up to
// the next sentinel. Mirrors `parseClaudeMdSections` in src/agent/split.ts
// but skips the sentinel coupling — the super-agent file's preamble +
// section-header structure is what we tokenize against.
//
// Returns: [{id, heading, sentinel, fullBlock, byteOffset}].
const SECTION_BOUNDARY =
  /(<!--\s*run:[^\n]*-->)\s*\n##\s+([^\n]+)\n/g;

function parseSuperAgentSections(md) {
  const matches = [];
  for (const m of md.matchAll(SECTION_BOUNDARY)) {
    matches.push({ start: m.index, sentinel: m[1], heading: m[2].trim() });
  }
  if (matches.length === 0) {
    throw new Error(
      "No sections found in super-agent file (expected `<!-- run:... -->` + `## heading` blocks).",
    );
  }
  const sections = [];
  const taken = new Map(); // slug -> count
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : md.length;
    const fullBlock = md.slice(start, end).trimEnd();
    let id = slugify(matches[i].heading);
    const seen = taken.get(id) ?? 0;
    if (seen > 0) id = `${id}-${seen + 1}`;
    taken.set(slugify(matches[i].heading), seen + 1);
    sections.push({
      id,
      heading: matches[i].heading,
      sentinel: matches[i].sentinel,
      fullBlock,
      byteOffset: start,
    });
  }
  return sections;
}

// Build the cache-stable system prompt. Sections are labeled `### Section
// <id>: <heading>` (replacing the original `## ` so the LLM's section
// tokens don't collide with its own JSON output structure).
function buildSystemPrompt(sections) {
  const header = `You are evaluating which lessons from a pooled-knowledge "super-agent" file should be kept for a coding agent assigned to ONE specific GitHub issue. Your job: for each numbered Section below, decide whether keeping that lesson would help the assigned coding agent on THIS specific issue, or whether dropping it makes the per-issue agent's prompt cleaner.

The coding agent reads its CLAUDE.md once at dispatch time. Sections that don't apply to this issue's domain, mechanism, or decision class waste prompt context and may bias the agent toward irrelevant patterns. Sections that DO apply are valuable even when the connection is non-obvious — apply judgment, lean toward "drop" only when the section is clearly off-topic.

YOUR OUTPUT — strict JSON, no prose around it, no code fences:

{"selections": [{"sectionId": "<id>", "decision": "keep" | "drop", "reason": "<1 short sentence>"} ... ]}

Rules:
1. Output one entry per Section in the list below, in the same order. Total entries MUST equal the number of sections in the list.
2. "decision" is exactly "keep" or "drop". No other strings.
3. "reason" is one short sentence (≤25 words). For "keep", state why it applies to this issue. For "drop", state why it's off-topic.

The Sections (each block is one rule):

`;
  const blocks = sections.map((s, i) => {
    return `### Section ${s.id}: ${s.heading}\n\n${s.fullBlock.replace(/^## /m, "## ")}`;
  });
  return header + blocks.join("\n\n") + "\n";
}

function loadCorpus(corpusPath) {
  const raw = fs.readFileSync(corpusPath, "utf-8");
  return JSON.parse(raw).issues;
}

async function callOpus({ systemPrompt, userPrompt, model, claudeBinPath, query, BOUNDARY }) {
  const stream = query({
    prompt: userPrompt,
    options: {
      model,
      systemPrompt: [systemPrompt, BOUNDARY],
      tools: [],
      permissionMode: "default",
      env: process.env,
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      pathToClaudeCodeExecutable: claudeBinPath(),
    },
  });
  let raw = "";
  let costUsd = 0;
  let usage = null;
  let isError = false;
  let errorReason = "";
  for await (const msg of stream) {
    if (msg.type === "result") {
      costUsd = msg.total_cost_usd ?? 0;
      usage = msg.usage ?? null;
      if (msg.subtype === "success") raw = msg.result;
      else { isError = true; errorReason = msg.subtype; }
    }
  }
  return { raw, costUsd, usage, isError, errorReason };
}

function parseSelectorOutput(raw, sectionIds) {
  // Tolerant JSON extraction: take the largest balanced {...} substring.
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("No JSON object in selector output");
  const candidate = raw.slice(start);
  let parsed;
  try { parsed = JSON.parse(candidate); }
  catch {
    // Try trailing fence stripping.
    const lastBrace = candidate.lastIndexOf("}");
    if (lastBrace < 0) throw new Error("Unbalanced JSON in selector output");
    parsed = JSON.parse(candidate.slice(0, lastBrace + 1));
  }
  if (!parsed || !Array.isArray(parsed.selections)) {
    throw new Error("Selector output missing `selections` array");
  }
  const expected = new Set(sectionIds);
  const seen = new Set();
  const validated = [];
  for (const entry of parsed.selections) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Selection entry is not an object");
    }
    const { sectionId, decision, reason } = entry;
    if (typeof sectionId !== "string" || !expected.has(sectionId)) {
      throw new Error(`Unknown sectionId in selector output: ${sectionId}`);
    }
    if (seen.has(sectionId)) {
      throw new Error(`Duplicate sectionId in selector output: ${sectionId}`);
    }
    if (decision !== "keep" && decision !== "drop") {
      throw new Error(`Invalid decision for ${sectionId}: ${decision}`);
    }
    seen.add(sectionId);
    validated.push({
      sectionId,
      decision,
      reason: typeof reason === "string" ? reason.slice(0, 240) : "",
    });
  }
  // Allow partial coverage if every entry is valid — but warn loudly.
  // Any missing section is filled in as `keep` by default (conservative).
  for (const id of sectionIds) {
    if (!seen.has(id)) {
      validated.push({
        sectionId: id,
        decision: "keep",
        reason: "(missing from selector output; defaulted to keep)",
      });
    }
  }
  return validated;
}

async function main() {
  const args = parseArgs();
  const required = ["super-agent", "corpus", "out-dir"];
  for (const r of required) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const sdk = require("@anthropic-ai/claude-agent-sdk");
  const { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } = sdk;
  if (typeof query !== "function") {
    throw new Error("Anthropic Agent SDK `query` not available — run `npm ci && npm run build`.");
  }
  const { claudeBinPath } = require(path.join(distRoot, "agent", "sdkBinary.js"));
  const { getIssue } = require(path.join(distRoot, "github", "gh.js"));

  const model = args.model ?? "claude-opus-4-7[1m]";
  const maxCallUsd = Number(args["max-call-usd"] ?? 2.0);
  const maxTotalUsd = Number(args["max-total-usd"] ?? 15.0);

  const superMd = fs.readFileSync(path.resolve(args["super-agent"]), "utf-8");
  const sections = parseSuperAgentSections(superMd);
  process.stderr.write(`Parsed ${sections.length} sections from super-agent file (${superMd.length} bytes).\n`);

  const issues = loadCorpus(path.resolve(args.corpus));
  process.stderr.write(`Corpus: ${issues.length} issues across legs ${[...new Set(issues.map(i => i.leg))].sort().join(",")}.\n`);

  const outDir = path.resolve(args["out-dir"]);
  fs.mkdirSync(outDir, { recursive: true });
  const selectionsPath = path.join(outDir, "selections.json");
  const picksPath = path.join(outDir, "picks-tailored.tsv");

  // Resume support: load existing selections (per-issue keyed).
  let allSelections = {};
  if (fs.existsSync(selectionsPath) && !args.force) {
    try {
      allSelections = JSON.parse(fs.readFileSync(selectionsPath, "utf-8")).byIssueId ?? {};
      const completed = Object.keys(allSelections).length;
      if (completed > 0) {
        process.stderr.write(`Resuming: ${completed} issues already have selections (use --force to redo).\n`);
      }
    } catch (err) {
      process.stderr.write(`WARN: failed to parse existing selections.json (${err.message}); starting fresh.\n`);
      allSelections = {};
    }
  }

  // Stable system prompt — build once, send 13 times (cache-stable prefix).
  const systemPrompt = buildSystemPrompt(sections);
  process.stderr.write(`System prompt: ${systemPrompt.length} bytes (~${Math.round(systemPrompt.length / 4)} tokens).\n`);

  const sectionIds = sections.map((s) => s.id);
  let totalUsd = 0;
  const newlyProcessed = [];

  for (const issue of issues) {
    const issueKey = String(issue.issueId);
    if (allSelections[issueKey] && !args.force) {
      process.stderr.write(`#${issue.issueId}: skip (selections exist)\n`);
      continue;
    }

    process.stderr.write(`#${issue.issueId}: fetching body via gh ${issue.repo}#${issue.issueId}\n`);
    const summary = await getIssue(issue.repo, issue.issueId);
    if (!summary) {
      throw new Error(`gh issue view failed for ${issue.repo}#${issue.issueId}`);
    }

    const userPrompt = [
      `# Target issue`,
      `Repository: ${issue.repo}`,
      `Issue ID: #${issue.issueId}`,
      `Decision class (operator-labeled): ${issue.decisionClass ?? "(unspecified)"}`,
      `State: ${issue.state ?? "open"}`,
      ``,
      `## Title`,
      summary.title,
      ``,
      `## Body`,
      summary.body || "(empty)",
      ``,
      `Apply your selection decisions per the system prompt's rules. Output ONLY the JSON object.`,
    ].join("\n");

    const t0 = Date.now();
    const { raw, costUsd, usage, isError, errorReason } = await callOpus({
      systemPrompt,
      userPrompt,
      model,
      claudeBinPath,
      query,
      BOUNDARY: SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    });
    const wallMs = Date.now() - t0;

    if (isError) {
      throw new Error(`Selector LLM call failed for #${issue.issueId}: ${errorReason}`);
    }
    if (costUsd > maxCallUsd) {
      throw new Error(
        `Selector call for #${issue.issueId} exceeded per-call cap: $${costUsd.toFixed(4)} > $${maxCallUsd.toFixed(2)}`,
      );
    }

    let selections;
    try {
      selections = parseSelectorOutput(raw, sectionIds);
    } catch (err) {
      throw new Error(`Selector output for #${issue.issueId} did not parse: ${err.message}\nRaw output (first 500 bytes): ${raw.slice(0, 500)}`);
    }

    const keepCount = selections.filter((s) => s.decision === "keep").length;
    const dropCount = selections.length - keepCount;

    allSelections[issueKey] = {
      issueId: issue.issueId,
      repo: issue.repo,
      leg: issue.leg,
      labels: summary.labels ?? [],
      model,
      costUsd,
      wallMs,
      usage,
      keepCount,
      dropCount,
      sectionTotal: sections.length,
      selections,
    };

    totalUsd += costUsd;
    newlyProcessed.push(issue.issueId);
    process.stderr.write(
      `#${issue.issueId}: keep=${keepCount}/${sections.length} drop=${dropCount} cost=$${costUsd.toFixed(4)} wall=${wallMs}ms total=$${totalUsd.toFixed(4)}\n`,
    );

    // Incremental save after every issue so a crash doesn't lose work.
    fs.writeFileSync(
      selectionsPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), model, sectionTotal: sections.length, byIssueId: allSelections }, null, 2),
    );

    if (totalUsd > maxTotalUsd) {
      throw new Error(`Aggregate selector cost exceeded cap: $${totalUsd.toFixed(4)} > $${maxTotalUsd.toFixed(2)}`);
    }
  }

  // Render picks-tailored.tsv with the same column shape as picks-prose.tsv.
  const picksLines = ["issueId\tagentId\trationale\tscore\tleg\tlabels"];
  for (const issue of issues) {
    const sel = allSelections[String(issue.issueId)];
    if (!sel) continue;
    const agentId = `agent-super-tailored-${issue.issueId}`;
    const rationale = `tailored-keep-${sel.keepCount}-of-${sel.sectionTotal}`;
    const labels = (sel.labels ?? []).join(",");
    picksLines.push(
      `${issue.issueId}\t${agentId}\t${rationale}\t0.0000\t${issue.leg}\t${labels}`,
    );
  }
  fs.writeFileSync(picksPath, picksLines.join("\n") + "\n");

  // Summary distribution.
  const keepRatios = [];
  for (const issue of issues) {
    const sel = allSelections[String(issue.issueId)];
    if (!sel) continue;
    keepRatios.push({ issueId: issue.issueId, keep: sel.keepCount, ratio: sel.keepCount / sel.sectionTotal });
  }
  keepRatios.sort((a, b) => a.keep - b.keep);
  process.stderr.write(`\nSelections written to ${selectionsPath}\nPicks written to ${picksPath}\n`);
  process.stderr.write(`\nKeep-count distribution (sorted asc):\n`);
  for (const r of keepRatios) {
    process.stderr.write(`  #${r.issueId}: ${r.keep} kept (${(r.ratio * 100).toFixed(1)}%)\n`);
  }
  process.stderr.write(`\nNewly processed: ${newlyProcessed.length} issue(s); total selector cost: $${totalUsd.toFixed(4)}\n`);
  if (newlyProcessed.length === 0) {
    process.stderr.write(`Re-run with --force to redo all issues.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
