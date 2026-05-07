// Pre-dispatch dependency check (issue #185).
//
// Surfaced 2026-05-06: dispatching #180 (Phase 3 advisory, depends on #178)
// alongside #178 (Phase 1 data collection) in the same `vp-dev run` batch
// burned ~$1.50 on a pushback that was inevitable from reading the issue
// body. The harness is the right place to enforce the operator habit
// ("read each issue's Dependencies block before dispatch") — a manual
// scan fails when the dispatch batch is large.
//
// At dispatch planning time (between triage and pickAgents), this module
// scans each candidate issue body for a `## Dependencies` (or alias)
// heading or an inline `Dependencies:` line, extracts `#NNN` references,
// queries the GitHub state of each, and defers any candidate whose
// prerequisite is OPEN, UNKNOWN, or CLOSED-NOT-PLANNED. The override flag
// `--include-blocked` (wired from cli.ts) force-includes deferred issues.
//
// Detection is heuristic and conservative — false-positives (issues that
// *mention* a number without strictly depending on it) are acceptable
// because `--include-blocked` is the escape hatch.
//
// Same-batch deferral: when dependent #180 references prerequisite #178
// and BOTH are in the same dispatch batch, #180 is deferred even though
// #178 is "in this run" — the orchestrator can't wait for #178 to land
// mid-run since merging is operator-driven (per the issue's edge-case
// table). Re-dispatch #180 manually after #178 lands.
//
// Closed-not-planned (wontfix) is treated as blocking: the rule the
// dependent cited may have been abandoned, and the operator should
// re-read the dependent before dispatch.

import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";

const execFile = promisify(execFileCb);

export type DependencyState =
  | "open"
  | "closed-completed"
  | "closed-not-planned"
  | "unknown";

export interface DependencyRef {
  /** Cross-repo prefix when the ref was `owner/repo#N`; undefined → same-repo. */
  repo?: string;
  issueId: number;
}

export interface DependencyVerdict {
  ref: DependencyRef;
  state: DependencyState;
}

export interface DeferredByDependency {
  issue: IssueSummary;
  /** Only the verdicts that triggered the defer (open / unknown / closed-not-planned). */
  blockingVerdicts: DependencyVerdict[];
  /** Single short phrase rendered into the preview, e.g. "depends on open #178 — re-dispatch after #178 lands". */
  reason: string;
}

export interface DependencyCheckResult {
  /** Candidates that pass the check (all dependencies satisfied OR force-included). */
  dispatchIssues: IssueSummary[];
  /** Candidates withheld because at least one dep was open/unknown/closed-not-planned. */
  deferred: DeferredByDependency[];
  /** Issues that would have been deferred but were force-included via `--include-blocked`. */
  forceIncluded: DeferredByDependency[];
}

export interface CheckDependenciesInput {
  /** Default repo for resolving same-repo refs (e.g. "owner/repo"). */
  repo: string;
  /** Triage-passed candidates with their fetched bodies. */
  candidates: { summary: IssueSummary; body: string }[];
  /** When true, defer the deferred set into `forceIncluded` instead. */
  includeBlocked: boolean;
  /** Optional injection for tests; defaults to `fetchExternalDependencyState`. */
  resolveExternalState?: (ref: DependencyRef) => Promise<DependencyState>;
  /** Optional structured logger; the check emits `deps.*` events. */
  logger?: Logger;
}

/**
 * Extract dependency references from an issue body.
 *
 * Two detection paths:
 *   1. Heading-anchored: `## Dependencies` / `## Depends on` /
 *      `## Prerequisites` / `## Blocked by` — refs are scanned from the
 *      heading line until the next `## ` heading or end-of-body.
 *   2. Inline at line-start: lines like `Dependencies: #178` or
 *      `Depends on: #178, #179`. Optional Markdown emphasis / blockquote
 *      leaders (`*Dependencies:* foo`, `> Dependencies: foo`) are accepted.
 *
 * Cross-repo refs (`owner/repo#N`) preserve the `repo` field; same-repo
 * refs leave `repo` undefined. Same-id duplicates across the two detection
 * paths are deduped before return.
 *
 * Pure: no side effects, no I/O. Exported for tests.
 */
