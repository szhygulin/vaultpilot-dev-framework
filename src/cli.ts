import { Command } from "commander";
import {
  clearCurrentRunId,
  downgradeInFlightToPending,
  isRunComplete,
  loadRunState,
  makeRunId,
  newRunState,
  readCurrentRunId,
  saveRunState,
  writeCurrentRunId,
} from "./state/runState.js";
import { createAgent, loadRegistry, mutateRegistry } from "./state/registry.js";
import { parseRangeSpec, describeRange } from "./github/range.js";
import { getIssue, resolveRangeToIssues } from "./github/gh.js";
import { pickAgents, runOrchestrator } from "./orchestrator/orchestrator.js";
import {
  approveSetup,
  buildSetupPreview,
  formatSetupPreview,
  type OpenPrSkipped,
  type TriageSkipped,
} from "./orchestrator/setup.js";
import {
  deleteRunConfirmToken,
  hashPreview,
  mintToken,
  pruneExpiredTokens,
  readRunConfirmToken,
  writeRunConfirmToken,
} from "./state/runConfirm.js";
import { triageBatch } from "./orchestrator/triage.js";
import { Logger } from "./log/logger.js";
import {
  fetchOriginMain,
  formatUnprunableWarning,
  pruneStaleAgentBranches,
  pruneWorktrees,
  resolveTargetRepoPath,
} from "./git/worktree.js";
import { findOpenVpDevPrs } from "./git/openPrs.js";
import {
  DEFAULT_INCOMPLETE_RETENTION_DAYS,
  filterByRetention,
  listIncompleteBranches,
  pruneIncompleteBranches,
  resolveRetentionDays,
  type IncompleteBranchInfo,
} from "./git/incompleteBranches.js";
import { agentClaudeMdPath, forkClaudeMd } from "./agent/specialization.js";
import { promises as fs } from "node:fs";
import { runIssueCore } from "./agent/runIssueCore.js";
import {
  applySplit,
  detectOverload,
  formatProposal,
  proposeSplit,
  readAgentClaudeMdBytes,
} from "./agent/split.js";
import {
  applyPruneProposal,
  detectPruneCandidates,
  formatPruneProposals,
  type PruneProposal,
  type ApplyResult as PruneApplyResult,
} from "./agent/prune.js";
import {
  acceptCandidate,
  collectPendingCandidates,
  rejectCandidate,
  type PendingCandidate,
} from "./agent/promotion.js";
import {
  listSharedLessonDomains,
  MAX_POOL_LINES,
  type LessonTier,
} from "./agent/sharedLessons.js";
import {
  loadAllOutcomes,
  pollOutcomes,
  rollupOutcomes,
  type AgentRollup,
} from "./state/outcomes.js";
import { RunCostTracker, resolveBudgetUsd } from "./util/costTracker.js";
import type { AgentRecord, IssueRangeSpec, IssueSummary } from "./types.js";

const DEFAULT_STALLED_THRESHOLD_DAYS = 14;

const DEFAULT_MAX_TICKS = 200;

