// Periodic cleanup helpers for the `<branch>-incomplete-<runId>` refs the
// orchestrator's safety net pushes after a non-clean agent exit (today only
// `error_max_turns`; see `pushPartialBranch` in worktree.ts and issue #88).
//
// Why these need their own sweep, separate from `pruneStaleAgentBranches`:
//   - The labeled `-incomplete-<runId>` shape intentionally fails the
//     anchored `VP_DEV_BRANCH_RE` so the existing per-run sweep does NOT
//     auto-clean them — they're salvage state for human inspection.
//   - That's correct on a per-run basis but accumulates forever. Over weeks
//     of usage the ref count slows `git fetch`, noises up `gh pr list` /
//     `git branch -r | grep vp-dev`, and dilutes the signal value of any
//     single salvage ref.
//
// Default behaviour follows the global "destructive actions need user
// confirmation" rule: list-only, never delete unless `--apply` is passed.
// Local-only — never touches origin (the partial-push left a branch on
// origin too; the user can `git push origin --delete <branch>` separately).
//
// Push-protection invariant: `git branch -D` against local refs only. No
// `git push --delete`, no remote mutation. Issue #96.

import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "../log/logger.js";
import { STATE_DIR } from "../state/runState.js";
import type { RunState } from "../types.js";

const execFile = promisify(execFileCb);

// `git branch --list <pattern>` glob form. Anchored to the labeled shape
// produced by `buildIncompleteBranchName` (worktree.ts):
//   vp-dev/<agentId>/issue-<N>-incomplete-<safeRunId>
// Note: this glob does not match the regular `vp-dev/agent-*/issue-<N>`
// branches handled by `pruneStaleAgentBranches`, by design.
const INCOMPLETE_BRANCH_PATTERN = "vp-dev/agent-*/issue-*-incomplete-*";

// Regex form of the same shape. AgentId charset matches the registry
// generator (lowercase alphanumerics). The runId capture is `.+` because
// `safeRunId` may contain `-` from the canonical `run-<iso>` form.
const INCOMPLETE_BRANCH_RE =
  /^vp-dev\/(agent-[a-z0-9]+)\/issue-(\d+)-incomplete-(.+)$/;

export const DEFAULT_INCOMPLETE_RETENTION_DAYS = 14;

/**
 * Diagnostic signal for whether the corresponding run-state JSON exists and
 * still references this branch via `partialBranchUrl`. Surfaced in the CLI
 * output so the user can spot orphan refs (state file gone) vs. healthy
 * salvage state (state file present and refers to this URL).
 *   - `present`: `state/<runId>.json` exists AND an issue entry's
 *     `partialBranchUrl` references this branch.
 *   - `present-no-ref`: state file exists but does NOT reference this
 *     branch — possible if the safety-net pushed but the run-state write
 *     racing partial-update lost the field, or the branch was hand-renamed.
 *   - `missing`: `state/<runId>.json` not present (already cleaned up,
 *     never written, or the runId in the branch name is malformed).
 */
export type RunStateRef = "present" | "present-no-ref" | "missing";

export interface IncompleteBranchInfo {
  branch: string;
  agentId: string;
  issueId: number;
  /** runId suffix parsed from the branch name (everything after `-incomplete-`). */
  runId: string;
  /** ISO-8601 committer date of the branch tip. */
  committerDate: string;
  /** Floor((now - committerDate) / 1 day). Computed at scan time. */
  ageDays: number;
  runStateRef: RunStateRef;
}

/**
 * Origin-side counterpart to `IncompleteBranchInfo`. Lighter shape because
 * `git ls-remote` does not surface committer-date metadata — Phase 1 only
 * needs the (issueId, branchName, runId, agentId) tuple to render the
 * "salvage available" section in the setup preview (issue #118).
 */
export interface OriginIncompleteBranch {
  issueId: number;
  agentId: string;
  branchName: string;
  runId: string;
}

/** Raw output of a single `git for-each-ref` line, pre-parse. */
export interface RawIncompleteRef {
  branch: string;
  /** Unix epoch seconds (`%(committerdate:unix)`). */
  committerUnix: number;
}

/**
 * Pure parser — extracts `(agentId, issueId, runId, ageDays, committerDate)`
 * from `git for-each-ref` output. Lines that don't match the labeled shape
 * are silently dropped (defensive against future glob loosening).
 *
 * Unit-tested in `incompleteBranches.test.ts` so the regex / age math stays
 * stable independent of git plumbing.
 */
