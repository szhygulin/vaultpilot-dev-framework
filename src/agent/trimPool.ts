// LLM-driven trim of a shared-lesson pool that has hit `MAX_POOL_LINES`.
//
// Flow (`vp-dev lessons trim <domain>`):
//   1. Parse the pool file into header + indexed entries.
//   2. Send the entries to a sonnet model with a "rank by lasting signal"
//      prompt; receive `{verdicts: [{entryIndex, verdict, rationale}, ...]}`.
//   3. Surface the proposal to the human (interactive y/N or `--yes`); on
//      accept, rewrite the pool keeping `keep` entries (and `maybe` unless
//      `--drop-maybes`).
//
// The trim model NEVER mutates entry text — it only proposes verdicts.
// Per-entry length caps are enforced at promotion time
// (`validateEntry` in `promotionMarkers.ts`) and trim cannot expand
// entries because it doesn't rewrite them.
//
// Boundary preservation: trim is an explicit, human-driven CLI operation.
// `acceptCandidate()`'s 200-line cap rejection still fires — trim is a
// separate user-driven escape hatch, not an automatic one.

import { promises as fs } from "node:fs";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { withFileLock } from "../state/locks.js";
import { MAX_POOL_LINES, sharedLessonsPath } from "./sharedLessons.js";
import {
  MAX_ENTRY_CHARS,
  MAX_ENTRY_LINES,
  isValidDomain,
} from "../util/promotionMarkers.js";
import type { Logger } from "../log/logger.js";

const TRIM_MODEL = "claude-sonnet-4-6";

// Matches the entry sentinel emitted by `formatEntryBlock` in
// `sharedLessons.ts`. Domain-source-issueId-ts triple uniquely keys an entry
// across re-parses (used for drift-tolerant apply).
const ENTRY_MARKER_RE =
  /^<!--\s*entry source:(\S+)\s+issue:#(\d+)\s+ts:(\S+)\s*-->\s*$/;

export interface PoolEntry {
  /** 0-based index within `PoolFile.entries`, in pool order. */
  index: number;
  source: string;
  issueId: number;
  ts: string;
  /** Body lines joined with `\n`, with any trailing newline(s) stripped. */
  body: string;
  startLine: number;
  endLine: number;
}

export interface PoolFile {
  domain: string;
  /** Everything before the first entry marker, verbatim. */
  header: string;
  entries: PoolEntry[];
  totalLines: number;
}

export type TrimVerdictKind = "keep" | "maybe" | "drop";

export interface TrimVerdict {
  entryIndex: number;
  verdict: TrimVerdictKind;
  rationale: string;
}

export interface TrimProposal {
  domain: string;
  filePath: string;
  totalEntries: number;
  totalLines: number;
  /** One verdict per entry (missing model verdicts default to `keep`). */
  verdicts: TrimVerdict[];
}

const TrimPayloadSchema = z.object({
  verdicts: z
    .array(
      z.object({
        entryIndex: z.number().int().nonnegative(),
        verdict: z.enum(["keep", "maybe", "drop"]),
        rationale: z.string().min(1).max(500),
      }),
    )
    .min(1),
});

/**
 * Parse a pool file's content into header + entries. Any line matching
 * the entry sentinel begins a new entry; the body runs from the line
 * after the sentinel up to (exclusive) the next sentinel or EOF.
 */
export function parsePool(domain: string, content: string): PoolFile {
  if (!isValidDomain(domain)) {
    throw new Error(
      `Invalid domain '${domain}': expected lowercase dash-separated tag.`,
    );
  }
  const lines = content.split("\n");
  const starts: { line: number; source: string; issueId: number; ts: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ENTRY_MARKER_RE);
    if (m) starts.push({ line: i, source: m[1], issueId: Number(m[2]), ts: m[3] });
  }
  const headerEnd = starts.length > 0 ? starts[0].line : lines.length;
  const header = lines.slice(0, headerEnd).join("\n");
  const entries: PoolEntry[] = [];
  for (let k = 0; k < starts.length; k++) {
    const cur = starts[k];
    const next = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    // Strip trailing newlines: the last entry's slice may include the file's
    // trailing empty-string element (from `split("\n")` on a `\n`-terminated
    // file), giving the last entry a phantom trailing `\n` that middle
    // entries don't have. Stripping makes body semantics symmetric.
    const body = lines.slice(cur.line + 1, next).join("\n").replace(/\n+$/, "");
    entries.push({
      index: k,
      source: cur.source,
      issueId: cur.issueId,
      ts: cur.ts,
      body,
      startLine: cur.line,
      endLine: next - 1,
    });
  }
  return { domain, header, entries, totalLines: lines.length };
}

/**
 * Re-emit a pool given a (possibly trimmed) entry list. Header is
 * normalized to end with `\n\n`; entries are stacked back-to-back to
 * match the format produced by `appendLessonToPool`.
 */
