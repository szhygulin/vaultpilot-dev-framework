import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";

export const AGENTS_ROOT = path.resolve(process.cwd(), "agents");
export const FRAMEWORK_CLAUDE_MD = path.resolve(process.cwd(), "CLAUDE.md");
export const SOFT_CAP_BYTES = 64 * 1024;

export function agentDir(agentId: string): string {
  return path.join(AGENTS_ROOT, agentId);
}

export function agentClaudeMdPath(agentId: string): string {
  return path.join(agentDir(agentId), "CLAUDE.md");
}

export async function forkClaudeMd(agentId: string): Promise<void> {
  const dest = agentClaudeMdPath(agentId);
  await ensureDir(path.dirname(dest));
  try {
    await fs.access(dest);
    return; // already forked
  } catch {
    // fall through
  }
  const seed = await fs.readFile(FRAMEWORK_CLAUDE_MD, "utf-8");
  const tmp = `${dest}.tmp.${process.pid}`;
  await fs.writeFile(tmp, seed);
  await fs.rename(tmp, dest);
}

export async function readAgentClaudeMd(agentId: string): Promise<string> {
  try {
    return await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
  } catch {
    // fallback to framework — caller logs the warn
    return await fs.readFile(FRAMEWORK_CLAUDE_MD, "utf-8");
  }
}

export interface AppendBlockInput {
  agentId: string;
  runId: string;
  issueId: number;
  outcome: string;
  heading: string;
  body: string;
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
      current = await fs.readFile(FRAMEWORK_CLAUDE_MD, "utf-8");
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
