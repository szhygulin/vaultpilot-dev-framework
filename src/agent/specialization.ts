import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";
import {
  expireFailureLessonsInContent,
  formatSentinelHeader,
  type SentinelHeader,
} from "../util/sentinels.js";

export const AGENTS_ROOT = path.resolve(process.cwd(), "agents");
export const SOFT_CAP_BYTES = 64 * 1024;

const GENERIC_SEED = `# Project rules (default seed)

The target repository did not ship a CLAUDE.md, so this short generic
seed is used. Edit \`agents/<agent-id>/CLAUDE.md\` to extend per-agent
specialization, or add a \`CLAUDE.md\` to the target repo to give every
fresh agent better starting rules.

## Git/PR Workflow
- PR-based always. Never push to main.
- Sync with origin/main before starting any work.
- Branch every new PR off origin/main — never stack PRs.
- \`--force-with-lease\` only on feature branches; never plain \`--force\`,
  never on main.
- PR body must use \`Closes #N\` on its own line for GitHub auto-close.

## Code Discipline
- Smallest change first. Don't add features beyond the issue's stated scope.
- Trust framework guarantees — don't add error handling for impossible cases.
- Default to no comments. Only add when WHY is non-obvious.

## Issue Analysis
- Read both the issue body AND its comments before deciding scope.

## Tool Usage
- Don't repeat the same informational tool call within a single turn.
- Verify build + tests pass locally before opening a PR.
`;

export function agentDir(agentId: string): string {
  return path.join(AGENTS_ROOT, agentId);
}

export function agentClaudeMdPath(agentId: string): string {
  return path.join(agentDir(agentId), "CLAUDE.md");
}

export async function readSeedClaudeMd(targetRepoPath: string): Promise<string> {
  const candidate = path.join(targetRepoPath, "CLAUDE.md");
  try {
    return await fs.readFile(candidate, "utf-8");
  } catch {
    return GENERIC_SEED;
  }
}

export async function forkClaudeMd(agentId: string, targetRepoPath: string): Promise<void> {
  const dest = agentClaudeMdPath(agentId);
  await ensureDir(path.dirname(dest));
  try {
    await fs.access(dest);
    return; // already forked
  } catch {
    // fall through
  }
  const seed = await readSeedClaudeMd(targetRepoPath);
  const tmp = `${dest}.tmp.${process.pid}`;
  await fs.writeFile(tmp, seed);
  await fs.rename(tmp, dest);
}

export async function readAgentClaudeMd(
  agentId: string,
  targetRepoPath: string,
): Promise<string> {
  try {
    return await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
  } catch {
    return await readSeedClaudeMd(targetRepoPath);
  }
}

export interface AppendBlockInput {
  agentId: string;
  runId: string;
  issueId: number;
  outcome: string;
  heading: string;
  body: string;
  targetRepoPath: string;
  /**
   * Tags this issue contributed to the agent's evolving topical
   * fingerprint (= envelope.memoryUpdate.addTags). Embedded into the
   * sentinel header as `tags:t1,t2` so future expiry passes can detect
   * whether subsequent successes are topically related to a stored
   * failure-lesson. Optional for back-compat; sentinels written without
   * tags are treated conservatively (never expired) by `expireFailureLessons`.
   */
  tags?: string[];
}

export type AppendOutcome =
  | { kind: "appended"; bytesAppended: number; totalBytes: number }
  | { kind: "skipped-cap"; totalBytes: number };

export async function appendBlock(input: AppendBlockInput): Promise<AppendOutcome> {
  const filePath = agentClaudeMdPath(input.agentId);
  return withFileLock(filePath, async () => {
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      current = await readSeedClaudeMd(input.targetRepoPath);
    }
    const currentBytes = Buffer.byteLength(current, "utf-8");
    if (currentBytes > SOFT_CAP_BYTES) {
      return { kind: "skipped-cap", totalBytes: currentBytes };
    }

    const ts = new Date().toISOString();
    const sentinel = formatSentinelHeader({
      runId: input.runId,
      issueId: input.issueId,
      outcome: input.outcome,
      ts,
      tags: input.tags,
    });
    const block = [
      "",
      sentinel,
      `## ${input.heading.trim()}`,
      "",
      input.body.trim(),
      "",
    ].join("\n");

    const next = current.endsWith("\n") ? current + block : current + "\n" + block;
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);

    const totalBytes = Buffer.byteLength(next, "utf-8");
    return {
      kind: "appended",
      bytesAppended: Buffer.byteLength(block, "utf-8"),
      totalBytes,
    };
  });
}

export type ExpireOutcome =
  | { kind: "no-op" }
  | { kind: "expired"; dropped: SentinelHeader[]; totalBytes: number };

/**
 * Walk the agent's CLAUDE.md and drop `outcome:failure-lesson` blocks
 * that have ≥ k subsequent `outcome:implement` blocks sharing at least
 * one tag with the lesson. Idempotent — re-running on the same content
 * with the same `k` is a no-op. Conservative on legacy sentinels with
 * no `tags:` field: those are never expired.
 *
 * Wired from `runIssueCore` after a successful implement run, matching
 * the issue's "summarizer rewrites the file after a successful run"
 * trigger. Shares the same per-file lock as `appendBlock` so the
 * read-rewrite-write sequence is atomic against concurrent appends.
 */
export async function expireFailureLessons(
  agentId: string,
  k: number,
): Promise<ExpireOutcome> {
  const filePath = agentClaudeMdPath(agentId);
  return withFileLock(filePath, async () => {
    let current: string;
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      // No CLAUDE.md yet → nothing to expire. Don't seed here; that's
      // forkClaudeMd / appendBlock's job.
      return { kind: "no-op" };
    }
    const result = expireFailureLessonsInContent(current, k);
    if (result.droppedHeaders.length === 0) return { kind: "no-op" };

    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, result.content);
    await fs.rename(tmp, filePath);
    return {
      kind: "expired",
      dropped: result.droppedHeaders,
      totalBytes: Buffer.byteLength(result.content, "utf-8"),
    };
  });
}
