import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { Logger } from "../log/logger.js";

const execFile = promisify(execFileCb);

// Same shape as createWorktree branch convention: vp-dev/<agentId>/issue-<N>.
// Captures (agentId, issueId) so callers can render which agent's PR is
// blocking dispatch — useful diagnostic when the same issue has more than
// one historical vp-dev attempt.
const VP_DEV_BRANCH_RE = /^vp-dev\/(agent-[a-z0-9]+)\/issue-(\d+)$/;

export interface OpenVpDevPr {
  issueId: number;
  agentId: string;
  branch: string;
  prUrl: string;
  prNumber: number;
}

interface GhPrListRecord {
  number: number;
  url: string;
  headRefName: string;
}

/**
 * Pure helper — extracted so the regex / shape mapping is unit-testable
 * without spawning `gh`. Records that don't match the vp-dev shape are
 * silently dropped (human-authored branches are out of scope).
 */
export function parseOpenVpDevPrs(records: GhPrListRecord[]): OpenVpDevPr[] {
  const out: OpenVpDevPr[] = [];
  for (const r of records) {
    const m = VP_DEV_BRANCH_RE.exec(r.headRefName);
    if (!m) continue;
    const [, agentId, issueIdStr] = m;
    out.push({
      issueId: parseInt(issueIdStr, 10),
      agentId,
      branch: r.headRefName,
      prUrl: r.url,
      prNumber: r.number,
    });
  }
  return out;
}

/**
 * Query GitHub for every open PR in `targetRepo` whose head matches the
 * vp-dev branch convention. Returned as a `Map<issueId, OpenVpDevPr>` so
 * the dispatcher can decide "skip this issue, an open PR already covers it"
 * without a per-issue `gh` call.
 *
 * If the same issueId has multiple open vp-dev PRs (rare), the first one
 * wins.
 *
 * Failure mode: any `gh` / parse error returns an empty map. The caller
 * proceeds as if no open PRs existed — the worktree-add collision will
 * then surface the underlying problem instead of swallowing it under a
 * generic "skipped due to open PR" reason. We log a warning so the
 * operator can see the gh check broke.
 */
export async function findOpenVpDevPrs(opts: {
  targetRepo: string;
  repoPath: string;
  logger?: Logger;
}): Promise<Map<number, OpenVpDevPr>> {
  let raw = "";
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        opts.targetRepo,
        "--state",
        "open",
        "--limit",
        "1000",
        "--json",
        "number,url,headRefName",
      ],
      { cwd: opts.repoPath, maxBuffer: 50 * 1024 * 1024 },
    );
    raw = stdout;
  } catch (err) {
    opts.logger?.warn("dispatch.open_pr_list_failed", {
      err: (err as { stderr?: string; message?: string }).stderr ?? (err as Error).message,
    });
    return new Map();
  }

  let records: GhPrListRecord[];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      opts.logger?.warn("dispatch.open_pr_list_unexpected_shape", { sample: raw.slice(0, 200) });
      return new Map();
    }
    records = arr as GhPrListRecord[];
  } catch (err) {
    opts.logger?.warn("dispatch.open_pr_list_parse_failed", {
      err: (err as Error).message,
      sample: raw.slice(0, 200),
    });
    return new Map();
  }

  const prs = parseOpenVpDevPrs(records);
  const map = new Map<number, OpenVpDevPr>();
  for (const p of prs) {
    if (!map.has(p.issueId)) map.set(p.issueId, p);
  }
  return map;
}
