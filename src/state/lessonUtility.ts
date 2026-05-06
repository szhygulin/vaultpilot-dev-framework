// Per-section utility-scoring data collection (issue #178, Phase 1 of #177).
//
// Persists five signals per attributable section, updated by the summarizer
// pipeline post-run, used by future Phase 3 (`vp-dev agents assess-claude-md`)
// to produce keep/trim/drop verdicts. Phase 1 ships data collection only; no
// behavior change visible to the operator.
//
// Persistence: `state/lesson-utility-<agentId>.json`. Gitignored, atomic
// writes via the same lock helper used by run-state files.
//
// All write helpers fail-soft: callers wrap them in try/catch and the
// orchestrator's main path is never blocked by a utility-scoring failure.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicWriteJson, STATE_DIR } from "./runState.js";
import { withFileLock } from "./locks.js";
import { parseClaudeMdSections, type ParsedSection } from "../agent/split.js";

export const LESSON_UTILITY_SCHEMA_VERSION = 1;

/** Default Jaccard threshold for the heading/tag-overlap fallback matcher. */
export const DEFAULT_REINFORCEMENT_JACCARD_MIN = 0.6;

/**
 * Default Jaccard threshold for the dedup gate (#179 Phase 1, option G).
 * Stricter than `DEFAULT_REINFORCEMENT_JACCARD_MIN` because dedup says "this
 * candidate IS one of the existing sections — don't append," while
 * reinforcement says "this candidate cites Y — credit Y." Same metric,
 * different decision threshold. Override via `VP_DEV_DEDUP_JACCARD_MIN`.
 */
export const DEFAULT_DEDUP_JACCARD_MIN = 0.85;

export interface SectionUtilityRecord {
  /** Stable ID — sha256(runId + ":" + sorted compound-id token). Survives
   * positional renumbering and body edits. Compact merges synthesize a
   * fresh stable ID via `mergeHistory` mapping. */
  sectionId: string;
  introducedRunId: string;
  introducedAt: string;
  /** Run IDs whose summarizer-emitted block cited this section. Deduped. */
  reinforcementRuns: string[];
  /** Run IDs where this section was cited in a pushback comment. Deduped. */
  pushbackRuns: string[];
  /** Distinct ISO `20XX-XX-XX` dates referenced in the body. Pure-derived. */
  pastIncidentDates: string[];
  lastReinforcedAt?: string;
  /** Updated by a separate sweep (out of scope for #178); defaults to 0. */
  crossReferenceCount: number;
  crossReferenceUpdatedAt?: string;
  /**
   * LLM self-rating at introduction time, in [0, 1] (#179 Phase 2 option B,
   * shipped early as a half-ready-curve probe). Persisted so post-hoc
   * analysis can correlate self-ratings with subsequent
   * `reinforcementRuns.length` / `pushbackRuns.length`. Optional for
   * back-compat with records written before this field existed; absent =
   * the LLM didn't emit a value (older summarizer prompt) or the spawn
   * couldn't parse it.
   */
  predictedUtility?: number;
}

export interface MergeHistoryEntry {
  sourceStableIds: string[];
  mergedStableId: string;
  mergedAt: string;
}

export interface AgentUtilityFile {
  agentId: string;
  schemaVersion: typeof LESSON_UTILITY_SCHEMA_VERSION;
  sections: SectionUtilityRecord[];
  mergeHistory: MergeHistoryEntry[];
}

export function lessonUtilityPath(agentId: string): string {
  return path.join(STATE_DIR, `lesson-utility-${agentId}.json`);
}

/**
 * Derive the stable section ID. For single-issue blocks this is
 * `sha256(runId + ":" + issueId)`. For compacted blocks (issue #162) the
 * compound token is the sorted `#N1+#N2+#N3` string so re-running on the
 * same merged block always produces the same hash.
 */
