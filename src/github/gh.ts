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
