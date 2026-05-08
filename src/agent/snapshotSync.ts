// Sync per-agent CLAUDE.md files between the local working tree (`agents/`)
// and the snapshot repo (default: szhygulin/vaultpilot-dev-agents).
//
// Local `agents/` is gitignored — it's the live store the orchestrator's
// summarizer rewrites after every successful run. The snapshot repo is a
// point-in-time mirror committed via PR. These two are kept decoupled so
// the summarizer's writes don't fight a checked-out tree.
//
// pullSnapshot: clone (or refresh) the snapshot, then copy CLAUDE.mds DOWN
// into local agents/. Default policy is `skip-existing` so a pull never
// clobbers a run-in-progress's freshly-summarized memory; `overwrite`
// replaces local content under the same per-file lock the summarizer uses.
//
// pushSnapshot: clone (or refresh) the snapshot, copy local CLAUDE.mds UP,
// branch + commit + open a PR via gh. Synthetic curve-redo agents
// (`agent-916a-trim-*`, `agent-9180`–`agent-9189`) are excluded by default
// per the snapshot README's stated policy. Without --apply it's a dry run.

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENTS_ROOT } from "./specialization.js";
import { withFileLock } from "../state/locks.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_SNAPSHOT_REPO = "szhygulin/vaultpilot-dev-agents";
export const DEFAULT_CLONE_DIR = path.resolve(process.cwd(), ".claude", "agents-snapshot");

// Phase A trim-* (issue #179) and Phase B Smoke10 (#234) curve-redo study
// agents. The snapshot repo's README excludes these; pushSnapshot mirrors
// that policy unless `--include-synthetic` is passed.
export const SYNTHETIC_AGENT_PATTERNS: readonly RegExp[] = [
  /^agent-916a-trim-/,
  /^agent-918[0-9]$/,
];

export type ConflictPolicy = "skip-existing" | "overwrite";

export interface SyncSummary {
  /** Agents copied because they did not exist on the destination. */
  added: string[];
  /** Agents whose destination content was replaced. */
  updated: string[];
  /** Existing destination agents preserved (skip-existing policy). */
  skipped: string[];
  /** Source and destination were byte-identical; no copy. */
  unchanged: string[];
  /** Source agents matched an exclude pattern (push only). */
  excluded: string[];
}

export function emptySummary(): SyncSummary {
  return { added: [], updated: [], skipped: [], unchanged: [], excluded: [] };
}

export function isSynthetic(
  agentDir: string,
  extraPatterns: readonly RegExp[] = [],
): boolean {
  for (const re of SYNTHETIC_AGENT_PATTERNS) if (re.test(agentDir)) return true;
  for (const re of extraPatterns) if (re.test(agentDir)) return true;
  return false;
}

/**
 * Decide what action a single agent's sync should produce, given the bytes
 * (or absence) on each side and the conflict policy. Pure — no I/O — so the
 * file-by-file decision logic is testable without a real filesystem.
 *
 * Direction encodes which side is the source: `pull` copies remote → local,
 * so the policy gates whether to overwrite an existing local file. `push`
 * always copies local → remote on a difference (the snapshot is the
 * destination, and the PR is the human gate).
 */
export type SyncAction = "add" | "update" | "skip" | "unchanged";

