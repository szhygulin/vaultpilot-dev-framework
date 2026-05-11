#!/usr/bin/env node
// Super-agent tailored arm — Phase A v2: TWO-PASS selector.
//
// Pass 1: score every one of the 122 super-agent sections on a 0..100
//   applicability scale for the target issue. Output ALL 122 entries.
// Pass 2 (adversarial): for sections in the borderline band (score 31..69
//   inclusive), force the model to argue keep-or-drop with concrete
//   justification, defaulting to KEEP when ambiguous. Auto-keep score ≥70,
//   auto-drop score ≤30, so Pass 2 only sees the genuine uncertainty band.
//
// The two-pass design tests whether the v1 single-pass selector lost signal
// to lenient over-selection on cross-cutting issues (#565 kept 37 sections,
// #574 kept 28) and over-aggressive drops on losses (#186 -13.67 dQ, #156
// -10.00). Auto-decisions on the extremes cut Pass 2's surface to the band
// where the model can do meaningful work; defaulting to keep when Pass 2 is
// ambiguous matches the empirical finding that false-negative drops cost
// more (judge/tests A vs B r=0.486 — the two scoring components capture
// independent signal, so dropping a section that helps B but not A loses).
//
// Section IDs are opaque ordinals (`s001`..`sNNN`) — same numbering scheme
// as `select-rules.cjs::parseSuperAgentSections` (must match for the minter
// to resolve picks).
//
// Compression: `--compress` strips `<!-- promote-candidate:* -->` annotations
// from the section blocks before BOTH the selector input and the minter
// output. Selector sees what the agent will see — symmetric.
//
// Usage:
//   node score-and-review-rules.cjs \
//     --super-agent research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md \
//     --corpus      research/curve-redo-bundle/corpus.json \
//     --out-dir     research/curve-redo-data/super-agent-tailored-v2 \
//     [--compress]                # strip promote-candidate from sections
//     [--force]                   # ignore existing selections.json
//     [--parallel 1]              # issues concurrent after warm-up
//     [--max-call-usd 2.00]
//     [--max-total-usd 15.00]
//     [--model claude-opus-4-7[1m]]

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--force") { args.force = true; continue; }
    if (k === "--compress") { args.compress = true; continue; }
    if (k.startsWith("--") && i + 1 < argv.length) {
      args[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const SECTION_BOUNDARY = /(<!--\s*run:[^\n]*-->)\s*\n##\s+([^\n]+)\n/g;

function stripPromoteCandidates(s) {
  return s.replace(/<!--\s*promote-candidate:[^>]*-->\s*[\s\S]*?(?=<!--\s*run:|$)/g, "");
}

function parseSuperAgentSections(md, { compress }) {
  const matches = [];
  for (const m of md.matchAll(SECTION_BOUNDARY)) {
    matches.push({ start: m.index, sentinel: m[1], heading: m[2].trim() });
  }
  if (matches.length === 0) {
    throw new Error("No sentinel-tagged H2 sections found in super-agent file.");
  }
  const sections = [];
  const padWidth = String(matches.length).length;
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : md.length;
    let fullBlock = md.slice(start, end).trimEnd();
    if (compress) fullBlock = stripPromoteCandidates(fullBlock).trimEnd();
    const id = `s${String(i + 1).padStart(padWidth, "0")}`;
    sections.push({ id, heading: matches[i].heading, fullBlock });
  }
  return sections;
}

// Pass-1 system prompt — score every section 0..100.
function buildScorePrompt(sections) {
  const header = `You are evaluating which lessons from a pooled-knowledge "super-agent" file should be kept for a coding agent assigned to ONE specific GitHub issue. Your job: score every numbered Section below on a 0..100 applicability scale for THIS issue.

The coding agent reads its CLAUDE.md once at dispatch time. Sections that don't apply to the issue's domain, mechanism, or decision class waste prompt context. Sections that DO apply are valuable even when the connection is non-obvious.

Scoring rubric:
- 90-100: directly applicable; this is THE canonical rule for this issue's pattern.
- 70-89:  applicable; the rule clearly extends to this issue's domain/mechanism.
- 50-69:  borderline; the rule might apply or might just be tangentially related — uncertain.
- 30-49:  weak link; the rule mentions adjacent vocabulary but doesn't change the agent's behavior here.
- 0-29:   clearly irrelevant; off-domain, off-mechanism, or off-decision-class.

YOUR OUTPUT — strict JSON, no prose around it, no code fences:

{"scores": [{"sectionId": "<id>", "score": <0-100 integer>, "rationale": "<≤20 words>"} ...]}

Rules:
1. The "sectionId" MUST be the literal ordinal (e.g. "s001", "s042") shown in the Section header. Do NOT regenerate or paraphrase the id from the heading text — copy it verbatim.
2. Output one entry per Section in the list below, in the same order. Total entries MUST equal the number of sections in the list. Each sectionId appears EXACTLY ONCE.
3. "score" is an integer 0..100.
4. "rationale" is ≤20 words explaining the score.

The Sections (each block is one rule):

`;
  const blocks = sections.map((s) => `### Section ${s.id} — ${s.heading}\n\n${s.fullBlock}`);
  return header + blocks.join("\n\n") + "\n";
}

// Pass-2 system prompt — adversarial review of borderline band. Sent fresh
// per issue (the borderline set is small enough that caching doesn't help).
function buildReviewPrompt() {
  return `You are the ADVERSARIAL REVIEWER for the per-issue super-agent rule selector. A prior scoring pass marked the sections below as BORDERLINE (score 31..69) for THIS issue — neither clearly applicable nor clearly off-topic. Your job: for each borderline section, decide keep-or-drop.

The bias is conservative: when in doubt, KEEP. False-positive keeps cost a small amount of prompt context; false-negative drops cost the agent a rule it needed. Drop ONLY when you can articulate a concrete reason — "this rule's TELLS fail to match this issue's TELLS" or "this rule's HOW TO APPLY targets a different code path than the one this issue changes" or similar mechanism-level mismatch.

YOUR OUTPUT — strict JSON, no prose around it, no code fences:

{"reviewed": [{"sectionId": "<id>", "decision": "keep" | "drop", "justification": "<≤25 words>"} ...]}

Rules:
1. "sectionId" MUST be the literal ordinal echoed verbatim.
2. Output one entry per borderline section in the list, in the same order, no duplicates, no omissions.
3. "decision" is exactly "keep" or "drop".
4. "justification": for "keep", state what makes it applicable. For "drop", state the concrete mechanism mismatch.
5. If you cannot articulate a concrete drop reason, decide KEEP.

The borderline sections (each block is the section the prior pass scored 31-69):

`;
}

function buildReviewUserPrompt(issue, summary, borderline) {
  return [
    `# Target issue`,
    `Repository: ${issue.repo}`,
    `Issue ID: #${issue.issueId}`,
    `Decision class: ${issue.decisionClass ?? "(unspecified)"}`,
    ``,
    `## Title`,
    summary.title,
    ``,
    `## Body`,
    summary.body || "(empty)",
    ``,
    `## Borderline sections (with their Pass-1 score and rationale):`,
    ...borderline.map((b) => `\n### Section ${b.id} — ${b.heading}\n_Pass-1 score: ${b.score} — ${b.rationale}_\n\n${b.fullBlock}\n`),
    ``,
    `Apply your adversarial review per the system prompt's rules. Output ONLY the JSON object.`,
  ].join("\n");
}

function loadCorpus(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8")).issues;
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
  let raw = "", costUsd = 0, usage = null, isError = false, errorReason = "";
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

function parseScoreOutput(raw, sectionIds) {
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("No JSON object in score output");
  const candidate = raw.slice(start);
  let parsed;
  try { parsed = JSON.parse(candidate); }
  catch {
    const lastBrace = candidate.lastIndexOf("}");
    if (lastBrace < 0) throw new Error("Unbalanced JSON in score output");
    parsed = JSON.parse(candidate.slice(0, lastBrace + 1));
  }
  if (!parsed || !Array.isArray(parsed.scores)) {
    throw new Error("Score output missing `scores` array");
  }
  const expected = new Set(sectionIds);
  const seen = new Set();
  const out = [];
  const warnings = [];
  let unknownCount = 0;
  for (const entry of parsed.scores) {
    if (!entry || typeof entry !== "object") { warnings.push("non-object entry"); continue; }
    const { sectionId, score, rationale } = entry;
    if (typeof sectionId !== "string" || !expected.has(sectionId)) {
      unknownCount++;
      if (unknownCount > 5) throw new Error(`Too many unknown sectionIds (>${unknownCount}); last: ${sectionId}`);
      warnings.push(`unknown sectionId: ${sectionId}`);
      continue;
    }
    if (seen.has(sectionId)) { warnings.push(`duplicate: ${sectionId}`); continue; }
    const s = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : 50;
    seen.add(sectionId);
    out.push({ sectionId, score: s, rationale: typeof rationale === "string" ? rationale.slice(0, 200) : "" });
  }
  // Default missing entries to neutral (score 50 → goes to Pass 2).
  for (const id of sectionIds) {
    if (!seen.has(id)) {
      warnings.push(`missing; defaulted to score=50: ${id}`);
      out.push({ sectionId: id, score: 50, rationale: "(missing from Pass 1; defaulted to borderline)" });
    }
  }
  if (warnings.length) {
    process.stderr.write(`  Pass-1 warnings (${warnings.length}): ${warnings.slice(0, 3).join(" | ")}${warnings.length > 3 ? ` (+${warnings.length - 3})` : ""}\n`);
  }
  return out;
}

function parseReviewOutput(raw, borderlineIds) {
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("No JSON object in review output");
  const candidate = raw.slice(start);
  let parsed;
  try { parsed = JSON.parse(candidate); }
  catch {
    const lastBrace = candidate.lastIndexOf("}");
    if (lastBrace < 0) throw new Error("Unbalanced JSON in review output");
    parsed = JSON.parse(candidate.slice(0, lastBrace + 1));
  }
  if (!parsed || !Array.isArray(parsed.reviewed)) {
    throw new Error("Review output missing `reviewed` array");
  }
  const expected = new Set(borderlineIds);
  const seen = new Set();
  const out = [];
  const warnings = [];
  for (const entry of parsed.reviewed) {
    if (!entry || typeof entry !== "object") continue;
    const { sectionId, decision, justification } = entry;
    if (typeof sectionId !== "string" || !expected.has(sectionId)) {
      warnings.push(`unknown borderline sectionId: ${sectionId}`);
      continue;
    }
    if (seen.has(sectionId)) { warnings.push(`duplicate review: ${sectionId}`); continue; }
    if (decision !== "keep" && decision !== "drop") {
      warnings.push(`invalid review decision (${decision}) for ${sectionId}; defaulting to keep`);
      seen.add(sectionId);
      out.push({ sectionId, decision: "keep", justification: typeof justification === "string" ? justification.slice(0, 250) : "(invalid decision; defaulted to keep)" });
      continue;
    }
    seen.add(sectionId);
    out.push({ sectionId, decision, justification: typeof justification === "string" ? justification.slice(0, 250) : "" });
  }
  // Default missing borderline IDs to keep (the conservative bias the
  // adversarial-review prompt asks for).
  for (const id of borderlineIds) {
    if (!seen.has(id)) {
      warnings.push(`missing from review; defaulted to keep: ${id}`);
      out.push({ sectionId: id, decision: "keep", justification: "(missing from review; defaulted to keep)" });
    }
  }
  if (warnings.length) {
    process.stderr.write(`  Pass-2 warnings (${warnings.length}): ${warnings.slice(0, 3).join(" | ")}${warnings.length > 3 ? ` (+${warnings.length - 3})` : ""}\n`);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const required = ["super-agent", "corpus", "out-dir"];
  for (const r of required) {
    if (!args[r]) { process.stderr.write(`Missing --${r}\n`); process.exit(1); }
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
  const parallel = Math.max(1, Math.floor(Number(args.parallel ?? 1)));
  const compress = !!args.compress;

  const superMdRaw = fs.readFileSync(path.resolve(args["super-agent"]), "utf-8");
  const sections = parseSuperAgentSections(superMdRaw, { compress });
  process.stderr.write(`Parsed ${sections.length} sections (${compress ? "compressed" : "raw"}; total ${sections.reduce((s,c)=>s+c.fullBlock.length,0)} bytes).\n`);

  const issues = loadCorpus(path.resolve(args.corpus));
  process.stderr.write(`Corpus: ${issues.length} issues.\n`);

  const outDir = path.resolve(args["out-dir"]);
  fs.mkdirSync(outDir, { recursive: true });
  const selectionsPath = path.join(outDir, "selections.json");
  const picksPath = path.join(outDir, "picks-tailored.tsv");

  let allSelections = {};
  if (fs.existsSync(selectionsPath) && !args.force) {
    try {
      allSelections = JSON.parse(fs.readFileSync(selectionsPath, "utf-8")).byIssueId ?? {};
      const completed = Object.keys(allSelections).length;
      if (completed > 0) process.stderr.write(`Resuming: ${completed} issues already have selections.\n`);
    } catch (err) {
      process.stderr.write(`WARN: failed to parse existing selections.json (${err.message}); starting fresh.\n`);
      allSelections = {};
    }
  }

  const scorePrompt = buildScorePrompt(sections);
  const reviewPrompt = buildReviewPrompt();
  process.stderr.write(`Score prompt: ${scorePrompt.length} bytes (~${Math.round(scorePrompt.length / 4)} tokens).\n`);

  const sectionIds = sections.map((s) => s.id);
  const sectionsById = new Map(sections.map((s) => [s.id, s]));
  let totalUsd = 0;
  const newlyProcessed = [];

  const pending = [];
  for (const issue of issues) {
    const key = String(issue.issueId);
    if (allSelections[key] && !args.force) {
      process.stderr.write(`#${issue.issueId}: skip (selections exist)\n`);
    } else pending.push(issue);
  }

  async function processIssue(issue) {
    process.stderr.write(`#${issue.issueId}: fetching body\n`);
    const summary = await getIssue(issue.repo, issue.issueId);
    if (!summary) throw new Error(`gh issue view failed for ${issue.repo}#${issue.issueId}`);

    // ---- Pass 1: score every section ----
    const userPrompt1 = [
      `# Target issue`,
      `Repository: ${issue.repo}`,
      `Issue ID: #${issue.issueId}`,
      `Decision class: ${issue.decisionClass ?? "(unspecified)"}`,
      `State: ${issue.state ?? "open"}`,
      ``,
      `## Title`,
      summary.title,
      ``,
      `## Body`,
      summary.body || "(empty)",
      ``,
      `Apply your scoring per the system prompt's rules. Output ONLY the JSON object with all ${sections.length} entries.`,
    ].join("\n");

    const t0 = Date.now();
    const { raw: raw1, costUsd: cost1, usage: usage1, isError: err1, errorReason: er1 } = await callOpus({
      systemPrompt: scorePrompt, userPrompt: userPrompt1, model, claudeBinPath, query,
      BOUNDARY: SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    });
    const wall1 = Date.now() - t0;
    if (err1) throw new Error(`Pass-1 call failed for #${issue.issueId}: ${er1}`);
    if (cost1 > maxCallUsd) throw new Error(`Pass-1 for #${issue.issueId} exceeded per-call cap: $${cost1.toFixed(4)} > $${maxCallUsd}`);
    let scores;
    try { scores = parseScoreOutput(raw1, sectionIds); }
    catch (err) { throw new Error(`Pass-1 parse failed for #${issue.issueId}: ${err.message}\nRaw (first 500): ${raw1.slice(0, 500)}`); }

    // ---- Categorize ----
    const autoKeep = scores.filter((s) => s.score >= 70);
    const autoDrop = scores.filter((s) => s.score <= 30);
    const borderlineScores = scores.filter((s) => s.score > 30 && s.score < 70);
    process.stderr.write(`#${issue.issueId}: Pass-1 done — autoKeep=${autoKeep.length}, borderline=${borderlineScores.length}, autoDrop=${autoDrop.length} ($${cost1.toFixed(4)}, ${wall1}ms)\n`);

    // ---- Pass 2: adversarial review of borderline only ----
    let pass2Decisions = [];
    let cost2 = 0, wall2 = 0, usage2 = null;
    if (borderlineScores.length > 0) {
      const borderlineFull = borderlineScores.map((b) => {
        const s = sectionsById.get(b.sectionId);
        return { id: b.sectionId, heading: s.heading, score: b.score, rationale: b.rationale, fullBlock: s.fullBlock };
      });
      const userPrompt2 = buildReviewUserPrompt(issue, summary, borderlineFull);

      const t2 = Date.now();
      const { raw: raw2, costUsd: c2, usage: u2, isError: err2, errorReason: er2 } = await callOpus({
        systemPrompt: reviewPrompt, userPrompt: userPrompt2, model, claudeBinPath, query,
        BOUNDARY: SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
      });
      wall2 = Date.now() - t2;
      cost2 = c2;
      usage2 = u2;
      if (err2) throw new Error(`Pass-2 call failed for #${issue.issueId}: ${er2}`);
      if (cost2 > maxCallUsd) throw new Error(`Pass-2 for #${issue.issueId} exceeded per-call cap: $${cost2.toFixed(4)} > $${maxCallUsd}`);

      const borderlineIds = borderlineScores.map((b) => b.sectionId);
      try { pass2Decisions = parseReviewOutput(raw2, borderlineIds); }
      catch (err) { throw new Error(`Pass-2 parse failed for #${issue.issueId}: ${err.message}\nRaw (first 500): ${raw2.slice(0, 500)}`); }
    }
    const pass2ById = new Map(pass2Decisions.map((d) => [d.sectionId, d]));

    // ---- Merge: final decisions in source order ----
    const merged = scores.map((s) => {
      if (s.score >= 70) {
        return { sectionId: s.sectionId, decision: "keep", source: "auto-keep", score: s.score, rationale: s.rationale };
      }
      if (s.score <= 30) {
        return { sectionId: s.sectionId, decision: "drop", source: "auto-drop", score: s.score, rationale: s.rationale };
      }
      const r = pass2ById.get(s.sectionId);
      return {
        sectionId: s.sectionId,
        decision: r?.decision ?? "keep",
        source: "pass2-review",
        score: s.score,
        rationale: s.rationale,
        justification: r?.justification ?? "(no review; defaulted to keep)",
      };
    });
    const keepCount = merged.filter((m) => m.decision === "keep").length;
    const dropCount = merged.length - keepCount;

    allSelections[String(issue.issueId)] = {
      issueId: issue.issueId,
      repo: issue.repo,
      leg: issue.leg,
      labels: summary.labels ?? [],
      model,
      compress,
      pass1: { costUsd: cost1, wallMs: wall1, usage: usage1, autoKeep: autoKeep.length, autoDrop: autoDrop.length, borderline: borderlineScores.length },
      pass2: { costUsd: cost2, wallMs: wall2, usage: usage2 },
      totalCostUsd: cost1 + cost2,
      keepCount,
      dropCount,
      sectionTotal: sections.length,
      selections: merged,
    };
    return { issueId: issue.issueId, costUsd: cost1 + cost2, keepCount, dropCount, autoKeep: autoKeep.length, autoDrop: autoDrop.length, borderline: borderlineScores.length, wallMs: wall1 + wall2 };
  }

  function persist() {
    fs.writeFileSync(selectionsPath, JSON.stringify({ generatedAt: new Date().toISOString(), model, compress, sectionTotal: sections.length, byIssueId: allSelections }, null, 2));
  }

  function recordResult(r) {
    totalUsd += r.costUsd;
    newlyProcessed.push(r.issueId);
    process.stderr.write(`#${r.issueId}: FINAL keep=${r.keepCount}/${sections.length} drop=${r.dropCount} (autoK=${r.autoKeep} autoD=${r.autoDrop} border=${r.borderline}) cost=$${r.costUsd.toFixed(4)} wall=${r.wallMs}ms total=$${totalUsd.toFixed(4)}\n`);
    if (totalUsd > maxTotalUsd) throw new Error(`Aggregate cost exceeded cap: $${totalUsd.toFixed(4)} > $${maxTotalUsd}`);
  }

  if (pending.length > 0) {
    const head = pending[0];
    process.stderr.write(parallel > 1 ? `Warm-up call (1/${pending.length})\n` : `Sequential (${pending.length} issues)\n`);
    recordResult(await processIssue(head));
    persist();

    const tail = pending.slice(1);
    if (parallel > 1 && tail.length > 0) {
      process.stderr.write(`Parallel batches of ${parallel} for ${tail.length} remaining issue(s).\n`);
    }
    for (let i = 0; i < tail.length; i += parallel) {
      const batch = tail.slice(i, i + parallel);
      const results = await Promise.allSettled(batch.map((issue) => processIssue(issue)));
      const failures = [];
      for (const r of results) {
        if (r.status === "fulfilled") recordResult(r.value);
        else failures.push(r.reason);
      }
      persist();
      if (failures.length > 0) {
        const msg = failures.map((e) => (e && e.message) || String(e)).join("\n---\n");
        throw new Error(`Parallel batch failed (${failures.length}/${batch.length}):\n${msg}`);
      }
    }
  }

  // Render picks-tailored.tsv.
  const picksLines = ["issueId\tagentId\trationale\tscore\tleg\tlabels"];
  for (const issue of issues) {
    const sel = allSelections[String(issue.issueId)];
    if (!sel) continue;
    const agentId = `agent-super-tailored-v2-${issue.issueId}`;
    const rationale = `tailored-v2-keep-${sel.keepCount}-of-${sel.sectionTotal}`;
    const labels = (sel.labels ?? []).join(",");
    picksLines.push(`${issue.issueId}\t${agentId}\t${rationale}\t0.0000\t${issue.leg}\t${labels}`);
  }
  fs.writeFileSync(picksPath, picksLines.join("\n") + "\n");

  // Summary
  const keepRatios = [];
  for (const issue of issues) {
    const sel = allSelections[String(issue.issueId)];
    if (!sel) continue;
    keepRatios.push({ issueId: issue.issueId, keep: sel.keepCount, ratio: sel.keepCount / sel.sectionTotal, autoK: sel.pass1.autoKeep, autoD: sel.pass1.autoDrop, border: sel.pass1.borderline });
  }
  keepRatios.sort((a, b) => a.keep - b.keep);
  process.stderr.write(`\nSelections: ${selectionsPath}\nPicks:       ${picksPath}\n`);
  process.stderr.write(`\nFinal keep-count distribution (autoK / borderline / autoD breakdown):\n`);
  for (const r of keepRatios) {
    process.stderr.write(`  #${r.issueId}: ${r.keep} kept (${(r.ratio * 100).toFixed(1)}%)  | autoK=${r.autoK} border=${r.border} autoD=${r.autoD}\n`);
  }
  process.stderr.write(`\nNewly processed: ${newlyProcessed.length} issue(s); total: $${totalUsd.toFixed(4)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
