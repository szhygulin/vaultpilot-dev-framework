import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { IssueRangeSpec, IssueSummary } from "../types.js";

const execFile = promisify(execFileCb);

interface GhIssueRecord {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
}

interface GhIssueDetailRecord extends GhIssueRecord {
  body: string;
  comments: { author?: { login?: string }; body: string; createdAt: string }[];
}

export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface IssueDetail extends IssueSummary {
  body: string;
  comments: IssueComment[];
}

export async function listOpenIssues(targetRepo: string): Promise<IssueSummary[]> {
  const { stdout } = await execFile(
    "gh",
    [
      "issue",
      "list",
      "--repo",
      targetRepo,
      "--state",
      "open",
      "--limit",
      "1000",
      "--json",
      "number,title,state,labels",
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  const records = JSON.parse(stdout) as GhIssueRecord[];
  return records.map(toSummary);
}

/**
 * Default retry delays (ms) for `getIssue`. Two retries with a 2s/5s backoff —
 * picked to ride out transient GitHub-side 404s / rate-limits / network
 * hiccups without burning more than ~7s on a genuinely-missing issue.
 *
 * Issue #204: the curve-study leg-2 dispatch saw two cells exit `rc=2`
 * with "issue not found" on issues that other cells in the same run had
 * fetched successfully — a brief gh API hiccup. Without retries those
 * cells were silently dropped from the scoring pass; with retries the
 * `rc=2` outcome only fires on issues that genuinely cannot be fetched.
 */
const DEFAULT_GH_ISSUE_VIEW_RETRY_DELAYS_MS = [2000, 5000];

export interface GetIssueOptions {
  /**
   * Per-attempt sleep durations (ms) between retries. The number of
   * delays equals the number of retries; total attempts = `delays.length + 1`.
   * Pass `[]` to disable retries (matches the legacy single-attempt
   * behavior). Defaults to `DEFAULT_GH_ISSUE_VIEW_RETRY_DELAYS_MS`.
   */
  retryDelaysMs?: number[];
  /**
   * Sleep hook. Tests pass a synchronous-resolving stub so the retry
   * loop runs at unit-test speed; production callers leave this unset.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Fired once per retry attempt (after the failure, before the sleep).
   * Optional visibility hook for run-level loggers; the function also
   * writes a one-line breadcrumb to stderr unconditionally.
   */
  onRetry?: (attempt: number, err: unknown) => void;
  /**
   * Test-only override for the underlying `gh issue view` shell-out.
   * Default invokes the real `gh` CLI. Underscored to signal "test seam,
   * do not use from production code".
   */
  _fetch?: (targetRepo: string, number: number) => Promise<GhIssueRecord>;
}

async function fetchIssueRecord(targetRepo: string, number: number): Promise<GhIssueRecord> {
  const { stdout } = await execFile(
    "gh",
    [
      "issue",
      "view",
      String(number),
      "--repo",
      targetRepo,
      "--json",
      "number,title,state,labels",
    ],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as GhIssueRecord;
}

export async function getIssue(
  targetRepo: string,
  number: number,
  opts?: GetIssueOptions,
): Promise<IssueSummary | null> {
  const delays = opts?.retryDelaysMs ?? DEFAULT_GH_ISSUE_VIEW_RETRY_DELAYS_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fetchOnce = opts?._fetch ?? fetchIssueRecord;
  const totalAttempts = delays.length + 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const rec = await fetchOnce(targetRepo, number);
      return toSummary(rec);
    } catch (err) {
      if (attempt >= totalAttempts) return null;
      const delay = delays[attempt - 1];
      opts?.onRetry?.(attempt, err);
      // Operator-visible breadcrumb so a mid-run gh hiccup shows up in
      // the cell log instead of vanishing into the silent-null path.
      // The issue (#204) traced two leg-2 `rc=2` cells back to exactly
      // this gap — the retry is invisible without a log line here.
      process.stderr.write(
        `[gh] issue view ${targetRepo}#${number} failed (attempt ${attempt}/${totalAttempts}); retrying in ${delay}ms\n`,
      );
      await sleep(delay);
    }
  }
}

function toSummary(rec: GhIssueRecord): IssueSummary {
  const state = rec.state.toLowerCase() === "open" ? "open" : "closed";
  return {
    id: rec.number,
    title: rec.title,
    labels: rec.labels.map((l) => l.name),
    state,
  };
}

export async function getIssueDetail(targetRepo: string, number: number): Promise<IssueDetail | null> {
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "issue",
        "view",
        String(number),
        "--repo",
        targetRepo,
        "--json",
        "number,title,state,labels,body,comments",
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    const rec = JSON.parse(stdout) as GhIssueDetailRecord;
    const summary = toSummary(rec);
    return {
      ...summary,
      body: rec.body ?? "",
      comments: (rec.comments ?? []).map((c) => ({
        author: c.author?.login ?? "",
        body: c.body ?? "",
        createdAt: c.createdAt ?? "",
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Post a comment on a GitHub issue using `gh issue comment ... --body-file`.
 *
 * The body is written to a temp file (not passed via `--body`) because
 * Markdown bodies can include shell metacharacters that the gh CLI's
 * argv path sometimes mishandles, and large bodies overflow argv limits
 * on some platforms. Caller is expected to handle thrown errors — the
 * orchestrator's failure-comment path logs a warning and continues.
 *
 * Returns the comment's URL when gh prints one to stdout (the typical
 * success path); returns `null` when stdout is empty or doesn't look like
 * a URL. The orchestrator's pre-existing call sites discard the return.
 */
export async function postIssueComment(
  targetRepo: string,
  issueId: number,
  body: string,
): Promise<string | null> {
  const tmp = path.join(
    os.tmpdir(),
    `vp-dev-issue-comment-${process.pid}-${Date.now()}.md`,
  );
  await fs.writeFile(tmp, body);
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "issue",
        "comment",
        String(issueId),
        "--repo",
        targetRepo,
        "--body-file",
        tmp,
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    const url = stdout.trim();
    return url.startsWith("https://") ? url : null;
  } finally {
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore
    }
  }
}

/**
 * Result of `closeIssueAsDuplicate` — Phase 2b of #148.
 *
 * `commentUrl` is the cross-reference comment posted on the duplicate
 * issue; `closedAt` is the ISO timestamp of the close. In dry-run both
 * fields are synthetic (`https://dry-run/...`, caller's wall-clock time)
 * mirroring the agent-side `dryRunIntercept` (`gh issue create` →
 * `https://dry-run/issue-create/...`). The caller uses the result to
 * record the close in run-state and to render the canonical-side summary.
 */
export interface CloseIssueAsDuplicateResult {
  commentUrl: string;
  closedAt: string;
}

/**
 * Post a cross-reference comment on a duplicate issue, then close it with
 * `--reason not_planned`. Phase 2b of #148: feeds the `--apply-dedup`
 * close path between triage and `pickAgents` so the dispatched set is the
 * canonical one.
 *
 * The comment names the canonical and the run that produced the dedup
 * verdict so the close has an audit trail back to the operator who
 * approved the run. The close uses `--reason not_planned` (vs `completed`)
 * because the issue is being yielded to its canonical, not resolved by a
 * shipped change — the GitHub timeline shows it greyed-out rather than
 * checkmarked.
 *
 * Errors are surfaced as thrown exceptions; the caller catches per-issue
 * and records the failure into run-state so a flaky network call on one
 * cluster member never blocks the rest of the dispatch.
 *
 * Dry-run: returns synthetic URL + timestamp without invoking `gh`. Same
 * shape as the agent-level `dryRunIntercept`'s `gh issue create` /
 * `gh issue comment` interception.
 */
export async function closeIssueAsDuplicate(
  targetRepo: string,
  issueNumber: number,
  canonicalNumber: number,
  runId: string,
  opts?: { dryRun?: boolean },
): Promise<CloseIssueAsDuplicateResult> {
  if (opts?.dryRun) {
    return {
      commentUrl: dryRunCommentUrl(targetRepo, issueNumber),
      closedAt: new Date().toISOString(),
    };
  }
  const body = formatDuplicateCommentBody(canonicalNumber, runId);
  const commentUrl = (await postIssueComment(targetRepo, issueNumber, body)) ??
    `https://github.com/${targetRepo}/issues/${issueNumber}`;
  await execFile(
    "gh",
    [
      "issue",
      "close",
      String(issueNumber),
      "--repo",
      targetRepo,
      "--reason",
      "not_planned",
    ],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  return { commentUrl, closedAt: new Date().toISOString() };
}

/**
 * Pure helper exposed for unit testing. The wording is the audit trail
 * the close leaves on the duplicate issue — it MUST name both the
 * canonical (so the GitHub timeline cross-references resolve) and the
 * run id (so post-hoc audits can attribute the close to a specific
 * approved `vp-dev run` invocation).
 */
export function formatDuplicateCommentBody(
  canonicalNumber: number,
  runId: string,
): string {
  return `Closing as duplicate of #${canonicalNumber} per pre-dispatch dedup (${runId}).`;
}

/**
 * Synthetic URL shape returned by the dry-run path of
 * `closeIssueAsDuplicate`. Mirrors the agent-side `dryRunIntercept`
 * (`gh issue create` → `https://dry-run/issue-create/<owner>/<repo>/new`)
 * — the `/dry-run/` host segment is what every transcript / log
 * consumer keys on to detect a synthetic response.
 */
export function dryRunCommentUrl(targetRepo: string, issueNumber: number): string {
  return `https://dry-run/issue-comment/${targetRepo}/${issueNumber}`;
}

export async function resolveRangeToIssues(
  targetRepo: string,
  spec: IssueRangeSpec,
): Promise<{ open: IssueSummary[]; skippedClosed: number[] }> {
  if (spec.kind === "all-open") {
    return { open: await listOpenIssues(targetRepo), skippedClosed: [] };
  }

  const ids = spec.kind === "range"
    ? rangeToIds(spec.from, spec.to)
    : [...spec.ids];

  const results = await Promise.all(ids.map((id) => getIssue(targetRepo, id)));

  const open: IssueSummary[] = [];
  const skippedClosed: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const issue = results[i];
    if (!issue) continue; // missing/inaccessible — silently skipped (404 etc.)
    if (issue.state === "closed") skippedClosed.push(ids[i]);
    else open.push(issue);
  }
  return { open, skippedClosed };
}

function rangeToIds(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

export interface GhPrState {
  state: "OPEN" | "MERGED" | "CLOSED" | string;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  reviews: { state?: string }[];
  // `statusCheckRollup` reflects the *latest commit's* check runs — not a
  // full history of past failures across re-pushes. Treat ciCycles derived
  // from this as a lower-bound approximation; refining requires walking
  // commit history (out of scope until the signal proves noisy).
  statusCheckRollup: { conclusion?: string }[];
}

export async function prState(targetRepo: string, prNumber: number): Promise<GhPrState | null> {
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        targetRepo,
        "--json",
        "state,createdAt,closedAt,mergedAt,reviews,statusCheckRollup",
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as GhPrState;
  } catch (err) {
    const msg = (err as { stderr?: string; message?: string }).stderr?.toString() ?? "";
    if (msg.includes("no pull requests found") || msg.includes("Could not resolve")) return null;
    throw err;
  }
}
