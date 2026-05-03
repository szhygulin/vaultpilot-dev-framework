import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
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

export async function getIssue(targetRepo: string, number: number): Promise<IssueSummary | null> {
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
        "number,title,state,labels",
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    return toSummary(JSON.parse(stdout) as GhIssueRecord);
  } catch {
    return null;
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

// Producer of the head branch is `createWorktree` in `src/git/worktree.ts`,
// which writes `vp-dev/<agentId>/issue-<N>`. Keep this regex compatible with
// `VP_DEV_BRANCH_RE` there — drift only loosens the filter (the worst case is
// that a stray non-matching vp-dev PR doesn't gate dispatch, which falls back
// to the createWorktree collision the way it does today).
const VP_DEV_HEAD_RE = /^vp-dev\/agent-[a-z0-9]+\/issue-(\d+)$/;

export interface OpenAgentPr {
  issueId: number;
  prNumber: number;
  prUrl: string;
  headRefName: string;
  title: string;
}

interface GhPrListRow {
  number: number;
  headRefName: string;
  url: string;
  title: string;
}

// Open PRs in the target repo whose head branch matches the vp-dev naming
// convention `vp-dev/agent-X/issue-N`. Used by the run preflight to skip
// dispatch on issues that already have in-flight agent work — the alternative
// is `createWorktree` colliding on `git worktree add -b <branch>` and
// surfacing as `error.agent.uncaught` (see issue #62).
//
// Throws on `gh` failure; the caller decides how to fail-safe (log + skip
// filter vs. block the run). Listing all open PRs once is one network call;
// fanning out one `gh pr list --head <branch>` per local branch (as
// `pruneStaleAgentBranches` does) would scale poorly at this preflight step.
export async function listOpenAgentPrs(targetRepo: string): Promise<OpenAgentPr[]> {
  let stdout = "";
  try {
    const out = await execFile(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        targetRepo,
        "--state",
        "open",
        "--limit",
        "1000",
        "--json",
        "number,headRefName,url,title",
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    stdout = out.stdout;
  } catch (err) {
    throw new Error(
      `gh pr list failed: ${(err as { stderr?: string }).stderr ?? (err as Error).message}`,
    );
  }
  const rows = JSON.parse(stdout) as GhPrListRow[];
  const result: OpenAgentPr[] = [];
  for (const r of rows) {
    const m = VP_DEV_HEAD_RE.exec(r.headRefName ?? "");
    if (!m) continue;
    result.push({
      issueId: parseInt(m[1], 10),
      prNumber: r.number,
      prUrl: r.url,
      headRefName: r.headRefName,
      title: r.title ?? "",
    });
  }
  return result;
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