export function buildCli(): Command {
  const program = new Command();
  program.name("vp-dev").description("LLM-driven development agent runner").version("0.1.0");

  program
    .command("run")
    .description("Run agents against a range of GitHub issues")
    .option("--agents <n>", "Number of parallel coding agents (required unless --confirm)", parsePositive)
    .option("--target-repo <owner/repo>", "Target GitHub repo, e.g. octocat/hello-world (required unless --confirm)")
    .option("--issues <range>", "Issue range: 100-150, csv 100,103,108, or all-open")
    .option("--target-repo-path <path>", "Local clone path of the target repo (default: $HOME/dev/<repo-name>)")
    .option("--resume", "Resume the most recent unfinished run")
    .option("--dry-run", "Intercept comment / PR / push tools with synthetic responses")
    .option("--max-ticks <n>", "Safety cap on scheduling ticks", parsePositive, DEFAULT_MAX_TICKS)
    .option(
      "--stalled-threshold-days <n>",
      "Days a PR may sit open before outcome polling marks it 'stalled'",
      parsePositive,
      DEFAULT_STALLED_THRESHOLD_DAYS,
    )
    .option("--verbose", "Mirror a colorized subset of events to stderr")
    .option("--yes", "Auto-approve the setup preview (required for non-TTY environments)")
    .option(
      "--plan",
      "Print the setup preview, write a short-lived confirm token, exit 0 without launching",
    )
    .option(
      "--confirm <token>",
      "Launch the run associated with a token previously emitted by --plan",
    )
    .option(
      "--include-non-ready",
      "Skip pre-dispatch triage and dispatch every open issue (per-run override; no env var)",
    )
    .option(
      "--max-cost-usd <usd>",
      "Per-run cost ceiling in USD (e.g. 5.0). Phase 1: logged + accumulated only — no enforcement yet (#85). Env fallback: VP_DEV_MAX_COST_USD.",
    )
    .action(async (opts) => {
      await cmdRun(opts);
    });

  program
    .command("status")
    .description("Print summary of the current run + per-agent state")
    .action(async () => {
      await cmdStatus();
    });

  program
    .command("spawn")
    .description("Run one coding agent on one issue (chat-orchestrator primitive)")
    .requiredOption("--agent <id-or-new>", "Existing agent ID or 'new' to mint a fresh general")
    .requiredOption("--issue <n>", "Issue number to work on", parsePositive)
    .requiredOption("--target-repo <owner/repo>", "Target GitHub repo")
    .option("--target-repo-path <path>", "Local clone path of the target repo")
    .option("--dry-run", "Intercept comment / PR / push tools with synthetic responses")
    .option("--verbose", "Mirror a colorized event subset to stderr")
    .option("--skip-summary", "Skip summarizer + CLAUDE.md append")
    .option("--inspect-paths <csv>", "Comma-separated absolute paths the agent may inspect read-only (e.g. prior worktrees)")
    .action(async (opts) => {
      await cmdSpawn(opts);
    });

  const agentsCmd = new Command("agents")
    .description("Agent management")
    .addCommand(
      new Command("list")
        .description("List the agent roster + specializations")
        .option("--all", "Include archived (split-parent) agents in the output")
        .action(async (opts) => {
          await cmdAgentsList(opts);
        }),
    )
    .addCommand(
      new Command("pick")
        .description("Score the registry against a set of pending issues; print picks (no mutation)")
        .requiredOption("--issues <csv>", "Issue numbers (comma-separated)")
        .requiredOption("--target-repo <owner/repo>", "Target GitHub repo")
        .requiredOption("--parallelism <n>", "Desired parallelism", parsePositive)
        .option("--target-repo-path <path>", "Local clone path of the target repo")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsPick(opts);
        }),
    )
    .addCommand(
      new Command("specialties")
        .description("Print per-agent specialties: counts, distinctive tags, summarizer-appended lessons from each agent's CLAUDE.md")
        .option("--top-tags <n>", "Number of distinctive tags to show per agent", parsePositive, 12)
        .option("--all", "Include archived (split-parent) agents in the output")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsSpecialties(opts);
        }),
    )
    .addCommand(
      new Command("split")
        .description("Detect overload + emit a proposed split into 2-3 sub-specialists. Pass --apply to mutate the registry.")
        .argument("<agentId>", "Agent to inspect (e.g. agent-d396)")
        .option("--json", "Print machine-readable JSON")
        .option("--force", "Run the proposal even if the agent has not crossed an overload threshold")
        .option("--apply", "Apply the proposal: mint child agents, partition CLAUDE.md sections, archive parent. ONE-WAY mutation.")
        .option("--yes", "Skip the apply confirmation prompt (required for non-TTY environments).")
        .action(async (agentId, opts) => {
          await cmdAgentsSplit(agentId, opts);
        }),
    )
    .addCommand(
      new Command("prune")
        .description("Detect overlapping specialists and emit merge proposals. Pass --apply to mutate the registry.")
        .option("--json", "Print machine-readable JSON")
        .option("--apply", "Apply proposals: concat CLAUDE.md, archive absorbed agent, update registry. ONE-WAY mutation.")
        .option("--yes", "Skip the apply confirmation prompt (required for non-TTY environments).")
        .action(async (opts) => {
          await cmdAgentsPrune(opts);
        }),
    )
    .addCommand(
      new Command("stats")
        .description("Per-agent rollup of PR outcomes (merge rate, median rework, median CI cycles).")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--poll",
          "Refresh outcomes from GitHub before printing (one `gh pr view` per non-terminal PR).",
        )
        .option(
          "--stalled-threshold-days <n>",
          "Days a PR may sit open before --poll marks it 'stalled'",
          parsePositive,
          DEFAULT_STALLED_THRESHOLD_DAYS,
        )
        .option("--all", "Include archived (split-parent) agents")
        .action(async (opts) => {
          await cmdAgentsStats(opts);
        }),
    );
  program.addCommand(agentsCmd);

  const lessonsCmd = new Command("lessons")
    .description("Cross-agent shared lessons pool: list pool files + review promote-candidate blocks queued by the summarizer")
    .addCommand(
      new Command("list")
        .description("List shared-lesson pool files (agents/.shared/lessons/ by default; --global for ~/.vaultpilot/shared-lessons/) with size + line count")
        .option("--json", "Print machine-readable JSON")
        .option("--global", "Inspect the cross-target-repo global pool (~/.vaultpilot/shared-lessons/) instead of the per-target pool")
        .action(async (opts) => {
          await cmdLessonsList(opts);
        }),
    )
    .addCommand(
      new Command("review")
        .description("Walk every agent's CLAUDE.md for `<!-- promote-candidate:<domain> -->` blocks and accept/reject each interactively. --global routes accepted entries to the cross-target-repo pool.")
        .option("--json", "Print machine-readable JSON listing of pending candidates and exit (no mutation)")
        .option("--yes", "Auto-accept every candidate that passes validation (non-interactive use only)")
        .option("--global", "Append accepted entries to the global pool (~/.vaultpilot/shared-lessons/) instead of the per-target pool")
        .action(async (opts) => {
          await cmdLessonsReview(opts);
        }),
    );
  program.addCommand(lessonsCmd);

  const cleanupCmd = new Command("cleanup")
    .description(
      "Local cleanup operations beyond the per-run sweep (e.g. accumulated -incomplete-<runId> salvage refs)",
    )
    .addCommand(
      new Command("incomplete-branches")
        .description(
          "Surface vp-dev/<agent>/issue-<N>-incomplete-<runId> refs older than the retention threshold. Default: list only.",
        )
        .option(
          "--target-repo <owner/repo>",
          "Target GitHub repo, used to derive the conventional clone path",
        )
        .option(
          "--target-repo-path <path>",
          "Local clone path of the target repo (default: $HOME/dev/<repo-name>)",
        )
        .option(
          "--retention-days <n>",
          `Surface refs older than this many days (default: ${DEFAULT_INCOMPLETE_RETENTION_DAYS}, env: INCOMPLETE_BRANCH_RETENTION_DAYS)`,
          parsePositive,
        )
        .option(
          "--apply",
          "Actually delete surfaced refs locally (default: list only, never delete)",
        )
        .option(
          "--dry-run",
          "Force list-only mode (overrides --apply for explicit safety)",
        )
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdCleanupIncompleteBranches(opts);
        }),
    );
  program.addCommand(cleanupCmd);

  return program;
}

interface RunOpts {
  agents?: number;
  targetRepo?: string;
  targetRepoPath?: string;
  issues?: string;
  resume?: boolean;
  dryRun?: boolean;
  maxTicks: number;
  stalledThresholdDays: number;
  verbose?: boolean;
  yes?: boolean;
  plan?: boolean;
  confirm?: string;
  includeNonReady?: boolean;
  maxCostUsd?: string;
}

