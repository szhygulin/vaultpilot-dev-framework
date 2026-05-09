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

// Parse the super-agent into ordered H2 sections, each carrying its
// preceding `<!-- run:... -->` sentinel + `## heading` line + body up to
// the next sentinel. Mirrors `parseClaudeMdSections` in src/agent/split.ts
// but skips the sentinel coupling — the super-agent file's preamble +
// section-header structure is what we tokenize against.
//
// Section IDs are opaque, zero-padded ordinals (`s001`..`s122`). Slug-from-
// heading IDs caused two failure modes: (a) Opus reconstructed slugs from
// headings rather than echoing the truncated label, and (b) Opus also
// reconstructed unsuffixed slugs when the parser had disambiguated near-
// duplicate headings with `-2`/`-3` suffixes. Numeric IDs eliminate both
// classes — the model has nothing semantic to regenerate from.
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
  const padWidth = String(matches.length).length;
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : md.length;
    const fullBlock = md.slice(start, end).trimEnd();
    const id = `s${String(i + 1).padStart(padWidth, "0")}`;
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
// <id> — <heading>` where <id> is an opaque ordinal like `s001`. The em-dash
// separator and opaque ID prevent the model from regenerating the ID from
// the heading text — it MUST echo the literal label.
function buildSystemPrompt(sections) {
  const header = `You are evaluating which lessons from a pooled-knowledge "super-agent" file should be kept for a coding agent assigned to ONE specific GitHub issue. Your job: for each numbered Section below, decide whether keeping that lesson would help the assigned coding agent on THIS specific issue, or whether dropping it makes the per-issue agent's prompt cleaner.

The coding agent reads its CLAUDE.md once at dispatch time. Sections that don't apply to this issue's domain, mechanism, or decision class waste prompt context and may bias the agent toward irrelevant patterns. Sections that DO apply are valuable even when the connection is non-obvious — apply judgment, lean toward "drop" only when the section is clearly off-topic.

YOUR OUTPUT — strict JSON, no prose around it, no code fences:

{"selections": [{"sectionId": "<id>", "decision": "keep" | "drop", "reason": "<1 short sentence>"} ... ]}

Rules:
1. The "sectionId" MUST be the literal ordinal (e.g. "s001", "s042") shown in the Section header. Do NOT regenerate or paraphrase the id from the heading text — copy it verbatim.
2. Output one entry per Section in the list below, in the same order. Total entries MUST equal the number of sections in the list. Each sectionId appears EXACTLY ONCE.
3. "decision" is exactly "keep" or "drop". No other strings.
4. "reason" is one short sentence (≤25 words). For "keep", state why it applies to this issue. For "drop", state why it's off-topic.

The Sections (each block is one rule):

`;
  const blocks = sections.map((s) => {
    return `### Section ${s.id} — ${s.heading}\n\n${s.fullBlock}`;
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
  const warnings = [];
  let unknownCount = 0;
  for (const entry of parsed.selections) {
    if (!entry || typeof entry !== "object") {
      warnings.push("non-object entry skipped");
      continue;
    }
    const { sectionId, decision, reason } = entry;
    if (typeof sectionId !== "string" || !expected.has(sectionId)) {
      // Tolerate up to 5 unknown IDs — model occasionally hallucinates one.
      // Beyond 5, the output is structurally wrong and must crash.
      unknownCount++;
      if (unknownCount > 5) {
        throw new Error(`Too many unknown sectionIds in selector output (>${unknownCount}); last: ${sectionId}`);
      }
      warnings.push(`unknown sectionId skipped: ${sectionId}`);
      continue;
    }
    if (seen.has(sectionId)) {
      // Model occasionally repeats a section. First occurrence wins; later
      // ones are dropped with a warning so the selection set stays unique.
      warnings.push(`duplicate sectionId ignored: ${sectionId}`);
      continue;
    }
    if (decision !== "keep" && decision !== "drop") {
      warnings.push(`invalid decision for ${sectionId} (${decision}); defaulting to "keep"`);
      seen.add(sectionId);
      validated.push({
        sectionId,
        decision: "keep",
        reason: typeof reason === "string" ? reason.slice(0, 240) : "(invalid decision; defaulted to keep)",
      });
      continue;
    }
    seen.add(sectionId);
    validated.push({
      sectionId,
      decision,
      reason: typeof reason === "string" ? reason.slice(0, 240) : "",
    });
  }
  // Any missing section is filled in as `keep` by default (conservative —
  // a missing entry indicates the model truncated, not that the section
  // should be dropped).
  for (const id of sectionIds) {
    if (!seen.has(id)) {
      warnings.push(`missing from output; defaulted to keep: ${id}`);
      validated.push({
        sectionId: id,
        decision: "keep",
        reason: "(missing from selector output; defaulted to keep)",
      });
    }
  }
  if (warnings.length > 0) {
    process.stderr.write(`  selector warnings (${warnings.length}): ${warnings.slice(0, 5).join(" | ")}${warnings.length > 5 ? ` (+${warnings.length - 5} more)` : ""}\n`);
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
