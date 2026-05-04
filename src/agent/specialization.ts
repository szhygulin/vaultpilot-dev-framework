import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";

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

/**
 * Pick the agent's primary domain — the first non-"general" tag, lowercased.
 * Returns null if the agent only carries "general" or has no tags. The shared
 * lessons pool keys files on this value, so any domain a sibling pool exists
 * for must round-trip through this resolver to stay reachable. Deliberately
 * does NOT introduce a second taxonomy on top of the existing free-form tag
 * set — domains ARE tags.
 */
export function primaryDomain(tags: readonly string[]): string | null {
  for (const t of tags) {
    const lower = t.toLowerCase().trim();
    if (lower && lower !== "general") return lower;
  }
  return null;
}

export interface AppendBlockInput {
  agentId: string;
  runId: string;
  issueId: number;
  outcome: string;
  heading: string;
  body: string;
  targetRepoPath: string;
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
    const block = [
      "",
      `<!-- run:${input.runId} issue:#${input.issueId} outcome:${input.outcome} ts:${ts} -->`,
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