async function cmdRun(opts: RunOpts): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "INFO: ANTHROPIC_API_KEY is not set; falling back to Claude Code OAuth credentials at ~/.claude/credentials.json.\n",
    );
  }

  if (opts.resume) {
    await runResume(opts);
    return;
  }

  if (opts.plan && opts.confirm) {
    console.error("ERROR: --plan and --confirm are mutually exclusive.");
    process.exit(2);
  }
  if (opts.plan && opts.yes) {
    console.error("ERROR: --plan and --yes are mutually exclusive (plan emits a token to confirm later, not auto-approve).");
    process.exit(2);
  }
  if (opts.confirm && opts.yes) {
    console.error("ERROR: --confirm and --yes are mutually exclusive (a verified plan token is itself the approval).");
    process.exit(2);
  }

  // --confirm overlays params from the token file, so the user only types the
  // token. We hold the loaded record to verify the previewHash matches the
  // re-built preview below.
  let confirmRecord: Awaited<ReturnType<typeof readRunConfirmToken>> | null = null;
  if (opts.confirm) {
    const r = await readRunConfirmToken(opts.confirm);
    if (!r.ok) {
      console.error(`ERROR: ${r.message}`);
      process.exit(2);
    }
    confirmRecord = r;
    const p = r.record.params;
    opts.agents = p.agents;
    opts.targetRepo = p.targetRepo;
    opts.targetRepoPath = p.targetRepoPath;
    opts.issues = p.issues;
    opts.dryRun = p.dryRun;
    opts.maxTicks = p.maxTicks;
    opts.stalledThresholdDays = p.stalledThresholdDays;
    opts.includeNonReady = p.includeNonReady;
    opts.verbose = p.verbose;
  }

  if (opts.agents === undefined || !opts.targetRepo) {
    console.error("ERROR: --agents and --target-repo are required (unless --confirm).");
    process.exit(2);
  }
  if (!opts.issues) {
    console.error("ERROR: --issues is required (or pass --resume).");
    process.exit(2);
  }

  const existing = await readCurrentRunId();
  if (existing) {
    try {
      const state = await loadRunState(existing);
      if (!isRunComplete(state)) {
        console.error(
          `ERROR: unfinished run ${existing} exists. Pass --resume to continue, or wait for it to complete.`,
        );
        process.exit(2);
      }
    } catch {
      await clearCurrentRunId();
    }
  }

  const range: IssueRangeSpec = parseRangeSpec(opts.issues);
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);

  // Per-run cost tracker (issue #85, Phase 1). Instantiated here so triage
  // cost (which fires BEFORE the runId is minted on line ~451) accumulates
  // into the same total as orchestrator + coding-agent spend.
  //
  // Issue #98: the budget is now threaded into the tracker constructor so
  // `runCodingAgent` can derive a per-query `maxBudgetUsd` via
  // `remainingBudget()` and let the SDK hard-stop the agent on cost
  // exhaustion. This replaces the old `maxTurns: 50` ceiling on pass 1 —
  // cost is the real constraint, and the turn cap was an indirect proxy
  // that fired at a less-meaningful boundary (issue #34 hit it mid-edit
  // on a 9-file plan despite making forward progress).
  const budgetUsd = resolveBudgetUsd({ flag: opts.maxCostUsd, env: process.env });
  const costTracker = new RunCostTracker({ budgetUsd });

  const { open, skippedClosed } = await resolveRangeToIssues(opts.targetRepo, range);
  if (open.length === 0) {
    console.error("ERROR: no open issues in range.");
    process.exit(2);
  }

  // Pre-dispatch triage runs BEFORE the approval gate so the user sees the
  // skipped set before y/N. Logger is opened early under a triage-prefixed id
  // (the real runId is only minted after gate approval); the file lives
  // alongside the eventual run log under logs/. --include-non-ready bypasses
  // the haiku call entirely — no value in spending tokens on a result we're
  // about to ignore.
  const triageLogger = new Logger({
    runId: `triage-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    verbose: !!opts.verbose,
  });
  await triageLogger.open();
  let dispatchIssues = open;
  let triageSkipped: TriageSkipped[] = [];
  // `undefined` distinguishes "triage was bypassed" (omit gate line) from
  // "triage ran but everything was a cache hit" (show $0.0000). Per #55
  // acceptance: "no change when triage is disabled — the line is
  // omitted, not zero-valued."
  let triageCostUsd: number | undefined;
  try {
    if (opts.includeNonReady) {
      triageLogger.info("triage.bypassed", { reason: "--include-non-ready", issueCount: open.length });
    } else {
      const triaged = await triageBatch({
        targetRepo: opts.targetRepo,
        issues: open,
        logger: triageLogger,
      });
      dispatchIssues = triaged.filter((t) => t.result.ready).map((t) => t.issue);
      triageSkipped = triaged
        .filter((t) => !t.result.ready)
        .map((t) => ({ issue: t.issue, reason: t.result.reason }));
      triageCostUsd = triaged.reduce((sum, t) => sum + t.costUsd, 0);
      // Pre-dispatch triage runs BEFORE the runId / orchestrator is set up,
      // but the cost belongs to the same per-run total — fold it in here so
      // `run.completed` reports a single number that reconciles with the SDK
      // billing dashboard.
      costTracker.add(triageCostUsd);
      triageLogger.info("triage.batch_completed", {
        total: triaged.length,
        ready: dispatchIssues.length,
        skipped: triageSkipped.length,
        cacheHits: triaged.filter((t) => t.fromCache).length,
        totalCostUsd: triageCostUsd,
      });
    }
  } finally {
    await triageLogger.close();
  }

  if (dispatchIssues.length === 0) {
    console.error(
      `ERROR: all ${open.length} open issue(s) filtered by triage as not-ready. Re-run with --include-non-ready to dispatch them anyway.`,
    );
    process.exit(2);
  }

  // Issues with an open vp-dev PR can't be re-dispatched: `git worktree add
  // -b <branch>` collides on the branch the prior run pushed. Filter them
  // before the gate so the user sees the skip in the preview. Per #62 — the
  // smallest, least surprising default.
  const openPrMap = await findOpenVpDevPrs({
    targetRepo: opts.targetRepo,
    repoPath,
  });
  const { dispatchIssues: dispatchAfterPr, openPrSkipped } = partitionOpenPrIssues(
    dispatchIssues,
    openPrMap,
  );
  const triagePassedCount = dispatchIssues.length;
  dispatchIssues = dispatchAfterPr;
  if (dispatchIssues.length === 0) {
    console.error(
      `ERROR: all ${triagePassedCount} triage-ready issue(s) are already covered by an open vp-dev PR. Let those PRs land (or close them) before re-dispatching.`,
    );
    process.exit(2);
  }

  const registry = await loadRegistry();
  const preview = await buildSetupPreview({
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(range),
    openIssues: dispatchIssues,
    closedSkipped: skippedClosed,
    parallelism: opts.agents,
    dryRun: !!opts.dryRun,
    resume: false,
    registry,
    triageSkipped,
    openPrSkipped,
    triageCostUsd,
  });

  if (opts.plan) {
    const previewText = formatSetupPreview(preview);
    process.stdout.write(previewText);
    process.stdout.write("\n\n");
    await pruneExpiredTokens();
    const token = mintToken();
    const record = await writeRunConfirmToken({
      token,
      previewHash: hashPreview(previewText),
      params: {
        agents: opts.agents,
        targetRepo: opts.targetRepo,
        targetRepoPath: opts.targetRepoPath,
        issues: opts.issues,
        dryRun: !!opts.dryRun,
        maxTicks: opts.maxTicks,
        stalledThresholdDays: opts.stalledThresholdDays,
        includeNonReady: !!opts.includeNonReady,
        verbose: !!opts.verbose,
      },
    });
    process.stdout.write("Plan saved. No agents launched.\n");
    process.stdout.write(`  Token:    ${token}\n`);
    process.stdout.write(`  Expires:  ${record.expiresAt}\n`);
    process.stdout.write("\nTo launch this run, invoke:\n");
    process.stdout.write(`  vp-dev run --confirm ${token}\n\n`);
    process.stdout.write(
      "If the registry / open-issue set changes before --confirm, the previewHash check fails and forces a fresh --plan.\n",
    );
    return;
  }

  if (confirmRecord && confirmRecord.ok) {
    const previewText = formatSetupPreview(preview);
    process.stdout.write(previewText);
    process.stdout.write("\n\n");
    const currentHash = hashPreview(previewText);
    if (currentHash !== confirmRecord.record.previewHash) {
      console.error(
        "ERROR: Plan diverged: the preview at confirm time does not match the preview at plan time.",
      );
      console.error(
        "  Registry, open-issue set, or triage outcome changed between --plan and --confirm.",
      );
      console.error("  Re-run with --plan to see the updated preview, then --confirm the new token.");
      process.exit(2);
    }
    process.stdout.write(`Plan token ${opts.confirm} verified. Launching run.\n`);
    await deleteRunConfirmToken(opts.confirm!);
  } else {
    const approved = await approveSetup({ preview, yes: !!opts.yes });
    if (!approved) {
      process.stderr.write("Aborted by user.\n");
      process.exit(1);
    }
  }

  const runId = makeRunId();
  const state = newRunState({
    runId,
    targetRepo: opts.targetRepo,
    issueRange: range,
    parallelism: opts.agents,
    issueIds: dispatchIssues.map((i) => i.id),
    dryRun: !!opts.dryRun,
  });
  await saveRunState(state);
  await writeCurrentRunId(runId);

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.started", {
    runId,
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    parallelism: opts.agents,
    range: opts.issues,
    issueCount: dispatchIssues.length,
    triageSkippedCount: triageSkipped.length,
    dryRun: !!opts.dryRun,
    // `null` (not omitted) when no budget is set so log consumers can
    // distinguish "Phase-1 run with no cap" from "older log without
    // cost-tracking columns" without parsing the runId timestamp.
    maxCostUsd: budgetUsd ?? null,
  });

  try {
    await pruneWorktrees(repoPath);
    const sweep = await pruneStaleAgentBranches(repoPath, opts.targetRepo, logger);
    if (sweep.unprunable.length > 0) {
      state.unprunableStaleBranches = sweep.unprunable;
      await saveRunState(state);
      process.stderr.write(formatUnprunableWarning(sweep.unprunable, { color: !!process.stderr.isTTY }));
    }
    await pollOutcomesLazy({ logger, staleThresholdDays: opts.stalledThresholdDays });
    await runOrchestrator({
      state,
      issues: dispatchIssues,
      parallelism: opts.agents,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: !!opts.dryRun,
      targetRepoPath: repoPath,
      costTracker,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: dispatchIssues.length,
      // Run-final accounting (#85 acceptance): single total summed across
      // triage + dispatcher + coding-agent. Reconciles with the SDK
      // billing dashboard.
      totalCostUsd: costTracker.total(),
      maxCostUsd: budgetUsd ?? null,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
  process.stdout.write(`Run ${runId} log: logs/${runId}.jsonl\n`);
}

/**
 * Lazy outcome poll on `vp-dev run`. Wrapped in try/catch so a transient
 * `gh` failure (network down, auth blip) never blocks the run.
 */
async function pollOutcomesLazy(opts: {
  logger: Logger;
  staleThresholdDays: number;
}): Promise<void> {
  try {
    const result = await pollOutcomes({
      staleThresholdDays: opts.staleThresholdDays,
      onWarn: (msg) => opts.logger.warn("outcomes.poll_warn", { msg }),
    });
    opts.logger.info("outcomes.polled", {
      appended: result.appended.length,
      pending: result.pendingPrs,
      errors: result.errors,
    });
  } catch (err) {
    opts.logger.warn("outcomes.poll_failed", { err: (err as Error).message });
  }
}

async function runResume(opts: RunOpts): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    console.error("ERROR: no current run to resume.");
    process.exit(2);
  }
  const state = await loadRunState(runId);
  downgradeInFlightToPending(state);
  await saveRunState(state);

  const repoPath = await resolveTargetRepoPath(state.targetRepo, opts.targetRepoPath);
  await pruneWorktrees(repoPath);

  const { open, skippedClosed } = await resolveRangeToIssues(state.targetRepo, state.issueRange);
  const tracked = new Set(Object.keys(state.issues).map(Number));
  const trackedOpen = open.filter((i) => tracked.has(i.id));

  // Same filter as `cmdRun` — issues whose vp-dev branch already has an
  // open PR can't be re-dispatched without colliding on `git worktree add
  // -b`. On resume this is even more likely: a previous run that crashed
  // mid-tick will have left in-flight PRs behind.
  const openPrMap = await findOpenVpDevPrs({
    targetRepo: state.targetRepo,
    repoPath,
  });
  const { dispatchIssues: issues, openPrSkipped } = partitionOpenPrIssues(
    trackedOpen,
    openPrMap,
  );

  const registry = await loadRegistry();
  const preview = await buildSetupPreview({
    targetRepo: state.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(state.issueRange),
    openIssues: issues,
    closedSkipped: skippedClosed,
    parallelism: state.parallelism,
    dryRun: state.dryRun,
    resume: true,
    registry,
    openPrSkipped,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.resumed", {
    runId,
    parallelism: state.parallelism,
    issueCount: issues.length,
  });
  try {
    const sweep = await pruneStaleAgentBranches(repoPath, state.targetRepo, logger);
    if (sweep.unprunable.length > 0) {
      state.unprunableStaleBranches = sweep.unprunable;
      await saveRunState(state);
      process.stderr.write(formatUnprunableWarning(sweep.unprunable, { color: !!process.stderr.isTTY }));
    }
    await pollOutcomesLazy({ logger, staleThresholdDays: opts.stalledThresholdDays });
    await runOrchestrator({
      state,
      issues,
      parallelism: state.parallelism,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: state.dryRun,
      targetRepoPath: repoPath,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: issues.length,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
}

async function cmdStatus(): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    process.stdout.write("No active run.\n");
    return;
  }
  const state = await loadRunState(runId);
  const total = Object.keys(state.issues).length;
  const counts = { pending: 0, "in-flight": 0, done: 0, failed: 0 };
  for (const e of Object.values(state.issues)) counts[e.status] += 1;
  process.stdout.write(`Run ${runId} on ${state.targetRepo}\n`);
  process.stdout.write(
    `  total=${total} pending=${counts.pending} in-flight=${counts["in-flight"]} done=${counts.done} failed=${counts.failed}\n`,
  );
  process.stdout.write(`  ticks=${state.tickCount} parallelism=${state.parallelism} dryRun=${state.dryRun}\n`);
  // Resolve names from registry (best-effort — keep status read-only).
  const reg = await loadRegistry();
  const nameOf = new Map(reg.agents.map((a) => [a.agentId, a.name]));
  for (const a of state.agents) {
    const label = nameOf.get(a.agentId) ? `${nameOf.get(a.agentId)} (${a.agentId})` : a.agentId;
    process.stdout.write(`  agent ${label}: ${a.status}\n`);
  }
}

interface AgentsSpecialtiesOpts {
  topTags: number;
  all?: boolean;
  json?: boolean;
}

async function cmdAgentsSpecialties(opts: AgentsSpecialtiesOpts): Promise<void> {
  const reg = await loadRegistry();
  if (reg.agents.length === 0) {
    process.stdout.write("No agents in registry yet.\n");
    return;
  }

  // Filter archived (split-parent) agents from the default view — the
  // dispatcher already skips them, so they're not part of the dispatchable
  // roster. `--all` opts back into the historical view.
  const visibleAgents = opts.all ? reg.agents : reg.agents.filter((a) => !a.archived);
  if (visibleAgents.length === 0) {
    process.stdout.write("No active agents in registry (all archived). Pass --all to include archived agents.\n");
    return;
  }

  // Tag distinctiveness: count how many agents in the fleet carry each tag.
  // A tag is "distinctive" to an agent if it appears in at most ~1/3 of the
  // fleet — rarer tags carry more signal about what makes this agent unique.
  // Distinctiveness is computed against the visible set so the cutoff scales
  // with what the user is actually looking at.
  const tagFleetFreq = new Map<string, number>();
  for (const a of visibleAgents) for (const t of a.tags) tagFleetFreq.set(t, (tagFleetFreq.get(t) ?? 0) + 1);
  const distinctiveCutoff = Math.max(2, Math.ceil(visibleAgents.length / 3));

  type Profile = {
    agentId: string;
    name?: string;
    archived: boolean;
    issuesHandled: number;
    implementCount: number;
    pushbackCount: number;
    errorCount: number;
    lastActiveAt: string;
    distinctiveTags: string[];
    novelLessons: string[];
  };

  const profiles: Profile[] = [];
  for (const a of visibleAgents) {
    let agentMd = "";
    try {
      agentMd = await fs.readFile(agentClaudeMdPath(a.agentId), "utf-8");
    } catch {
      // Per-agent CLAUDE.md not yet forked or removed — no summarizer history.
    }
    const distinctiveTags = a.tags
      .filter((t) => (tagFleetFreq.get(t) ?? 0) <= distinctiveCutoff)
      .slice(0, opts.topTags);
    profiles.push({
      agentId: a.agentId,
      name: a.name,
      archived: !!a.archived,
      issuesHandled: a.issuesHandled,
      implementCount: a.implementCount,
      pushbackCount: a.pushbackCount,
      errorCount: a.errorCount,
      lastActiveAt: a.lastActiveAt,
      distinctiveTags,
      novelLessons: extractSummarizerLessons(agentMd),
    });
  }

  // Order: most-active first.
  profiles.sort((x, y) => y.issuesHandled - x.issuesHandled);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ profiles }, null, 2) + "\n");
    return;
  }

  for (const p of profiles) {
    const baseLabel = p.name ? `${p.name} (${p.agentId})` : p.agentId;
    const label = p.archived ? `${baseLabel} [archived]` : baseLabel;
    process.stdout.write(
      `\n=== ${label}  handled=${p.issuesHandled}  impl=${p.implementCount}  pb=${p.pushbackCount}  err=${p.errorCount}  lastActive=${p.lastActiveAt}\n`,
    );
    process.stdout.write(
      `Distinctive tags (in ≤${distinctiveCutoff}/${reg.agents.length} agents): ${p.distinctiveTags.length > 0 ? p.distinctiveTags.join(", ") : "(none — all tags are widely shared)"}\n`,
    );
    if (p.novelLessons.length === 0) {
      process.stdout.write(`Summarizer-appended lessons: (none — agent hasn't accumulated specialization yet)\n`);
    } else {
      process.stdout.write(`Summarizer-appended lessons (${p.novelLessons.length}):\n`);
      for (const h of p.novelLessons) process.stdout.write(`  - ${h}\n`);
    }
  }
}

