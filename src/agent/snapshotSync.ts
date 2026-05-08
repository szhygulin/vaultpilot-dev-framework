// Sync per-agent CLAUDE.md + section-tags.json files between the local
// working tree (`agents/`) and the snapshot repo (default:
// szhygulin/vaultpilot-dev-agents).
//
// Local `agents/` is gitignored — it's the live store the orchestrator's
// summarizer rewrites after every successful run. The snapshot repo is a
// point-in-time mirror committed via PR. These two are kept decoupled so
// the summarizer's writes don't fight a checked-out tree.
//
// Each agent has up to two synced files: `CLAUDE.md` (the per-agent prompt
// memory) and `section-tags.json` (the sidecar holding per-section operator
// metadata, post-`refactor/tags-to-sidecar`). Both files travel together so
// pulling a fresh snapshot also brings the sidecar entries that match the
// current sentinel set; absent sidecars (early-life agents) are tolerated.
//
// pullSnapshot: clone (or refresh) the snapshot, then copy each agent's
// files DOWN into local agents/. Default policy is `skip-existing` so a
// pull never clobbers a run-in-progress's freshly-summarized memory;
// `overwrite` replaces local content under the same per-file lock the
// summarizer uses.
//
// pushSnapshot: clone (or refresh) the snapshot, copy local files UP,
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

/**
 * Per-agent files synced between the local working tree and the snapshot
 * repo. CLAUDE.md is the prompt memory; section-tags.json is the sidecar
 * holding per-section operator metadata (post-`refactor/tags-to-sidecar`).
 * Order matters for tests: the agent's "added/updated/unchanged" verdict
 * derives from the highest-precedence action across files, with CLAUDE.md
 * checked first as the canonical signal that the agent dir exists.
 */
export const SYNCED_AGENT_FILES = ["CLAUDE.md", "section-tags.json"] as const;
export type SyncedAgentFile = (typeof SYNCED_AGENT_FILES)[number];

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

/**
 * Reduce per-file actions to a single per-agent verdict for SyncSummary
 * bucketing.
 *
 * The verdict reflects the operator's mental model "what happened to this
 * agent's directory?", which depends on whether the destination dir already
 * existed (`destAgentExisted`). When the dir didn't exist, the only useful
 * verdict is "add" — bringing in CLAUDE.md plus any optional sidecar files
 * is a single creation event. When the dir did exist, "add"-of-a-new-file
 * (e.g. a new sidecar landing alongside an existing CLAUDE.md) reads as an
 * update of the agent, not as a fresh creation.
 *
 * Precedence within an existing-dir agent: update > skip > unchanged. "skip"
 * wins over "unchanged" so a skip-existing pull that left a real difference
 * untouched is still reported as skipped (tells the operator they chose to
 * leave a divergence alone).
 */
export function mergeAgentActions(
  actions: readonly SyncAction[],
  destAgentExisted: boolean,
): SyncAction {
  if (!destAgentExisted) {
    // Dir didn't exist before; per-file "skip" is unreachable here (skip
    // requires a destBytes presence — which means the dir existed). So the
    // only meaningful actions are "add" and "unchanged"; treat the verdict
    // as "add" if any file was actually written.
    return actions.includes("add") ? "add" : "unchanged";
  }
  if (actions.includes("update") || actions.includes("add")) return "update";
  if (actions.includes("skip")) return "skip";
  return "unchanged";
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
    const fileActions: SyncAction[] = [];
    let claudeMdSourcePresent = false;
    let claudeMdDestExisted = false;

    for (const fileName of SYNCED_AGENT_FILES) {
      const remoteFile = path.join(remoteAgentsDir, agentId, fileName);
      const localFile = path.join(agentsRoot, agentId, fileName);

      const [sourceBytes, destBytes] = await Promise.all([
        readFileOrNull(remoteFile),
        readFileOrNull(localFile),
      ]);
      if (fileName === "CLAUDE.md") {
        claudeMdSourcePresent = sourceBytes !== null;
        claudeMdDestExisted = destBytes !== null;
      }

      // Skip files absent from the source: an early-life agent without a
      // sidecar shouldn't drag the agent's verdict away from "unchanged" /
      // "added". The merge precedence assumes per-file actions reflect real
      // source-side state, so don't pollute it with absences.
      if (sourceBytes === null) continue;

      const action = classifyAgent({ sourceBytes, destBytes, policy, direction: "pull" });
      fileActions.push(action);

      if ((action === "add" || action === "update") && !dryRun) {
        await fs.mkdir(path.dirname(localFile), { recursive: true });
        await withFileLock(localFile, async () => {
          await fs.writeFile(localFile, sourceBytes);
        });
      }
    }

    // Skip the agent entirely if its canonical CLAUDE.md is absent on the
    // source — a stray sidecar without a CLAUDE.md is not a real agent.
    if (!claudeMdSourcePresent) continue;

    const merged = mergeAgentActions(fileActions, claudeMdDestExisted);
    if (merged === "add") summary.added.push(agentId);
    else if (merged === "update") summary.updated.push(agentId);
    else if (merged === "skip") summary.skipped.push(agentId);
    else summary.unchanged.push(agentId);
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

    const fileActions: SyncAction[] = [];
    let claudeMdSourcePresent = false;
    let claudeMdDestExisted = false;

    for (const fileName of SYNCED_AGENT_FILES) {
      const localFile = path.join(agentsRoot, agentId, fileName);
      const remoteFile = path.join(remoteAgentsDir, agentId, fileName);

      const [sourceBytes, destBytes] = await Promise.all([
        readFileOrNull(localFile),
        readFileOrNull(remoteFile),
      ]);
      if (fileName === "CLAUDE.md") {
        claudeMdSourcePresent = sourceBytes !== null;
        claudeMdDestExisted = destBytes !== null;
      }

      // Same source-absent skip as pull — keeps the per-agent verdict tied
      // to files that actually exist locally.
      if (sourceBytes === null) continue;

      const action = classifyAgent({ sourceBytes, destBytes, policy: "overwrite", direction: "push" });
      fileActions.push(action);

      if ((action === "add" || action === "update") && apply) {
        await fs.mkdir(path.dirname(remoteFile), { recursive: true });
        await fs.writeFile(remoteFile, sourceBytes);
      }
    }

    // Skip if local CLAUDE.md is missing — same convention as pull.
    if (!claudeMdSourcePresent) continue;

    const merged = mergeAgentActions(fileActions, claudeMdDestExisted);
    if (merged === "add") summary.added.push(agentId);
    else if (merged === "update") summary.updated.push(agentId);
    else if (merged === "unchanged") summary.unchanged.push(agentId);
    // "skip" is unreachable for push (direction=push always returns add/update/unchanged), so we don't bucket it.
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