export function emitPool(file: PoolFile, kept: PoolEntry[]): string {
  const headerNorm = file.header.replace(/\n*$/, "") + "\n\n";
  const blocks = kept
    .map(
      (e) =>
        `<!-- entry source:${e.source} issue:#${e.issueId} ts:${e.ts} -->\n${e.body.replace(/\n*$/, "")}\n`,
    )
    .join("");
  return headerNorm + blocks;
}

/**
 * Compute the kept-entry subset implied by a verdict list. By default,
 * `keep` and `maybe` are kept; `dropMaybes:true` drops `maybe` too.
 * Entries with no matching verdict are kept (conservative default).
 */
export function selectKeptEntries(
  file: PoolFile,
  verdicts: TrimVerdict[],
  opts?: { dropMaybes?: boolean },
): PoolEntry[] {
  const dropMaybes = !!opts?.dropMaybes;
  const drop = new Set<number>();
  for (const v of verdicts) {
    if (v.verdict === "drop") drop.add(v.entryIndex);
    else if (v.verdict === "maybe" && dropMaybes) drop.add(v.entryIndex);
  }
  return file.entries.filter((e) => !drop.has(e.index));
}

export function buildTrimSystemPrompt(): string {
  return `You are a curation agent for cross-agent shared-lesson pools. A domain pool has hit its line cap (target: under ${MAX_POOL_LINES} lines). Your job is to rank each entry by lasting signal value so the human reviewer can drop low-value entries.

For each entry, choose exactly one verdict:
- "keep" — high-signal, broadly applicable to sibling agents, durable observation.
- "maybe" — narrow scope, partially obsolete, or duplicative of another entry but not strictly redundant.
- "drop" — superseded by a newer entry, redundant, or a one-off implementation detail with no transfer value.

Tie-breaking: when content overlaps, prefer the newer entry (later \`ts:\` timestamp) and mark the older one "drop" or "maybe".

Each entry is at most ${MAX_ENTRY_LINES} non-empty lines / ${MAX_ENTRY_CHARS} chars by promotion-time validation. Do NOT propose rewrites — verdicts only.

Drop enough entries to bring the kept set below ${MAX_POOL_LINES} non-empty lines. If the pool is already comfortably below the cap, returning all "keep" is acceptable.

Output a single JSON object, no fences, no prose:
  {"verdicts": [{"entryIndex": <0-based>, "verdict": "keep"|"maybe"|"drop", "rationale": "<one short sentence>"}]}

Include exactly one verdict per entry. The schema is mandatory.`;
}

export function buildTrimUserPrompt(file: PoolFile): string {
  const lines: string[] = [];
  lines.push(`Domain: ${file.domain}`);
  lines.push(`Total entries: ${file.entries.length}`);
  lines.push(`Total lines: ${file.totalLines} (cap ${MAX_POOL_LINES})`);
  lines.push("");
  lines.push("Entries (in pool order; ts:<timestamp> indicates promotion time):");
  for (const e of file.entries) {
    lines.push("");
    lines.push(
      `### entry ${e.index}  source=${e.source}  issue=#${e.issueId}  ts=${e.ts}`,
    );
    lines.push(e.body.replace(/\n+$/, ""));
  }
  lines.push("");
  lines.push("Emit verdicts JSON now.");
  return lines.join("\n");
}

export interface ProposeTrimResult {
  proposal: TrimProposal;
  file: PoolFile;
}

export interface ProposeTrimInput {
  domain: string;
  logger?: Logger;
}

export async function proposeTrim(
  input: ProposeTrimInput,
): Promise<ProposeTrimResult> {
  const filePath = sharedLessonsPath("target", input.domain);
  const content = await fs.readFile(filePath, "utf-8");
  const file = parsePool(input.domain, content);
  if (file.entries.length === 0) {
    return {
      file,
      proposal: {
        domain: input.domain,
        filePath,
        totalEntries: 0,
        totalLines: file.totalLines,
        verdicts: [],
      },
    };
  }
  const rawVerdicts = await runTrimQuery({
    domain: input.domain,
    systemPrompt: buildTrimSystemPrompt(),
    userPrompt: buildTrimUserPrompt(file),
    logger: input.logger,
  });
  const verdicts = reconcileVerdicts(file, rawVerdicts);
  return {
    file,
    proposal: {
      domain: input.domain,
      filePath,
      totalEntries: file.entries.length,
      totalLines: file.totalLines,
      verdicts,
    },
  };
}

/**
 * Defensive normalization: drop verdicts pointing at out-of-range or
 * duplicate `entryIndex`, then default any uncovered entry to `keep`.
 * Sorted by entryIndex for stable rendering.
 */
export function reconcileVerdicts(
  file: PoolFile,
  raw: TrimVerdict[],
): TrimVerdict[] {
  const seen = new Set<number>();
  const sane: TrimVerdict[] = [];
  for (const v of raw) {
    if (v.entryIndex < 0 || v.entryIndex >= file.entries.length) continue;
    if (seen.has(v.entryIndex)) continue;
    seen.add(v.entryIndex);
    sane.push(v);
  }
  for (const e of file.entries) {
    if (!seen.has(e.index)) {
      sane.push({
        entryIndex: e.index,
        verdict: "keep",
        rationale: "no verdict from model — defaulting to keep",
      });
    }
  }
  sane.sort((a, b) => a.entryIndex - b.entryIndex);
  return sane;
}