// Summarizer prepends each appended section with a provenance comment of the
// form `<!-- run:... issue:#N outcome:... ts:... -->` before the `## heading`
// (see appendBlock in src/agent/specialization.ts). Inherited / hand-written
// sections have no such marker, so this regex isolates exactly what the
// summarizer added across runs — robust against the target-repo seed
// changing shape after agents were forked.
const SUMMARIZER_LESSON_RE = /<!--\s*run:[^>]*?-->\s*\n## (.+)/g;

function extractSummarizerLessons(md: string): string[] {
  if (!md) return [];
  const out: string[] = [];
  for (const m of md.matchAll(SUMMARIZER_LESSON_RE)) out.push(m[1].trim());
  return out;
}

interface AgentsSplitOpts {
  json?: boolean;
  force?: boolean;
  apply?: boolean;
  yes?: boolean;
}

async function cmdAgentsSplit(agentId: string, opts: AgentsSplitOpts): Promise<void> {
  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (agent.archived) {
    process.stderr.write(`ERROR: agent '${agentId}' is already archived (already split).\n`);
    process.exit(2);
  }
  const { md, bytes } = await readAgentClaudeMdBytes(agentId);
  const verdict = detectOverload(agent, bytes);
  if (!verdict && !opts.force) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ agentId, overloaded: false, claudeMdBytes: bytes }, null, 2) + "\n");
      return;
    }
    process.stdout.write(
      `${agentId} has not crossed the overload threshold (issuesHandled=${agent.issuesHandled}, tags=${agent.tags.length}, CLAUDE.md=${(bytes / 1024).toFixed(1)}KB). Pass --force to propose a split anyway.\n`,
    );
    return;
  }

  process.stdout.write(`Generating split proposal for ${agentId}...\n`);
  const proposal = await proposeSplit({ agent, claudeMd: md });

  if (!opts.apply) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            agentId,
            overloaded: !!verdict,
            overloadReasons: verdict?.reasons ?? [],
            proposal,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    if (verdict) {
      process.stdout.write(`\nOverload verdict: ${verdict.reasons.join(", ")}\n\n`);
    }
    process.stdout.write(formatProposal(proposal) + "\n");
    return;
  }

  // --apply path: confirm with user, then mutate.
  if (proposal.clusters.length < 2) {
    process.stderr.write(
      `ERROR: cannot apply — proposal has ${proposal.clusters.length} cluster(s), need >= 2.\n${proposal.notes ?? ""}\n`,
    );
    process.exit(2);
  }
  process.stdout.write(formatProposal(proposal) + "\n\n");
  const confirmed = await confirmApply({
    agentId,
    childCount: proposal.clusters.length,
    yes: !!opts.yes,
  });
  if (!confirmed) {
    process.stdout.write("Aborted — no mutation.\n");
    return;
  }

  const result = await applySplit({ proposal, parentClaudeMd: md });
  if (opts.json) {
    process.stdout.write(JSON.stringify({ agentId, applied: true, ...result }, null, 2) + "\n");
    return;
  }
  process.stdout.write(
    `Applied. Created ${result.childIds.length} children from ${result.parentAgentId}: ${result.childIds.join(", ")}\nParent archived.\n`,
  );
}