export function deriveStableSectionId(
  runId: string,
  issueIds: number[],
): string {
  if (issueIds.length === 0) {
    throw new Error("deriveStableSectionId: issueIds must be non-empty");
  }
  const sorted = [...issueIds].sort((a, b) => a - b);
  const token =
    sorted.length === 1
      ? String(sorted[0])
      : sorted.map((n) => `#${n}`).join("+");
  return createHash("sha256").update(`${runId}:${token}`).digest("hex");
}

/** Pure-derived: scrape distinct `20XX-XX-XX` ISO dates from a body. */
export function extractPastIncidentDates(body: string): string[] {
  const matches = body.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  return [...new Set(matches)].sort();
}

export async function loadLessonUtility(
  agentId: string,
): Promise<AgentUtilityFile | null> {
  try {
    const raw = await fs.readFile(lessonUtilityPath(agentId), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentUtilityFile>;
    return normalizeFile(agentId, parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveLessonUtility(file: AgentUtilityFile): Promise<void> {
  const filePath = lessonUtilityPath(file.agentId);
  await withFileLock(filePath, async () => {
    await atomicWriteJson(filePath, file);
  });
}

function normalizeFile(
  agentId: string,
  raw: Partial<AgentUtilityFile>,
): AgentUtilityFile {
  return {
    agentId: raw.agentId ?? agentId,
    schemaVersion: LESSON_UTILITY_SCHEMA_VERSION,
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    mergeHistory: Array.isArray(raw.mergeHistory) ? raw.mergeHistory : [],
  };
}

function emptyFile(agentId: string): AgentUtilityFile {
  return {
    agentId,
    schemaVersion: LESSON_UTILITY_SCHEMA_VERSION,
    sections: [],
    mergeHistory: [],
  };
}

async function mutateFile(
  agentId: string,
  fn: (file: AgentUtilityFile) => void,
): Promise<void> {
  const filePath = lessonUtilityPath(agentId);
  await withFileLock(filePath, async () => {
    let file: AgentUtilityFile;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      file = normalizeFile(agentId, JSON.parse(raw) as Partial<AgentUtilityFile>);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      file = emptyFile(agentId);
    }
    fn(file);
    await atomicWriteJson(filePath, file);
  });
}

export interface RecordIntroductionInput {
  agentId: string;
  runId: string;
  /** Canonical issue ID. */
  issueId: number;
  /** Set on `outcome:compacted` blocks — every source ID. Otherwise omit. */
  issueIds?: number[];
  body: string;
  ts: string;
  /**
   * LLM self-rating from `SummarizerOutput.predictedUtility` (#179 Phase 2
   * option B). Persisted into the new record's `predictedUtility` field
   * for post-hoc correlation with reinforcement / pushback signals.
   * Optional — older summarizer responses don't carry the field.
   */
  predictedUtility?: number;
}

/**
 * Insert a new SectionUtilityRecord for a freshly-appended block. Idempotent:
 * if a record with the same stable ID already exists, only `pastIncidentDates`
 * is refreshed (body may have been hand-edited or compact-merged in between).
 */
export async function recordIntroduction(
  input: RecordIntroductionInput,
): Promise<void> {
  const ids = input.issueIds && input.issueIds.length > 0
    ? input.issueIds
    : [input.issueId];
  const stableId = deriveStableSectionId(input.runId, ids);
  const dates = extractPastIncidentDates(input.body);

  await mutateFile(input.agentId, (file) => {
    const existing = file.sections.find((s) => s.sectionId === stableId);
    if (existing) {
      existing.pastIncidentDates = dates;
      return;
    }
    file.sections.push({
      sectionId: stableId,
      introducedRunId: input.runId,
      introducedAt: input.ts,
      reinforcementRuns: [],
      pushbackRuns: [],
      pastIncidentDates: dates,
      crossReferenceCount: 0,
      ...(input.predictedUtility !== undefined
        ? { predictedUtility: input.predictedUtility }
        : {}),
    });
  });
}

export interface RecordReinforcementInput {
  agentId: string;
  runId: string;
  citedSectionStableIds: string[];
}

/**
 * Append `runId` to the `reinforcementRuns` of each cited section (deduped),
 * and stamp `lastReinforcedAt`. Citing a stable-ID that has no record is a
 * silent no-op — the cited block may not have been an attributable
 * sentinel-prefixed section. No-op when `citedSectionStableIds` is empty.
 */
export async function recordReinforcement(
  input: RecordReinforcementInput,
): Promise<void> {
  if (input.citedSectionStableIds.length === 0) return;
  const ts = new Date().toISOString();
  await mutateFile(input.agentId, (file) => {
    const cited = new Set(input.citedSectionStableIds);
    for (const section of file.sections) {
      if (!cited.has(section.sectionId)) continue;
      if (!section.reinforcementRuns.includes(input.runId)) {
        section.reinforcementRuns.push(input.runId);
      }
      section.lastReinforcedAt = ts;
    }
  });
}

/**
 * Like `recordReinforcement` but writes to `pushbackRuns`.
 */
export async function recordPushback(
  input: RecordReinforcementInput,
): Promise<void> {
  if (input.citedSectionStableIds.length === 0) return;
  const ts = new Date().toISOString();
  await mutateFile(input.agentId, (file) => {
    const cited = new Set(input.citedSectionStableIds);
    for (const section of file.sections) {
      if (!cited.has(section.sectionId)) continue;
      if (!section.pushbackRuns.includes(input.runId)) {
        section.pushbackRuns.push(input.runId);
      }
      section.lastReinforcedAt = ts;
    }
  });
}

export interface RecordMergeHistoryInput {
  agentId: string;
  sourceStableIds: string[];
  mergedStableId: string;
  mergedAt: string;
}

/**
 * Record a compact-merge: the merged section inherits the union of source
 * sections' reinforcement / pushback runs, and a mergeHistory entry is added
 * mapping old → new stable IDs. Source records are preserved (so audits can
 * reconstruct lineage) but the merged record is the live signal carrier.
 */
export async function recordMergeHistory(
  input: RecordMergeHistoryInput,
): Promise<void> {
  if (input.sourceStableIds.length === 0) return;
  await mutateFile(input.agentId, (file) => {
    const sources = file.sections.filter((s) =>
      input.sourceStableIds.includes(s.sectionId),
    );
    const reinforcementUnion = new Set<string>();
    const pushbackUnion = new Set<string>();
    const datesUnion = new Set<string>();
    let earliestIntroducedAt: string | undefined;
    let earliestRunId: string | undefined;
    let lastReinforcedAt: string | undefined;
    for (const s of sources) {
      for (const r of s.reinforcementRuns) reinforcementUnion.add(r);
      for (const r of s.pushbackRuns) pushbackUnion.add(r);
      for (const d of s.pastIncidentDates) datesUnion.add(d);
      if (!earliestIntroducedAt || s.introducedAt < earliestIntroducedAt) {
        earliestIntroducedAt = s.introducedAt;
        earliestRunId = s.introducedRunId;
      }
      if (s.lastReinforcedAt) {
        if (!lastReinforcedAt || s.lastReinforcedAt > lastReinforcedAt) {
          lastReinforcedAt = s.lastReinforcedAt;
        }
      }
    }
    const existing = file.sections.find(
      (s) => s.sectionId === input.mergedStableId,
    );
    if (existing) {
      for (const r of reinforcementUnion) {
        if (!existing.reinforcementRuns.includes(r)) {
          existing.reinforcementRuns.push(r);
        }
      }
      for (const r of pushbackUnion) {
        if (!existing.pushbackRuns.includes(r)) {
          existing.pushbackRuns.push(r);
        }
      }
      const allDates = new Set([...existing.pastIncidentDates, ...datesUnion]);
      existing.pastIncidentDates = [...allDates].sort();
      if (lastReinforcedAt) {
        if (
          !existing.lastReinforcedAt ||
          lastReinforcedAt > existing.lastReinforcedAt
        ) {
          existing.lastReinforcedAt = lastReinforcedAt;
        }
      }
    } else {
      file.sections.push({
        sectionId: input.mergedStableId,
        introducedRunId: earliestRunId ?? "merged",
        introducedAt: earliestIntroducedAt ?? input.mergedAt,
        reinforcementRuns: [...reinforcementUnion],
        pushbackRuns: [...pushbackUnion],
        pastIncidentDates: [...datesUnion].sort(),
        lastReinforcedAt,
        crossReferenceCount: 0,
      });
    }
    file.mergeHistory.push({
      sourceStableIds: [...input.sourceStableIds],
      mergedStableId: input.mergedStableId,
      mergedAt: input.mergedAt,
    });
  });
}

// ---------------------------------------------------------------------------
// Cited-section extraction.
//
// The summarizer's emitted body is a synthesized lesson; agents do not embed
// stable-ID hashes in prose. Realistic extraction order:
//   1. Explicit `s0`/`s1`/... position references (rare but possible — the
//      compactor's prompt can refer to them). These are mapped to stable IDs
//      via the order of `parseClaudeMdSections` over the current CLAUDE.md.
//   2. Jaccard fallback over (heading + tags) tokens. Default ≥ 0.6.
// ---------------------------------------------------------------------------

const POSITION_REF_RE = /\bs(\d+)\b/g;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "this",
  "to", "was", "were", "will", "with", "the", "but", "if", "not", "no", "so",
]);

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (raw.length < 3) continue;
    if (STOP_WORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function sectionTags(_section: ParsedSection): string[] {
  // Sentinel tags aren't carried on ParsedSection — heading + body is what
  // we have. Heading is the strongest signal; body provides backup tokens.
  // Reserved for the future: when ParsedSection grows a `tags` field, lift
  // them here so Jaccard incorporates the sentinel tag fingerprint.
  return [];
}

interface ParsedSectionWithStableId extends ParsedSection {
  stableId: string;
}

function withStableIds(sections: ParsedSection[]): ParsedSectionWithStableId[] {
  return sections.map((s) => {
    const ids = s.issueIds && s.issueIds.length > 0
      ? s.issueIds
      : [s.issueId ?? 0];
    const stableId =
      s.runId && ids[0] !== 0
        ? deriveStableSectionId(s.runId, ids)
        : `unattributable:${s.sectionId}`;
    return { ...s, stableId };
  });
}

export interface ExtractCitedInput {
  /** Body of the just-appended summarizer block (or pushback comment). */
  text: string;
  /** Heading of the same block; used as primary signal in Jaccard fallback. */
  heading?: string;
  /** Tags this issue contributed; OR'd into the Jaccard token set. */
  tags?: string[];
  /** Current contents of the agent's CLAUDE.md. */
  claudeMd: string;
  /** Override for testability; defaults to env / DEFAULT_REINFORCEMENT_JACCARD_MIN. */
  jaccardMin?: number;
  /** Exclude these stable IDs (e.g. the section being introduced). */
  exclude?: Set<string>;
}

export function resolveJaccardMin(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VP_DEV_REINFORCEMENT_JACCARD_MIN;
  if (raw == null || raw === "") return DEFAULT_REINFORCEMENT_JACCARD_MIN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    return DEFAULT_REINFORCEMENT_JACCARD_MIN;
  }
  return n;
}

export function resolveDedupJaccardMin(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VP_DEV_DEDUP_JACCARD_MIN;
  if (raw == null || raw === "") return DEFAULT_DEDUP_JACCARD_MIN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    return DEFAULT_DEDUP_JACCARD_MIN;
  }
  return n;
}