export function parseDependencyRefs(body: string): DependencyRef[] {
  if (!body) return [];
  const sections: string[] = [];

  // (1) Heading-anchored sections. The heading regex matches the entire
  // heading line; we slice the body from immediately after the line until
  // the next `## ` (NOT `### ` — sub-sections still belong to the parent)
  // or end-of-body. `gim` flags: g for multi-match, i for case-insensitive
  // heading word, m for line-anchored `^`.
  const headingRe = /^##\s+(?:Dependencies|Depends on|Prerequisites|Blocked by)\b[^\n]*$/gim;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(body)) !== null) {
    const start = hm.index + hm[0].length;
    const rest = body.slice(start);
    // Match `## ` at line-start in the remaining body — but NOT `###` (which
    // does not match `^##\s` because the third `#` blocks the `\s`).
    const next = rest.search(/^##\s/m);
    sections.push(next === -1 ? rest : rest.slice(0, next));
  }

  // (2) Inline lines that start (modulo Markdown emphasis / blockquote
  // leaders) with `Dependencies:` or `Depends on:`. Captured group is
  // the post-colon content of that line.
  const inlineRe = /^[ \t>*_]*(?:Dependencies?|Depends on)\s*:[ \t]*([^\n]+)$/gim;
  let im: RegExpExecArray | null;
  while ((im = inlineRe.exec(body)) !== null) {
    sections.push(im[1] ?? "");
  }

  const refs: DependencyRef[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    extractRefs(section, refs, seen);
  }
  return refs;
}

function extractRefs(
  text: string,
  out: DependencyRef[],
  seen: Set<string>,
): void {
  // `[owner/repo]#N` or `#N`. `[\w.-]+/[\w.-]+` matches `owner/repo` shapes
  // but won't span URL paths (no `:` allowed), so a stray
  // `https://example.com/foo#bar123` doesn't trigger because `https:` has a
  // colon. Same-repo refs leave the repo capture group undefined.
  const refRe = /(?:([\w.-]+\/[\w.-]+))?#(\d{1,5})\b/g;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(text)) !== null) {
    const repo = m[1];
    const issueId = Number.parseInt(m[2], 10);
    if (Number.isNaN(issueId) || issueId <= 0) continue;
    const key = `${repo ?? ""}#${issueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ repo, issueId });
  }
}

/**
 * Resolve a single dependency reference's GitHub state via `gh issue view`.
 *
 * Returns "open" / "closed-completed" / "closed-not-planned" / "unknown".
 * `unknown` covers any failure mode (404, network blip, permissions error,
 * cross-repo we can't read) — the caller treats unknown as blocking by
 * default; the operator overrides via `--include-blocked`.
 *
 * Cross-repo refs use `ref.repo` instead of the default; same-repo refs
 * fall back to `defaultRepo`. No retries — `gh` already retries internally
 * on transient network errors, and the dependency check is best-effort.
 */
export async function fetchExternalDependencyState(
  defaultRepo: string,
  ref: DependencyRef,
): Promise<DependencyState> {
  const repo = ref.repo ?? defaultRepo;
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "issue",
        "view",
        String(ref.issueId),
        "--repo",
        repo,
        "--json",
        "state,stateReason",
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { state?: string; stateReason?: string | null };
    const state = (parsed.state ?? "").toLowerCase();
    if (state === "open") return "open";
    const reason = (parsed.stateReason ?? "").toUpperCase();
    if (reason === "NOT_PLANNED") return "closed-not-planned";
    return "closed-completed";
  } catch {
    return "unknown";
  }
}

/**
 * Run the pre-dispatch dependency check.
 *
 * For each candidate, parse its body for dep refs, resolve each ref's
 * state, and partition the candidate set into:
 *   - `dispatchIssues`: deps satisfied (or force-included)
 *   - `deferred`: at least one blocking dep, NOT force-included
 *   - `forceIncluded`: at least one blocking dep, but `includeBlocked`
 *     was true so the issue still dispatches (with a WARNING line in the
 *     gate)
 *
 * Same-batch optimization: when a ref points at another candidate already
 * in this batch, we treat its state as "open" without a `gh` round-trip
 * (it's open by definition — that's why it's a candidate). State results
 * for cross-batch refs are cached so multiple dependents on the same
 * prerequisite only pay one round-trip.
 *
 * Self-references are filtered (an issue mentioning its own number isn't
 * a dependency).
 */
export async function checkDependencies(
  input: CheckDependenciesInput,
): Promise<DependencyCheckResult> {
  const sameBatchOpenIds = new Set(input.candidates.map((c) => c.summary.id));
  const resolveExternal =
    input.resolveExternalState ??
    ((ref: DependencyRef) => fetchExternalDependencyState(input.repo, ref));

  const stateCache = new Map<string, DependencyState>();
  const refKey = (ref: DependencyRef): string =>
    `${(ref.repo ?? input.repo).toLowerCase()}#${ref.issueId}`;

  const dispatchIssues: IssueSummary[] = [];
  const deferred: DeferredByDependency[] = [];
  const forceIncluded: DeferredByDependency[] = [];

  for (const cand of input.candidates) {
    const refs = parseDependencyRefs(cand.body).filter(
      (r) =>
        // Drop self-references — an issue mentioning its own number is not
        // a dep on itself.
        !(isSameRepo(r, input.repo) && r.issueId === cand.summary.id),
    );
    const blocking: DependencyVerdict[] = [];
    for (const ref of refs) {
      const key = refKey(ref);
      let state: DependencyState;
      if (stateCache.has(key)) {
        state = stateCache.get(key)!;
      } else if (
        isSameRepo(ref, input.repo) &&
        sameBatchOpenIds.has(ref.issueId)
      ) {
        // Same-batch dependent: orchestrator can't wait for it mid-run.
        state = "open";
      } else {
        try {
          state = await resolveExternal(ref);
        } catch {
          state = "unknown";
        }
      }
      stateCache.set(key, state);
      if (
        state === "open" ||
        state === "unknown" ||
        state === "closed-not-planned"
      ) {
        blocking.push({ ref, state });
      }
    }
    if (blocking.length === 0) {
      dispatchIssues.push(cand.summary);
      continue;
    }
    const entry: DeferredByDependency = {
      issue: cand.summary,
      blockingVerdicts: blocking,
      reason: formatBlockingReason(blocking),
    };
    if (input.includeBlocked) {
      forceIncluded.push(entry);
      dispatchIssues.push(cand.summary);
      input.logger?.info("deps.force_included", {
        issueId: cand.summary.id,
        blocking: blocking.map((b) => ({
          ref: refToString(b.ref),
          state: b.state,
        })),
      });
    } else {
      deferred.push(entry);
      input.logger?.info("deps.deferred", {
        issueId: cand.summary.id,
        blocking: blocking.map((b) => ({
          ref: refToString(b.ref),
          state: b.state,
        })),
      });
    }
  }

  return { dispatchIssues, deferred, forceIncluded };
}

