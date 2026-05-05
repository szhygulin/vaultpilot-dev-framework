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

/**
 * Post a comment on a GitHub issue using `gh issue comment ... --body-file`.
 *
 * The body is written to a temp file (not passed via `--body`) because
 * Markdown bodies can include shell metacharacters that the gh CLI's
 * argv path sometimes mishandles, and large bodies overflow argv limits
 * on some platforms. Caller is expected to handle thrown errors — the
 * orchestrator's failure-comment path logs a warning and continues.
 */
export async function postIssueComment(
  targetRepo: string,
  issueId: number,
  body: string,
): Promise<void> {
  const tmp = path.join(
    os.tmpdir(),
    `vp-dev-issue-comment-${process.pid}-${Date.now()}.md`,
  );
  await fs.writeFile(tmp, body);
  try {
    await execFile(
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
  } finally {
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore
    }
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