/**
 * Extract stable IDs of sections cited by the given text. Returns a deduped
 * list. Pure / synchronous so tests can exercise it without I/O.
 */
export function extractCitedStableIds(input: ExtractCitedInput): string[] {
  const sections = withStableIds(parseClaudeMdSections(input.claudeMd));
  if (sections.length === 0) return [];
  const exclude = input.exclude ?? new Set<string>();
  const out = new Set<string>();

  // Path 1: explicit `s0`/`s1` position references.
  const positionRefs = new Set<number>();
  for (const m of input.text.matchAll(POSITION_REF_RE)) {
    positionRefs.add(Number(m[1]));
  }
  for (const idx of positionRefs) {
    const section = sections[idx];
    if (!section) continue;
    if (exclude.has(section.stableId)) continue;
    out.add(section.stableId);
  }

  // Path 2: Jaccard over (heading + tags + body-tokens) of the new block
  // versus each prior section's heading.
  const min = input.jaccardMin ?? resolveJaccardMin();
  const newTokens = tokenize(
    [
      input.heading ?? "",
      (input.tags ?? []).join(" "),
      input.text.slice(0, 4096),
    ].join(" "),
  );
  for (const section of sections) {
    if (exclude.has(section.stableId)) continue;
    if (out.has(section.stableId)) continue;
    const sectionTokens = tokenize(
      [section.heading, ...sectionTags(section)].join(" "),
    );
    const score = jaccard(newTokens, sectionTokens);
    if (score >= min) out.add(section.stableId);
  }

  return [...out];
}