function isSameRepo(ref: DependencyRef, repo: string): boolean {
  return !ref.repo || ref.repo.toLowerCase() === repo.toLowerCase();
}

function refToString(ref: DependencyRef): string {
  return ref.repo ? `${ref.repo}#${ref.issueId}` : `#${ref.issueId}`;
}

/**
 * Render the single-line "depends on …" reason rendered in the gate
 * preview. Pure helper exported for tests.
 *
 * Single blocking dep: "depends on open #178 — re-dispatch after #178 lands".
 * Multiple: "depends on open #178, closed-not-planned #200" (no tail —
 * the operator inspects each manually).
 */
export function formatBlockingReason(blocking: DependencyVerdict[]): string {
  if (blocking.length === 0) return "depends on (none)";
  const parts = blocking.map((b) => `${b.state} ${refToString(b.ref)}`);
  if (blocking.length === 1) {
    const v = blocking[0];
    const tail = blockingTail(v);
    return tail ? `depends on ${parts[0]} — ${tail}` : `depends on ${parts[0]}`;
  }
  return `depends on ${parts.join(", ")}`;
}

function blockingTail(v: DependencyVerdict): string | null {
  const ref = refToString(v.ref);
  if (v.state === "open") return `re-dispatch after ${ref} lands`;
  if (v.state === "closed-not-planned") {
    return `re-read this issue — ${ref} closed not_planned`;
  }
  if (v.state === "unknown") return `verify ${ref} state and retry`;
  return null;
}