async function confirmApply(input: {
  agentId: string;
  childCount: number;
  yes: boolean;
}): Promise<boolean> {
  if (input.yes) {
    process.stdout.write("Auto-confirmed (--yes).\n");
    return true;
  }
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to skip confirmation.\n",
    );
    return false;
  }
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `Apply split: archive ${input.agentId} and create ${input.childCount} children? [y/N] `,
      )
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

interface AgentsPruneOpts {
  json?: boolean;
  apply?: boolean;
  yes?: boolean;
}

async function cmdAgentsPrune(opts: AgentsPruneOpts): Promise<void> {
  const reg = await loadRegistry();
  const proposals = detectPruneCandidates({ registry: reg });

  if (!opts.apply) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ proposals }, null, 2) + "\n");
      return;
    }
    process.stdout.write(formatPruneProposals(proposals));
    return;
  }

  if (proposals.length === 0) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ applied: [] }, null, 2) + "\n");
      return;
    }
    process.stdout.write("No prune candidates — nothing to apply.\n");
    return;
  }

  process.stdout.write(formatPruneProposals(proposals) + "\n");
  const confirmed = await confirmPruneApply({ count: proposals.length, yes: !!opts.yes });
  if (!confirmed) {
    process.stdout.write("Aborted — no mutation.\n");
    return;
  }

  const applied: Array<{ proposal: PruneProposal; result: PruneApplyResult }> = [];
  for (const p of proposals) {
    const result = await applyPruneProposal(p);
    applied.push({ proposal: p, result });
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ applied }, null, 2) + "\n");
    return;
  }
  for (const a of applied) {
    process.stdout.write(
      `merged ${a.proposal.absorbed} -> ${a.proposal.survivor}; archived to ${a.result.archivedTo}\n`,
    );
  }
}