// ---------------------------------------------------------------------------
// Dedup gate (#179 Phase 1, option G).
//
// Reuses `extractCitedStableIds` at a stricter threshold (default 0.85 vs
// reinforcement's 0.6). Reinforcement says "candidate cites Y — credit Y";
// dedup says "candidate IS Y — don't append, just credit Y." Same metric,
// different decision.
// ---------------------------------------------------------------------------

export interface CheckLessonNoveltyInput {
  /** Heading of the candidate lesson — the primary signal for dedup. */
  heading: string;
  /**
   * Body of the candidate lesson. Currently unused by `checkLessonNovelty`
   * (heading-only comparison) but accepted for interface symmetry with the
   * rest of the lesson-add pipeline. Reserved for a future hybrid metric.
   */
  body?: string;
  /** Tags this issue contributed. Reserved (see `body`). */
  tags?: string[];
  /** Current contents of the agent's CLAUDE.md. */
  claudeMd: string;
  /** Override threshold; defaults to env or DEFAULT_DEDUP_JACCARD_MIN. */
  jaccardMin?: number;
  /** Exclude these stable IDs from matching (e.g., the candidate's own future ID). */
  exclude?: Set<string>;
}

export type LessonNoveltyResult =
  | { kind: "novel" }
  | { kind: "duplicate"; matchedStableIds: string[] };