interface RunTrimQueryArgs {
  domain: string;
  systemPrompt: string;
  userPrompt: string;
  logger?: Logger;
}

async function runTrimQuery(args: RunTrimQueryArgs): Promise<TrimVerdict[]> {
  let raw = "";
  const stream = query({
    prompt: args.userPrompt,
    options: {
      model: TRIM_MODEL,
      systemPrompt: args.systemPrompt,
      tools: [],
      permissionMode: "default",
      env: process.env,
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      pathToClaudeCodeExecutable: claudeBinPath(),
    },
  });
  for await (const msg of stream) {
    if (msg.type === "result") {
      if (msg.subtype === "success") raw = msg.result;
      else throw new Error(`trim model failed: ${msg.subtype}`);
    }
  }
  const extracted = parseJsonEnvelope(raw, TrimPayloadSchema);
  if (!extracted.ok) {
    args.logger?.warn("trim.malformed_payload", {
      domain: args.domain,
      error: extracted.error ?? "no envelope",
      raw: raw.slice(0, 4000),
    });
    throw new Error(
      `trim model output not valid: ${extracted.error ?? "no envelope"}`,
    );
  }
  return extracted.value!.verdicts;
}

export interface ApplyTrimInput {
  proposal: TrimProposal;
  /** The PoolFile parsed at propose-time; used as the source-of-truth for
   * which entryIndex maps to which (source, issueId, ts) key. */
  file: PoolFile;
  /** Default false: keep `maybe` entries. */
  dropMaybes?: boolean;
}

export type ApplyTrimResult =
  | {
      kind: "applied";
      filePath: string;
      totalLines: number;
      kept: number;
      dropped: number;
    }
  | {
      kind: "still-over-cap";
      filePath: string;
      totalLines: number;
    };

/**
 * Apply the proposal to the pool file under the per-file lock used by
 * `appendLessonToPool`. Re-reads + re-parses the file under the lock so
 * a concurrent append is reconciled: the drop-set is keyed by
 * `(source, issueId, ts)`, so any entry appended between propose and
 * apply is preserved (treated as keep).
 *
 * Refuses to write if the trimmed pool would still exceed
 * {@link MAX_POOL_LINES} — surfaced back to the CLI to ask the human to
 * trim manually.
 */
export async function applyTrimProposal(
  input: ApplyTrimInput,
): Promise<ApplyTrimResult> {
  const filePath = input.proposal.filePath;
  return withFileLock(filePath, async () => {
    const fresh = await fs.readFile(filePath, "utf-8");
    const file = parsePool(input.proposal.domain, fresh);
    const dropKeys = new Set<string>();
    for (const v of input.proposal.verdicts) {
      const isDrop =
        v.verdict === "drop" || (v.verdict === "maybe" && input.dropMaybes);
      if (!isDrop) continue;
      const e = input.file.entries.find((x) => x.index === v.entryIndex);
      if (e) dropKeys.add(entryKey(e));
    }
    const kept = file.entries.filter((e) => !dropKeys.has(entryKey(e)));
    const next = emitPool(file, kept);
    const nextLines = next.split("\n").length;
    if (nextLines > MAX_POOL_LINES) {
      return { kind: "still-over-cap", totalLines: nextLines, filePath };
    }
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
    return {
      kind: "applied",
      filePath,
      totalLines: nextLines,
      kept: kept.length,
      dropped: file.entries.length - kept.length,
    };
  });
}

function entryKey(e: PoolEntry): string {
  return `${e.source}|${e.issueId}|${e.ts}`;
}

export function formatTrimProposal(
  file: PoolFile,
  proposal: TrimProposal,
  opts?: { dropMaybes?: boolean },
): string {
  const dropMaybes = !!opts?.dropMaybes;
  const kept = selectKeptEntries(file, proposal.verdicts, { dropMaybes });
  const dropped = file.entries.length - kept.length;
  const projectedLines = emitPool(file, kept).split("\n").length;
  const out: string[] = [];
  out.push(
    `Trim proposal for '${proposal.domain}': ${proposal.totalEntries} entries, ${proposal.totalLines}/${MAX_POOL_LINES} lines.`,
  );
  out.push("");
  for (const v of proposal.verdicts) {
    const e = file.entries[v.entryIndex];
    if (!e) continue;
    const tag = v.verdict.toUpperCase().padEnd(5);
    out.push(
      `  [${tag}] entry ${v.entryIndex}  ${e.source} #${e.issueId} ${e.ts}`,
    );
    out.push(`         ${v.rationale}`);
  }
  out.push("");
  out.push(
    `Outcome (dropMaybes=${dropMaybes}): keep ${kept.length} / drop ${dropped} → projected ${projectedLines}/${MAX_POOL_LINES} lines.`,
  );
  return out.join("\n");
}