async function confirmPruneApply(input: { count: number; yes: boolean }): Promise<boolean> {
  if (input.yes) {
    process.stdout.write("Auto-confirmed (--yes).\n");
    return true;
  }
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to skip confirmation.\n",
    );
    return false;
  }
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(`Apply ${input.count} prune proposal(s)? [y/N] `)
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

interface AgentsListOpts {
  all?: boolean;
}

async function cmdAgentsList(opts: AgentsListOpts): Promise<void> {
  const reg = await loadRegistry();
  if (reg.agents.length === 0) {
    process.stdout.write("No agents in registry yet.\n");
    return;
  }
  // Default: hide archived (split-parent) agents — the dispatcher skips them,
  // and showing them next to active children inflates the apparent roster
  // size. `--all` opts back into the historical view and surfaces an
  // `archived` column so the rows stay visually distinguishable.
  const visibleAgents = opts.all ? reg.agents : reg.agents.filter((a) => !a.archived);
  if (visibleAgents.length === 0) {
    process.stdout.write("No active agents in registry (all archived). Pass --all to include archived agents.\n");
    return;
  }
  const headers = ["name", "agentId", "tags", "issuesHandled", "implement", "pushback", "error", "lastActive"];
  if (opts.all) headers.push("archived");
  const rows = visibleAgents.map((a) => {
    const row = [
      a.name ?? "",
      a.agentId,
      a.tags.join(","),
      String(a.issuesHandled),
      String(a.implementCount),
      String(a.pushbackCount),
      String(a.errorCount),
      a.lastActiveAt,
    ];
    if (opts.all) row.push(a.archived ? "yes" : "");
    return row;
  });
  printTable(headers, rows);
}

interface SpawnOpts {
  agent: string;
  issue: number;
  targetRepo: string;
  targetRepoPath?: string;
  dryRun?: boolean;
  verbose?: boolean;
  skipSummary?: boolean;
  inspectPaths?: string;
}

async function cmdSpawn(opts: SpawnOpts): Promise<void> {
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);
  const issue = await getIssue(opts.targetRepo, opts.issue);
  if (!issue) {
    process.stderr.write(`ERROR: issue #${opts.issue} not found in ${opts.targetRepo}.\n`);
    process.exit(2);
  }
  if (issue.state === "closed") {
    process.stderr.write(`ERROR: issue #${opts.issue} is closed.\n`);
    process.exit(2);
  }

  const agent = await resolveOrMintAgent(opts.agent, repoPath);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${opts.agent}' not found in registry. Pass --agent new to mint a fresh general.\n`);
    process.exit(2);
  }

  const runId = `spawn-${new Date().toISOString().replace(/[:.]/g, "-")}-issue-${opts.issue}`;
  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("spawn.started", {
    runId,
    agentId: agent.agentId,
    issueId: opts.issue,
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    dryRun: !!opts.dryRun,
    skipSummary: !!opts.skipSummary,
  });

  try {
    await fetchOriginMain(repoPath);
    await pruneWorktrees(repoPath);
    const sweep = await pruneStaleAgentBranches(repoPath, opts.targetRepo, logger);
    if (sweep.unprunable.length > 0) {
      // `vp-dev spawn` doesn't carry a RunState, so the audit trail lives
      // only in the run log JSONL. Still surface the actionable summary
      // on stderr — same yellow header as `vp-dev run` (#63).
      process.stderr.write(formatUnprunableWarning(sweep.unprunable, { color: !!process.stderr.isTTY }));
    }

    const inspectPaths = opts.inspectPaths
      ? opts.inspectPaths.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;

    const result = await runIssueCore({
      agent,
      issue,
      targetRepo: opts.targetRepo,
      targetRepoPath: repoPath,
      runId,
      dryRun: !!opts.dryRun,
      logger,
      skipSummary: !!opts.skipSummary,
      inspectPaths,
    });

    const out = {
      runId,
      agentId: agent.agentId,
      agentTags: agent.tags,
      issueId: opts.issue,
      envelope: result.envelope ?? null,
      isError: result.isError,
      errorReason: result.errorReason ?? null,
      parseError: result.parseError ?? null,
      durationMs: result.durationMs,
      costUsd: result.costUsd ?? null,
      appendOutcome: result.appendOutcome ?? null,
      summarySkipReason: result.summarySkipReason ?? null,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } finally {
    await logger.close();
  }
}

async function resolveOrMintAgent(spec: string, repoPath: string): Promise<AgentRecord | null> {
  if (spec === "new") {
    const fresh = await mutateRegistry((reg) => createAgent(reg));
    await forkClaudeMd(fresh.agentId, repoPath);
    return fresh;
  }
  const reg = await loadRegistry();
  const found = reg.agents.find((a) => a.agentId === spec);
  return found ?? null;
}

interface PickOpts {
  issues: string;
  targetRepo: string;
  parallelism: number;
  targetRepoPath?: string;
  json?: boolean;
}

async function cmdAgentsPick(opts: PickOpts): Promise<void> {
  const ids = opts.issues
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parsePositive(s));

  const issues: IssueSummary[] = [];
  const closed: number[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const issue = await getIssue(opts.targetRepo, id);
    if (!issue) missing.push(id);
    else if (issue.state === "closed") closed.push(id);
    else issues.push(issue);
  }

  const reg = await loadRegistry();
  const result = pickAgents({
    reg,
    pendingIssues: issues,
    maxParallelism: opts.parallelism,
  });

  if (opts.json) {
    const payload = {
      targetRepo: opts.targetRepo,
      parallelism: opts.parallelism,
      issues: issues.map((i) => ({ id: i.id, title: i.title, labels: i.labels })),
      missing,
      closed,
      reusedAgents: result.reusedAgents.map((p) => ({
        agentId: p.agent.agentId,
        name: p.agent.name,
        tags: p.agent.tags,
        issuesHandled: p.agent.issuesHandled,
        score: p.score,
      })),
      newAgentsToMint: result.newAgentsToMint,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  process.stdout.write(`Picks for ${opts.targetRepo} (parallelism=${opts.parallelism}):\n`);
  process.stdout.write(`  open issues:    ${issues.length}\n`);
  if (closed.length) process.stdout.write(`  closed skipped: ${closed.length} (${closed.join(",")})\n`);
  if (missing.length) process.stdout.write(`  not found:      ${missing.length} (${missing.join(",")})\n`);
  process.stdout.write("\n");

  if (result.reusedAgents.length === 0) {
    process.stdout.write("  (no agents in registry)\n");
  } else {
    for (const p of result.reusedAgents) {
      const tagStr = p.agent.tags.length > 0 ? p.agent.tags.join(",") : "general";
      const label = p.agent.name ? `${p.agent.name} (${p.agent.agentId})` : p.agent.agentId;
      process.stdout.write(
        `  ${label}  tags=[${tagStr}]  issuesHandled=${p.agent.issuesHandled}  score=${p.score.toFixed(3)}\n`,
      );
    }
  }
  if (result.newAgentsToMint > 0) {
    process.stdout.write(`  + ${result.newAgentsToMint} fresh general agent(s) needed\n`);
  }
}

interface AgentsStatsOpts {
  json?: boolean;
  poll?: boolean;
  all?: boolean;
  stalledThresholdDays: number;
}

async function cmdAgentsStats(opts: AgentsStatsOpts): Promise<void> {
  if (opts.poll) {
    const result = await pollOutcomes({
      staleThresholdDays: opts.stalledThresholdDays,
      onWarn: (msg) => process.stderr.write(`WARN: ${msg}\n`),
    });
    if (!opts.json) {
      process.stderr.write(
        `Polled outcomes: appended=${result.appended.length} pending=${result.pendingPrs} errors=${result.errors}\n`,
      );
    }
  }

  const reg = await loadRegistry();
  const visible = opts.all ? reg.agents : reg.agents.filter((a) => !a.archived);
  if (visible.length === 0) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ rollups: [] }, null, 2) + "\n");
      return;
    }
    process.stdout.write(
      opts.all
        ? "No agents in registry yet.\n"
        : "No active agents in registry. Pass --all to include archived agents.\n",
    );
    return;
  }

  const outcomesByAgent = await loadAllOutcomes(visible.map((a) => a.agentId));
  const rollups: AgentRollup[] = visible.map((a) =>
    rollupOutcomes({
      agentId: a.agentId,
      name: a.name,
      outcomes: outcomesByAgent.get(a.agentId) ?? [],
    }),
  );

  // Sort merge-rate desc, then runs desc as a tiebreaker so a 1/1 agent
  // doesn't outrank a 9/10 agent.
  rollups.sort((x, y) => y.mergeRate - x.mergeRate || y.runs - x.runs);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ rollups }, null, 2) + "\n");
    return;
  }

  // costUsd + $/merge column intentionally absent — populated once cost
  // tracking lands (see issue #34). Don't stub a dead column.
  const headers = ["agent", "runs", "merged", "closed", "stalled", "merge-rate", "median-rework", "median-ci"];
  const rows = rollups.map((r) => [
    r.name ? `${r.name} (${r.agentId})` : r.agentId,
    String(r.runs),
    String(r.merged),
    String(r.closedUnmerged),
    String(r.stalled),
    r.runs === 0 ? "n/a" : `${Math.round(r.mergeRate * 100)}%`,
    String(r.medianRework),
    String(r.medianCiCycles),
  ]);
  printTable(headers, rows);
}