/**
 * Check whether a candidate lesson is a near-duplicate of an existing
 * section in the agent's CLAUDE.md. Pure / synchronous so tests can exercise
 * it without I/O.
 *
 * Returns `{kind: "novel"}` if no existing section crosses the dedup
 * threshold, or `{kind: "duplicate", matchedStableIds}` listing every
 * section that did. The caller's responsibility is to decide what to do
 * on duplicate (typical: skip the append + record reinforcement on the
 * matched section instead).
 *
 * Comparison shape: heading-tokens-vs-heading-tokens. This deliberately
 * differs from `extractCitedStableIds` (which compares
 * heading+tags+body-tokens vs heading-only) — that function answers "does
 * this lesson CITE Y?", whereas dedup asks "does this lesson IS Y?". A
 * wide-vs-narrow Jaccard is right for citation but pessimistic for dedup;
 * a narrow-vs-narrow Jaccard captures heading overlap directly.
 */
export function checkLessonNovelty(
  input: CheckLessonNoveltyInput,
): LessonNoveltyResult {
  const min = input.jaccardMin ?? resolveDedupJaccardMin();
  const exclude = input.exclude ?? new Set<string>();
  const sections = withStableIds(parseClaudeMdSections(input.claudeMd));
  if (sections.length === 0) return { kind: "novel" };

  const candidateTokens = tokenize(input.heading);
  const matched: string[] = [];
  for (const section of sections) {
    if (exclude.has(section.stableId)) continue;
    const sectionTokens = tokenize(section.heading);
    if (jaccard(candidateTokens, sectionTokens) >= min) {
      matched.push(section.stableId);
    }
  }
  if (matched.length === 0) return { kind: "novel" };
  return { kind: "duplicate", matchedStableIds: matched };
}

