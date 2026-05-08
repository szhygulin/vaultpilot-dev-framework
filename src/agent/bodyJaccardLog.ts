// Phase A instrumentation for #201: log body-Jaccard scores between every
// pending promote-candidate and the existing sections of the relevant
// CLAUDE.md so Phase B threshold tuning has ~30d of data to fit against.
//
// Phase A is observed-not-enforced — this module only emits JSONL events;
// it does not influence accept/reject decisions in `cmdLessonsReview`.
// Caller wraps every invocation in try/catch (fail-soft), so a logging
// failure cannot block the operator-facing review flow.
//
// Comparison shape: candidate-body tokens vs. section-body tokens. This is
// distinct from `extractCitedStableIds` (candidate-(heading+tags+body) vs
// section-heading) and `checkLessonNovelty` (heading vs heading); Phase B
// will decide which signal to gate on. Same `tokenize`/`jaccard` helpers
// reused from `lessonUtility.ts` so threshold-tuning data stays comparable.

import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";
import { STATE_DIR } from "../state/runState.js";
import { parseClaudeMdSections } from "./split.js";
import { tokenize, jaccard } from "../state/lessonUtility.js";
import { sharedLessonsPath, type LessonTier } from "./sharedLessons.js";

/** Absolute path to the append-only JSONL log of body-Jaccard observations. */
export const BODY_JACCARD_LOG_PATH = path.join(
  STATE_DIR,
  "lesson-body-jaccard.jsonl",
);

export interface BodyJaccardScore {
  /** Highest Jaccard score across every section in the comparand CLAUDE.md. */
  maxScore: number;
  /**
   * `sectionId` (`s0`, `s1`, ...) of the section that produced `maxScore`,
   * or `null` when no sections were compared (empty CLAUDE.md path).
   */
  matchedSectionId: string | null;
  /** Number of sections enumerated in the comparand. */
  sectionsCompared: number;
}

/**
 * Compare a candidate body against every existing section in the supplied
 * CLAUDE.md content. Pure / synchronous so tests can exercise it without I/O.
 *
 * Empty CLAUDE.md (or no parseable sections) returns `maxScore: 0,
 * sectionsCompared: 0, matchedSectionId: null` — required by issue #239's
 * "empty-result path emits zero" acceptance criterion (per CLAUDE.md
 * "smoke-test the empty-result path before merging").
 */
export function computeBodyJaccardScore(input: {
  candidateBody: string;
  claudeMd: string;
}): BodyJaccardScore {
  const sections = parseClaudeMdSections(input.claudeMd);
  if (sections.length === 0) {
    return { maxScore: 0, matchedSectionId: null, sectionsCompared: 0 };
  }
  const candidateTokens = tokenize(input.candidateBody);
  let maxScore = 0;
  let matchedSectionId: string | null = null;
  for (const section of sections) {
    const sectionTokens = tokenize(section.body);
    const score = jaccard(candidateTokens, sectionTokens);
    if (score > maxScore) {
      maxScore = score;
      matchedSectionId = section.sectionId;
    }
  }
  return { maxScore, matchedSectionId, sectionsCompared: sections.length };
}

/**
 * Resolve the comparand CLAUDE.md for a given (tier, domain) pair.
 *   - target tier: project-root `./CLAUDE.md` (cwd-relative).
 *   - global tier: `~/.vaultpilot/shared-lessons/<domain>.md` (or its
 *     XDG-overridden equivalent).
 *
 * Missing files resolve to an empty string so the caller's
 * `computeBodyJaccardScore` produces the documented zero-shape record.
 */
export async function loadComparandClaudeMd(
  tier: LessonTier,
  domain: string,
): Promise<string> {
  const filePath =
    tier === "target"
      ? path.resolve(process.cwd(), "CLAUDE.md")
      : sharedLessonsPath(tier, domain);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export interface BodyJaccardLogLine extends BodyJaccardScore {
  ts: string;
  event: "lesson.body_jaccard";
  candidateAgentId: string;
  candidateDomain: string;
  tier: LessonTier;
}

export interface AppendOptions {
  /**
   * Override the destination file. Tests use this so each test writes to a
   * unique path and cleans up without contention. Production callers leave
   * unset to land in `state/lesson-body-jaccard.jsonl`.
   */
  filePath?: string;
}

/**
 * Append one observation line to the body-Jaccard JSONL log. Uses the same
 * lock helper as the rest of `state/` so concurrent reviewers don't tear
 * lines.
 */
export async function appendBodyJaccardLogLine(
  line: BodyJaccardLogLine,
  options: AppendOptions = {},
): Promise<void> {
  const filePath = options.filePath ?? BODY_JACCARD_LOG_PATH;
  await ensureDir(path.dirname(filePath));
  await withFileLock(filePath, async () => {
    await fs.appendFile(filePath, JSON.stringify(line) + "\n");
  });
}