export function classifyAgent(input: {
  sourceBytes: Buffer | null;
  destBytes: Buffer | null;
  policy: ConflictPolicy;
  direction: "pull" | "push";
}): SyncAction {
  if (input.sourceBytes === null) return "skip";
  if (input.destBytes === null) return "add";
  if (input.sourceBytes.equals(input.destBytes)) return "unchanged";
  if (input.direction === "push") return "update";
  return input.policy === "overwrite" ? "update" : "skip";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readFileOrNull(p: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(p);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function gitExec(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

/**
 * Ensure `cloneDir` is a fresh checkout of `<repo>@origin/main`. Clones via
 * `gh repo clone` if absent; otherwise fetches and hard-resets. Discards any
 * local edits inside the clone — callers that want to commit must branch off
 * `origin/main` before mutating.
 */
export async function ensureCloneFresh(cloneDir: string, repo: string): Promise<void> {
  if (!(await pathExists(cloneDir))) {
    await fs.mkdir(path.dirname(cloneDir), { recursive: true });
    await execFileAsync("gh", ["repo", "clone", repo, cloneDir]);
    return;
  }
  if (!(await pathExists(path.join(cloneDir, ".git")))) {
    throw new Error(
      `${cloneDir} exists but is not a git repository. Either delete it or pass a different --clone-dir.`,
    );
  }
  await gitExec(cloneDir, ["fetch", "origin", "main"]);
  await gitExec(cloneDir, ["checkout", "main"]);
  await gitExec(cloneDir, ["reset", "--hard", "origin/main"]);
  await gitExec(cloneDir, ["clean", "-fd"]);
}

async function listAgentDirs(agentsRoot: string): Promise<string[]> {
  if (!(await pathExists(agentsRoot))) return [];
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("agent-"))
    .map((e) => e.name)
    .sort();
}

export interface PullOptions {
  repo?: string;
  cloneDir?: string;
  policy?: ConflictPolicy;
  dryRun?: boolean;
  /** Override AGENTS_ROOT (tests). */
  agentsRoot?: string;
  /** Skip ensureCloneFresh — assume `cloneDir` already has the snapshot.
   *  Used by tests; production callers should leave unset. */
  skipFetch?: boolean;
}

export async function pullSnapshot(opts: PullOptions = {}): Promise<SyncSummary> {
  const repo = opts.repo ?? DEFAULT_SNAPSHOT_REPO;
  const cloneDir = opts.cloneDir ?? DEFAULT_CLONE_DIR;
  const agentsRoot = opts.agentsRoot ?? AGENTS_ROOT;
  const policy: ConflictPolicy = opts.policy ?? "skip-existing";
  const dryRun = opts.dryRun ?? false;

  if (!opts.skipFetch) await ensureCloneFresh(cloneDir, repo);
  const remoteAgentsDir = path.join(cloneDir, "agents");
  if (!(await pathExists(remoteAgentsDir))) {
    throw new Error(`snapshot repo has no 'agents/' directory at ${remoteAgentsDir}`);
  }

  await fs.mkdir(agentsRoot, { recursive: true });
  const summary = emptySummary();
  const remoteAgents = await listAgentDirs(remoteAgentsDir);

  for (const agentId of remoteAgents) {
    const remoteFile = path.join(remoteAgentsDir, agentId, "CLAUDE.md");
    const localFile = path.join(agentsRoot, agentId, "CLAUDE.md");

    const [sourceBytes, destBytes] = await Promise.all([
      readFileOrNull(remoteFile),
      readFileOrNull(localFile),
    ]);
    if (sourceBytes === null) continue;

    const action = classifyAgent({ sourceBytes, destBytes, policy, direction: "pull" });
    if (action === "unchanged") {
      summary.unchanged.push(agentId);
      continue;
    }
    if (action === "skip") {
      summary.skipped.push(agentId);
      continue;
    }

    if (!dryRun) {
      await fs.mkdir(path.dirname(localFile), { recursive: true });
      await withFileLock(localFile, async () => {
        await fs.writeFile(localFile, sourceBytes);
      });
    }
    if (action === "add") summary.added.push(agentId);
    else summary.updated.push(agentId);
  }

  return summary;
}

export interface PushOptions {
  repo?: string;
  cloneDir?: string;
  apply?: boolean;
  branch?: string;
  message?: string;
  body?: string;
  includeSynthetic?: boolean;
  extraExcludes?: readonly RegExp[];
  /** Override AGENTS_ROOT (tests). */
  agentsRoot?: string;
  /** Skip ensureCloneFresh — used by tests. */
  skipFetch?: boolean;
}

export interface PushResult {
  summary: SyncSummary;
  branch: string;
  prUrl?: string;
}

function formatSummaryBody(summary: SyncSummary): string {
  const lines: string[] = ["## Summary", ""];
  if (summary.added.length) lines.push(`- ${summary.added.length} added: ${summary.added.join(", ")}`);
  if (summary.updated.length) lines.push(`- ${summary.updated.length} updated: ${summary.updated.join(", ")}`);
  if (summary.unchanged.length) lines.push(`- ${summary.unchanged.length} unchanged`);
  if (summary.excluded.length) lines.push(`- ${summary.excluded.length} excluded as synthetic curve-redo agents`);
  lines.push("", "Generated by `vp-dev agents push-snapshot`.");
  return lines.join("\n");
}

export async function pushSnapshot(opts: PushOptions = {}): Promise<PushResult> {
  const repo = opts.repo ?? DEFAULT_SNAPSHOT_REPO;
  const cloneDir = opts.cloneDir ?? DEFAULT_CLONE_DIR;
  const agentsRoot = opts.agentsRoot ?? AGENTS_ROOT;
  const apply = opts.apply ?? false;
  const branch = opts.branch ?? `refresh-snapshot-${new Date().toISOString().slice(0, 10)}`;

  if (!opts.skipFetch) await ensureCloneFresh(cloneDir, repo);
  const remoteAgentsDir = path.join(cloneDir, "agents");
  await fs.mkdir(remoteAgentsDir, { recursive: true });

  if (apply && !opts.skipFetch) {
    await gitExec(cloneDir, ["checkout", "-B", branch, "origin/main"]);
  }

  const summary = emptySummary();
  const localAgents = await listAgentDirs(agentsRoot);

  for (const agentId of localAgents) {
    if (!opts.includeSynthetic && isSynthetic(agentId, opts.extraExcludes ?? [])) {
      summary.excluded.push(agentId);
      continue;
    }
    const localFile = path.join(agentsRoot, agentId, "CLAUDE.md");
    const remoteFile = path.join(remoteAgentsDir, agentId, "CLAUDE.md");

    const [sourceBytes, destBytes] = await Promise.all([
      readFileOrNull(localFile),
      readFileOrNull(remoteFile),
    ]);
    if (sourceBytes === null) continue;

    const action = classifyAgent({ sourceBytes, destBytes, policy: "overwrite", direction: "push" });
    if (action === "unchanged") {
      summary.unchanged.push(agentId);
      continue;
    }
    if (apply) {
      await fs.mkdir(path.dirname(remoteFile), { recursive: true });
      await fs.writeFile(remoteFile, sourceBytes);
    }
    if (action === "add") summary.added.push(agentId);
    else if (action === "update") summary.updated.push(agentId);
  }

  if (!apply) return { summary, branch };

  await gitExec(cloneDir, ["add", "-A"]);
  const status = await gitExec(cloneDir, ["status", "--porcelain"]);
  if (!status.trim()) return { summary, branch };

  const message =
    opts.message ??
    `Refresh snapshot — ${summary.added.length} added, ${summary.updated.length} updated`;
  const commitMsg = `${message}\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>\n`;
  await gitExec(cloneDir, ["commit", "-m", commitMsg]);
  await gitExec(cloneDir, ["push", "-u", "origin", branch]);

  const body = opts.body ?? formatSummaryBody(summary);
  const { stdout: prStdout } = await execFileAsync(
    "gh",
    ["pr", "create", "--repo", repo, "--title", message, "--body", body],
    { cwd: cloneDir },
  );
  return { summary, branch, prUrl: prStdout.trim() };
}