interface LessonsListOpts {
  json?: boolean;
  global?: boolean;
}

async function cmdLessonsList(opts: LessonsListOpts): Promise<void> {
  const tier: LessonTier = opts.global ? "global" : "target";
  const pools = await listSharedLessonDomains(tier);
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ tier, pools, maxPoolLines: MAX_POOL_LINES }, null, 2) + "\n",
    );
    return;
  }
  if (pools.length === 0) {
    const reviewHint = opts.global ? "vp-dev lessons review --global" : "vp-dev lessons review";
    process.stdout.write(
      `No ${tier} shared-lesson pools yet. Run \`${reviewHint}\` after a summarizer pass tags a promote-candidate.\n`,
    );
    return;
  }
  process.stdout.write(`tier: ${tier}\n`);
  const headers = ["domain", "lines", "bytes", "path"];
  const rows = pools.map((p) => [
    p.domain,
    `${p.totalLines}/${MAX_POOL_LINES}`,
    String(p.bytes),
    p.filePath,
  ]);
  printTable(headers, rows);
}

interface LessonsReviewOpts {
  json?: boolean;
  yes?: boolean;
  global?: boolean;
}

async function cmdLessonsReview(opts: LessonsReviewOpts): Promise<void> {
  const tier: LessonTier = opts.global ? "global" : "target";
  const reg = await loadRegistry();
  // Don't filter archived agents — the candidate may have been tagged before
  // a split, and we still want to surface it. The boundary that matters is
  // the human-review gate, not the agent's lifecycle status.
  const pending = await collectPendingCandidates(reg.agents);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          tier,
          pending: pending.map((p) => ({
            agentId: p.agentId,
            agentName: p.agentName,
            domain: p.candidate.domain,
            startLine: p.candidate.startLine,
            endLine: p.candidate.endLine,
            body: p.candidate.body,
            validation: p.validation,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (pending.length === 0) {
    process.stdout.write("No promote-candidate blocks pending review.\n");
    return;
  }

  const tierLabel = tier === "global" ? "global (~/.vaultpilot/shared-lessons/)" : "per-target (agents/.shared/lessons/)";
  process.stdout.write(
    `${pending.length} promote-candidate block(s) pending review. Accepting writes to: ${tierLabel}\n\n`,
  );

  if (opts.yes) {
    await runAutoAcceptLoop(pending, tier);
    return;
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to auto-accept everything that validates, or pipe to a TTY.\n",
    );
    process.exit(2);
  }

  await runInteractiveReview(pending, tier);
}

async function runAutoAcceptLoop(pending: PendingCandidate[], tier: LessonTier): Promise<void> {
  let acceptedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;
  for (const p of pending) {
    if (!p.validation.ok) {
      const reason = `validation failed: ${p.validation.errors.join("; ")}`;
      await rejectCandidate({ pending: p, reason });
      process.stdout.write(`rejected (validation) ${p.agentId} -> ${p.candidate.domain}: ${reason}\n`);
      rejectedCount += 1;
      continue;
    }
    const result = await acceptCandidate({ pending: p, tier });
    if (result.appendOutcome.kind === "appended") {
      process.stdout.write(
        `accepted [${tier}] ${p.agentId} -> ${p.candidate.domain} (${result.appendOutcome.totalLines}/${MAX_POOL_LINES} lines)\n`,
      );
      acceptedCount += 1;
    } else if (result.appendOutcome.kind === "rejected-pool-full") {
      process.stdout.write(
        `skipped (pool full) [${tier}] ${p.agentId} -> ${p.candidate.domain}: ${result.appendOutcome.totalLines}/${MAX_POOL_LINES} lines. Trim the pool by hand and re-run review.\n`,
      );
      skippedCount += 1;
    } else {
      process.stdout.write(
        `skipped (validation) ${p.agentId} -> ${p.candidate.domain}\n`,
      );
      skippedCount += 1;
    }
  }
  process.stdout.write(
    `\nDone: accepted=${acceptedCount} rejected=${rejectedCount} skipped=${skippedCount}\n`,
  );
}

async function runInteractiveReview(pending: PendingCandidate[], tier: LessonTier): Promise<void> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let acceptedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;
  try {
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      process.stdout.write(`\n--- candidate ${i + 1}/${pending.length} ---\n`);
      const sourceLabel = p.agentName ? `${p.agentName} (${p.agentId})` : p.agentId;
      process.stdout.write(`source:  ${sourceLabel}\n`);
      process.stdout.write(`domain:  ${p.candidate.domain}\n`);
      process.stdout.write(`source CLAUDE.md lines ${p.candidate.startLine + 1}..${p.candidate.endLine + 1}\n`);
      if (p.validation.errors.length > 0) {
        process.stdout.write(`errors:  ${p.validation.errors.join("; ")}\n`);
      }
      if (p.validation.warnings.length > 0) {
        process.stdout.write(`warnings: ${p.validation.warnings.join("; ")}\n`);
      }
      process.stdout.write("\n--- body ---\n");
      process.stdout.write(p.candidate.body + "\n");
      process.stdout.write("--- /body ---\n\n");

      const allowAccept = p.validation.ok;
      const choices = allowAccept ? "[a]ccept / [r]eject / [s]kip" : "[r]eject / [s]kip (validation failed; cannot accept)";
      const answer = (await rl.question(`Action ${choices}? `)).trim().toLowerCase();
      if (answer === "a" || answer === "accept") {
        if (!allowAccept) {
          process.stdout.write("Cannot accept — validation failed. Treating as skip.\n");
          skippedCount += 1;
          continue;
        }
        const result = await acceptCandidate({ pending: p, tier });
        if (result.appendOutcome.kind === "appended") {
          process.stdout.write(
            `Accepted [${tier}]: appended to ${result.appendOutcome.filePath} (${result.appendOutcome.totalLines}/${MAX_POOL_LINES} lines).\n`,
          );
          acceptedCount += 1;
        } else if (result.appendOutcome.kind === "rejected-pool-full") {
          process.stdout.write(
            `POOL FULL: ${result.appendOutcome.filePath} reached ${result.appendOutcome.totalLines}/${MAX_POOL_LINES} lines. Trim the pool file by hand and re-run review for this candidate. (Marker left in source CLAUDE.md.)\n`,
          );
          skippedCount += 1;
        } else {
          process.stdout.write(`Append refused (validation): ${result.appendOutcome.validation.errors.join("; ")}\n`);
          skippedCount += 1;
        }
        continue;
      }
      if (answer === "r" || answer === "reject") {
        const reason = (await rl.question("Reason (one short sentence): ")).trim() || "no reason given";
        await rejectCandidate({ pending: p, reason });
        process.stdout.write("Rejected. Source marker rewritten.\n");
        rejectedCount += 1;
        continue;
      }
      // anything else == skip
      process.stdout.write("Skipped — marker left in source CLAUDE.md, will resurface next review.\n");
      skippedCount += 1;
    }
  } finally {
    rl.close();
  }
  process.stdout.write(
    `\nReview complete: accepted=${acceptedCount} rejected=${rejectedCount} skipped=${skippedCount}\n`,
  );
}