export function parseIncompleteRefs(
  refs: RawIncompleteRef[],
  nowMs: number,
): Array<Omit<IncompleteBranchInfo, "runStateRef">> {
  const dayMs = 24 * 60 * 60 * 1000;
  const out: Array<Omit<IncompleteBranchInfo, "runStateRef">> = [];
  for (const r of refs) {
    const m = INCOMPLETE_BRANCH_RE.exec(r.branch);
    if (!m) continue;
    const [, agentId, issueIdStr, runId] = m;
    const committerMs = r.committerUnix * 1000;
    const ageDays = Math.max(0, Math.floor((nowMs - committerMs) / dayMs));
    out.push({
      branch: r.branch,
      agentId,
      issueId: parseInt(issueIdStr, 10),
      runId,
      committerDate: new Date(committerMs).toISOString(),
      ageDays,
    });
  }
  return out;
}

/**
 * Filter pure on `ageDays`. Branches with `ageDays >= retentionDays` cross
 * the threshold and are returned. A retentionDays of 0 surfaces every ref;
 * negative values are treated as 0 (defensive — the CLI rejects non-positive
 * via `parsePositive`, but the helper accepts any caller).
 */
export function filterByRetention<T extends { ageDays: number }>(
  branches: T[],
  retentionDays: number,
): T[] {
  const threshold = Math.max(0, retentionDays | 0);
  return branches.filter((b) => b.ageDays >= threshold);
}

/**
 * Cross-reference a single incomplete branch against `state/<runId>.json`.
 * Returns the diagnostic tag — see `RunStateRef` above. All errors map to
 * `missing` (file unreadable / parse failure / shape mismatch); the caller
 * never throws.
 *
 * Matches on the URL-encoded branch substring of `partialBranchUrl`, which
 * is built as `https://github.com/<repo>/tree/${encodeURIComponent(branch)}`
 * by `pushPartialBranch`. Substring match is robust against future tweaks
 * to the URL shape (e.g. `?ref=` form) without coupling to `<repo>`.
 */