// ---------------------------------------------------------------------------
// Empirical post-hoc prune (#179 Phase 1, option C).
//
// Identifies sections that are eligible for pruning based on the utility
// signals already collected by Phase 1 of #178:
//   - "stale": the section has zero reinforcementRuns AND at least
//     `minSiblingsAfter` other sections have been introduced after it.
//   - "misleading" (bonus J): pushbackRuns.length > reinforcementRuns.length
//     AND the same minSiblingsAfter cool-off applies.
// Cool-off prevents pruning brand-new sections before they have a chance to
// be cited. Default `minSiblingsAfter=10` is conservative; operators can
// pass a smaller value (e.g., 5) when they trust the utility signal.
// ---------------------------------------------------------------------------

export const DEFAULT_PRUNE_MIN_SIBLINGS_AFTER = 10;

export type StaleReason = "zero-reinforcement" | "pushback-dominant";

export interface StaleSection {
  record: SectionUtilityRecord;
  /** Why this section is eligible for pruning. */
  reason: StaleReason;
  /** Number of sections introduced after this one. */
  siblingsIntroducedAfter: number;
}

export interface FindStaleSectionsInput {
  agentId: string;
  /** Override default cool-off; sections need this many later siblings. */
  minSiblingsAfter?: number;
  /** Pre-loaded utility file (for tests); when omitted, we load from disk. */
  fileOverride?: AgentUtilityFile | null;
}

/**
 * Return the subset of an agent's sections that are stale per the rules
 * above. Pure logic (`fileOverride` skips disk I/O for tests).
 */
export async function findStaleSections(
  input: FindStaleSectionsInput,
): Promise<StaleSection[]> {
  const file =
    input.fileOverride !== undefined
      ? input.fileOverride
      : await loadLessonUtility(input.agentId);
  if (!file || file.sections.length === 0) return [];
  const minSiblings =
    input.minSiblingsAfter ?? DEFAULT_PRUNE_MIN_SIBLINGS_AFTER;

  // Compute siblings-after via introducedAt timestamp comparison. Stable
  // under hand-edits (timestamps don't shift) and concurrent-safe under the
  // same atomic-write contract that protects the file.
  const sortedByIntro = [...file.sections].sort((a, b) =>
    a.introducedAt.localeCompare(b.introducedAt),
  );
  const siblingsAfter = new Map<string, number>();
  for (let i = 0; i < sortedByIntro.length; i++) {
    siblingsAfter.set(
      sortedByIntro[i].sectionId,
      sortedByIntro.length - 1 - i,
    );
  }

  const out: StaleSection[] = [];
  for (const r of file.sections) {
    const siblings = siblingsAfter.get(r.sectionId) ?? 0;
    if (siblings < minSiblings) continue;
    if (r.reinforcementRuns.length === 0) {
      out.push({ record: r, reason: "zero-reinforcement", siblingsIntroducedAfter: siblings });
      continue;
    }
    if (r.pushbackRuns.length > r.reinforcementRuns.length) {
      out.push({ record: r, reason: "pushback-dominant", siblingsIntroducedAfter: siblings });
    }
  }
  return out;
}