interface CleanupIncompleteOpts {
  targetRepo?: string;
  targetRepoPath?: string;
  retentionDays?: number;
  apply?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

async function cmdCleanupIncompleteBranches(
  opts: CleanupIncompleteOpts,
): Promise<void> {
  if (!opts.targetRepo && !opts.targetRepoPath) {
    process.stderr.write(
      "ERROR: --target-repo or --target-repo-path is required to locate the local clone.\n",
    );
    process.exit(2);
  }
  let repoPath: string;
  try {
    repoPath = await resolveTargetRepoPath(
      opts.targetRepo ?? "",
      opts.targetRepoPath,
    );
  } catch (err) {
    process.stderr.write(
      `ERROR: could not resolve target-repo path: ${(err as Error).message}\n`,
    );
    process.exit(2);
  }

  const retentionDays = resolveRetentionDays({
    flag: opts.retentionDays,
    env: process.env,
  });

  const all = await listIncompleteBranches({ repoPath });
  const stale = filterByRetention(all, retentionDays);

  // --dry-run forces list-only even if --apply is also passed. Per #96
  // scope: --dry-run is the explicit safety override that wins.
  const willDelete = !!opts.apply && !opts.dryRun && stale.length > 0;

  if (opts.json) {
    const payload: Record<string, unknown> = {
      retentionDays,
      totalScanned: all.length,
      surfaced: stale,
      willDelete,
    };
    if (willDelete) {
      const result = await pruneIncompleteBranches({
        repoPath,
        branches: stale.map((b) => b.branch),
      });
      payload.deleted = result.deleted;
      payload.failed = result.failed;
    }
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  if (stale.length === 0) {
    process.stdout.write(
      `No -incomplete-<runId> refs older than ${retentionDays} day(s). (Scanned ${all.length} total in ${repoPath}.)\n`,
    );
    return;
  }

  process.stdout.write(
    `${stale.length} -incomplete-<runId> ref(s) older than ${retentionDays} day(s) in ${repoPath}:\n\n`,
  );
  printTable(
    ["branch", "age(days)", "agent", "issue", "runState"],
    stale.map((b: IncompleteBranchInfo) => [
      b.branch,
      String(b.ageDays),
      b.agentId,
      String(b.issueId),
      b.runStateRef,
    ]),
  );

  if (!willDelete) {
    if (opts.apply && opts.dryRun) {
      process.stdout.write(
        "\n--dry-run wins over --apply: list-only mode. Re-run without --dry-run to delete.\n",
      );
    } else {
      process.stdout.write(
        "\nList-only (default). Re-run with --apply to delete these branches locally.\n",
      );
    }
    return;
  }

  // --apply path. Local-only `git branch -D`; never touches origin.
  const result = await pruneIncompleteBranches({
    repoPath,
    branches: stale.map((b) => b.branch),
  });
  process.stdout.write(`\nDeleted ${result.deleted.length} branch(es) locally.\n`);
  for (const d of result.deleted) process.stdout.write(`  - ${d}\n`);
  if (result.failed.length > 0) {
    process.stdout.write(
      `\nCould not delete ${result.failed.length} branch(es) (likely attached to a worktree):\n`,
    );
    for (const f of result.failed) {
      process.stdout.write(`  - ${f.branch}: ${f.reason.trim()}\n`);
    }
    process.stdout.write(
      "  To clean up: `git worktree remove --force <path>` first, then re-run with --apply.\n",
    );
  }
  process.stdout.write(
    "\nNote: this command is local-only. To remove the corresponding remote refs, run:\n",
  );
  process.stdout.write(
    "  git push origin --delete <branch>   (per branch; review before running)\n",
  );
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  process.stdout.write(fmt(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const r of rows) process.stdout.write(fmt(r) + "\n");
}

function parsePositive(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Expected positive integer, got "${value}"`);
  }
  return n;
}

/**
 * Split a candidate dispatch list into (issues to dispatch, issues to skip
 * because an open vp-dev PR already covers them). Pure — no I/O.
 *
 * Per issue #62: when `pruneStaleAgentBranches` keeps a branch because
 * `gh pr list --head <branch> --state open` returned a row, the dispatcher's
 * `git worktree add -b <branch>` will collide. Pre-filtering here makes the
 * skip explicit in the y/N gate instead of surfacing as an
 * `error.agent.uncaught` mid-run.
 */
function partitionOpenPrIssues(
  issues: IssueSummary[],
  openPrMap: Map<number, { branch: string; prUrl: string; agentId: string }>,
): { dispatchIssues: IssueSummary[]; openPrSkipped: OpenPrSkipped[] } {
  const dispatchIssues: IssueSummary[] = [];
  const openPrSkipped: OpenPrSkipped[] = [];
  for (const issue of issues) {
    const pr = openPrMap.get(issue.id);
    if (pr) {
      openPrSkipped.push({
        issue,
        agentId: pr.agentId,
        branch: pr.branch,
        prUrl: pr.prUrl,
      });
    } else {
      dispatchIssues.push(issue);
    }
  }
  return { dispatchIssues, openPrSkipped };
}