export async function lookupRunStateRef(
  branch: string,
  runId: string,
  stateDir: string,
): Promise<RunStateRef> {
  const filePath = path.join(stateDir, `${runId}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return "missing";
  }
  let state: RunState;
  try {
    state = JSON.parse(raw) as RunState;
  } catch {
    return "missing";
  }
  if (!state || typeof state !== "object" || !state.issues) return "present-no-ref";
  const encodedBranch = encodeURIComponent(branch);
  for (const entry of Object.values(state.issues)) {
    if (entry?.partialBranchUrl && entry.partialBranchUrl.includes(encodedBranch)) {
      return "present";
    }
  }
  return "present-no-ref";
}

export interface ListIncompleteBranchesOpts {
  repoPath: string;
  /** Override `Date.now()` for deterministic tests. */
  nowMs?: number;
  /** Override the default `STATE_DIR` for deterministic tests. */
  stateDir?: string;
  logger?: Logger;
}

/**
 * Enumerate every local labeled-incomplete ref (vp-dev/agent-X/issue-N
 * -incomplete-runId) with committer-date metadata, then enrich each with
 * its `runStateRef` tag. Returns `[]` on `git for-each-ref` failure (network
 * has nothing to do with this, but the cwd may not be a git repo) — the
 * caller treats an empty result as "nothing to clean up".
 */
export async function listIncompleteBranches(
  opts: ListIncompleteBranchesOpts,
): Promise<IncompleteBranchInfo[]> {
  let stdout = "";
  try {
    const result = await execFile(
      "git",
      [
        "for-each-ref",
        "--format=%(refname:short)\t%(committerdate:unix)",
        `refs/heads/${INCOMPLETE_BRANCH_PATTERN}`,
      ],
      { cwd: opts.repoPath },
    );
    stdout = result.stdout;
  } catch (err) {
    opts.logger?.warn("cleanup.incomplete_list_failed", {
      err: (err as Error).message,
    });
    return [];
  }
  const refs: RawIncompleteRef[] = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) return { branch: line, committerUnix: 0 };
      const branch = line.slice(0, tab);
      const ts = parseInt(line.slice(tab + 1), 10);
      return { branch, committerUnix: Number.isFinite(ts) ? ts : 0 };
    });
  const nowMs = opts.nowMs ?? Date.now();
  const stateDir = opts.stateDir ?? STATE_DIR;
  const parsed = parseIncompleteRefs(refs, nowMs);
  const out: IncompleteBranchInfo[] = [];
  for (const p of parsed) {
    const runStateRef = await lookupRunStateRef(p.branch, p.runId, stateDir);
    out.push({ ...p, runStateRef });
  }
  return out;
}

export interface PruneIncompleteResult {
  deleted: string[];
  failed: Array<{ branch: string; reason: string }>;
}

/**
 * Delete each branch with `git branch -D`. Local-only; never pushes.
 *
 * If a branch is still attached to a worktree, `git branch -D` rejects the
 * delete — that surfaces as a `failed` entry with the git stderr included
 * so the user can act (`git worktree remove --force <path>` first). Same
 * fail-safe pattern as `pruneStaleAgentBranches`.
 */
export async function pruneIncompleteBranches(opts: {
  repoPath: string;
  branches: string[];
  logger?: Logger;
}): Promise<PruneIncompleteResult> {
  const deleted: string[] = [];
  const failed: Array<{ branch: string; reason: string }> = [];
  for (const branch of opts.branches) {
    try {
      await execFile("git", ["branch", "-D", branch], { cwd: opts.repoPath });
      deleted.push(branch);
      opts.logger?.info("cleanup.incomplete_branch_deleted", { branch });
    } catch (err) {
      const reason =
        (err as { stderr?: string }).stderr ?? (err as Error).message;
      failed.push({ branch, reason });
      opts.logger?.warn("cleanup.incomplete_branch_delete_failed", {
        branch,
        err: reason,
      });
    }
  }
  return { deleted, failed };
}

/**
 * Pure parser — extract `OriginIncompleteBranch` records from raw
 * `git ls-remote --heads origin <pattern>` output lines. Each line is
 * `<sha>\t<refspec>` with the refspec carrying a `refs/heads/` prefix; we
 * strip that and apply the same `INCOMPLETE_BRANCH_RE` shape match used by
 * the local-branch parser. Lines that don't match are dropped silently.
 *
 * Unit-tested in `incompleteBranches.test.ts` so the regex / strip stays
 * stable independent of git plumbing or future ls-remote format tweaks.
 */
export function parseLsRemoteIncompleteRefs(lines: string[]): OriginIncompleteBranch[] {
  const out: OriginIncompleteBranch[] = [];
  for (const raw of lines) {
    if (!raw) continue;
    const tab = raw.indexOf("\t");
    if (tab < 0) continue;
    let ref = raw.slice(tab + 1).trim();
    if (ref.startsWith("refs/heads/")) ref = ref.slice("refs/heads/".length);
    const m = INCOMPLETE_BRANCH_RE.exec(ref);
    if (!m) continue;
    const [, agentId, issueIdStr, runId] = m;
    out.push({
      issueId: parseInt(issueIdStr, 10),
      agentId,
      branchName: ref,
      runId,
    });
  }
  return out;
}

/**
 * Enumerate the labeled-incomplete refs (matching the same shape used by
 * `INCOMPLETE_BRANCH_PATTERN` above) on `origin` for a given set of issue
 * ids. Single `git ls-remote` over that glob, then in-memory regex parse +
 * filter. No mutation, no fetch — refs are read directly from the remote
 * without updating local tracking.
 *
 * Returned as `Map<issueId, OriginIncompleteBranch[]>` so the setup
 * preview can render a per-issue salvage-available section
 * (issue #118 Phase 1). The list is empty for issues with no salvage
 * refs; we never return a key for an issue not in the input filter.
 *
 * Failure mode: any `git ls-remote` failure returns an empty map and
 * emits a `setup.incomplete_origin_list_failed` warning. This matches
 * the `findOpenVpDevPrs` failure pattern — the surface is informational
 * only, so a transient network blip should not block the run.
 */
export async function findIncompleteBranchesOnOrigin(opts: {
  repoPath: string;
  issueIds: number[];
  logger?: Logger;
}): Promise<Map<number, OriginIncompleteBranch[]>> {
  const allowed = new Set(opts.issueIds);
  if (allowed.size === 0) return new Map();
  let stdout = "";
  try {
    const result = await execFile(
      "git",
      ["ls-remote", "--heads", "origin", `refs/heads/${INCOMPLETE_BRANCH_PATTERN}`],
      { cwd: opts.repoPath, maxBuffer: 50 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (err) {
    opts.logger?.warn("setup.incomplete_origin_list_failed", {
      err:
        (err as { stderr?: string; message?: string }).stderr ??
        (err as Error).message,
    });
    return new Map();
  }
  const parsed = parseLsRemoteIncompleteRefs(stdout.split("\n"));
  const map = new Map<number, OriginIncompleteBranch[]>();
  for (const p of parsed) {
    if (!allowed.has(p.issueId)) continue;
    const list = map.get(p.issueId) ?? [];
    list.push(p);
    map.set(p.issueId, list);
  }
  return map;
}

/**
 * Resolve the retention-days threshold: explicit flag wins, env var
 * (`INCOMPLETE_BRANCH_RETENTION_DAYS`) is the fallback, hard-coded default
 * is `DEFAULT_INCOMPLETE_RETENTION_DAYS` (14 days). Pure, env-injected so
 * tests don't have to mutate `process.env`.
 */
export function resolveRetentionDays(input: {
  flag?: number;
  env: NodeJS.ProcessEnv;
}): number {
  if (input.flag !== undefined && input.flag > 0) return input.flag;
  const raw = input.env.INCOMPLETE_BRANCH_RETENTION_DAYS;
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return DEFAULT_INCOMPLETE_RETENTION_DAYS;
}
