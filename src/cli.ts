import { Command } from "commander";
import {
  clearCurrentRunId,
  downgradeInFlightToPending,
  isRunComplete,
  findLatestRunId,
  loadRunState,
  makeRunId,
  newRunState,
  readCurrentRunId,
  saveRunState,
  writeCurrentRunId,
} from "./state/runState.js";
import { createAgent, loadRegistry, mutateRegistry } from "./state/registry.js";
import { parseRangeSpec, describeRange } from "./github/range.js";
import {
  closeIssueAsDuplicate,
  getIssue,
  getIssueDetail,
  postIssueComment,
  resolveRangeToIssues,
  type IssueDetail,
} from "./github/gh.js";
import { pickAgents, runOrchestrator } from "./orchestrator/orchestrator.js";
import { detectDuplicates } from "./orchestrator/dedup.js";
import {
  checkDependencies,
  type DeferredByDependency,
} from "./orchestrator/dependencies.js";
import {
  approveSetup,
  buildSetupPreview,
  formatSetupPreview,
  type IssueCostForecastEntry,
  type OpenPrSkipped,
  type TriageSkipped,
} from "./orchestrator/setup.js";
import {
  estimateIssueCost,
  partitionByBudget,
  readPlanFileForIssue,
  type IssueCostEstimate,
} from "./orchestrator/costEstimator.js";
import {
  deleteRunConfirmToken,
  hashPreview,
  mintToken,
  pruneExpiredTokens,
  readRunConfirmToken,
  writeRunConfirmToken,
} from "./state/runConfirm.js";
import { triageBatch } from "./orchestrator/triage.js";
import { resolvedModelTiers } from "./orchestrator/models.js";
import { Logger } from "./log/logger.js";
import {
  fetchOriginMain,
  formatUnprunableWarning,
  pruneStaleAgentBranches,
  pruneWorktrees,
  resolveTargetRepoPath,
} from "./git/worktree.js";
import { findOpenVpDevPrs } from "./git/openPrs.js";
import { formatStatusJson, formatStatusText } from "./state/statusFormatter.js";
import { resolveRenderMode, watchStatus } from "./util/statusWatcher.js";
import {
  DEFAULT_INCOMPLETE_RETENTION_DAYS,
  filterByRetention,
  findIncompleteBranchesOnOrigin,
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
  parseClaudeMdSections,
  proposeSplit,
  readAgentClaudeMdBytes,
} from "./agent/split.js";
import {
  DEFAULT_MIN_CLUSTER_SIZE,
  applyCompaction,
  formatCompactionProposal,
  proposeCompaction,
  resolveMinClusterSize,
} from "./agent/compactClaudeMd.js";
import {
  DEFAULT_MAX_SAVINGS_PCT,
  formatTightenProposal,
  proposeTighten,
} from "./agent/tightenClaudeMd.js";
import {
  computeProposalHash,
  deleteCompactConfirmToken,
  mintToken as mintCompactToken,
  readCompactConfirmToken,
  writeCompactConfirmToken,
} from "./state/compactConfirm.js";
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
  sharedLessonsPath,
  type LessonTier,
} from "./agent/sharedLessons.js";
import {
  appendBodyJaccardLogLine,
  computeBodyJaccardScore,
  loadComparandClaudeMd,
} from "./agent/bodyJaccardLog.js";
import {
  evaluateLocalClaudeUtilityGate,
  type LocalClaudeUtilityGateResult,
} from "./agent/localClaudeQueue.js";
import {
  openLocalClaudePr,
  type OpenLocalClaudePrOutcome,
} from "./agent/localClaudePr.js";
import { isLocalClaudeCandidate } from "./util/promotionMarkers.js";
import {
  applyTrimProposal,
  formatTrimProposal,
  proposeTrim,
  type ApplyTrimResult,
  type PoolFile,
  type TrimProposal,
} from "./agent/trimPool.js";
import {
  DEFAULT_SNAPSHOT_REPO,
  pullSnapshot,
  pushSnapshot,
  type ConflictPolicy,
  type SyncSummary,
} from "./agent/snapshotSync.js";
import { isValidDomain } from "./util/promotionMarkers.js";
import {
  loadAllOutcomes,
  pollOutcomes,
  rollupOutcomes,
  type AgentRollup,
} from "./state/outcomes.js";
import { RunCostTracker, resolveBudgetUsd } from "./util/costTracker.js";
import { formatRunCompletedSentinel } from "./util/runCompletedSentinel.js";
import { formatRunReport } from "./util/runReport.js";
import { diffPreview } from "./util/previewDiff.js";
import type { AgentRecord, DuplicateCluster, IssueRangeSpec, IssueSummary, ResumeContext, RunState } from "./types.js";
import { STATE_DIR } from "./state/runState.js";
import { defaultRunLogPath, loadRunActivity } from "./state/runActivity.js";
import path from "node:path";

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
      "Per-run cost ceiling in USD (e.g. 5.0). Once the per-run total exceeds this value the orchestrator stops dispatching, marks remaining pending issues 'aborted-budget', and lets in-flight issues finish naturally (#86). Env fallback: VP_DEV_MAX_COST_USD.",
    )
    .option(
      "--prefer-agent <agentId>",
      "Force-pick the named agent for this run. Bumps its score by +1.0 in pickAgents() and the dispatcher's deterministic fallback so it leads regardless of natural Jaccard fit. Validated against the registry before the gate; archived agents are rejected.",
    )
    .option(
      "--resume-incomplete",
      "Phase 1 (#118): record the intent to resume from a salvageable `*-incomplete-<runId>` branch on origin. Phase 1 only logs the intent + carries it through --plan/--confirm; the actual worktree-from-partial-branch behavior is Phase 2's territory (still routes from main today).",
    )
    .option(
      "--auto-phase-followup",
      "Phase 2 of #134 (#142): when set, every coding agent dispatched in this run gets the workflow prompt's Step N+1 'Auto-file next phase' section rendered (#141). Agents working on phase-marked issues (title 'Phase X:' or '## Phases' body section) file a follow-up Phase N+1 issue after `gh pr create` succeeds and surface its URL via the envelope's `nextPhaseIssueUrl`. Off by default — explicit opt-in.",
    )
    .option(
      "--apply-dedup",
      "Phase 2b of #133 (#148): close non-canonical duplicates with cross-reference comments BEFORE dispatch. After approval, every cluster member that isn't the canonical is commented (`Closing as duplicate of #N per pre-dispatch dedup (run-XXX)`) and closed with `--reason not_planned`; the canonical receives a summary comment listing all closed dups. Mutually exclusive with --skip-dedup. Bound into the --plan/--confirm previewHash so a token written without the flag cannot be confirmed with it.",
    )
    .option(
      "--skip-dedup",
      "Phase 2b of #133 (#148): bypass the pre-dispatch dedup pass entirely (no Opus call, no `dedupCostUsd` line in the gate, no clusters surfaced). Useful for cost-sensitive runs against issue sets known to have no overlap. Mutually exclusive with --apply-dedup.",
    )
    .option(
      "--include-blocked",
      "Issue #185: force-dispatch issues whose body declares an open / unknown / closed-not-planned prerequisite. The dependency check still runs and surfaces the would-be-deferred set as a WARNING block in the gate, but the orchestrator dispatches anyway. Useful when the operator plans to merge a prerequisite mid-run, when the dependency is soft (mention rather than hard prerequisite), or when the dep is on a sibling repo we can't query reliably. Bound into the --plan/--confirm previewHash so a token written without the flag cannot be confirmed with it.",
    )
    .option(
      "--no-report",
      "Suppress the end-of-run result report on stdout (#136). The terminal sentinel (#128) still fires. Use when piping `vp-dev run` output into structured-log consumers that don't want the bounded text block.",
    )
    .option(
      "--json-report",
      "Emit the end-of-run result report as JSON instead of the bounded text block (#136). Same shape as `vp-dev status <runId> --json`. The terminal sentinel still trails on its own line for watcher compatibility.",
    )
    .action(async (opts) => {
      await cmdRun(opts);
    });

  program
    .command("status [runId]")
    .description("Print summary of a run + per-agent state + per-issue detail. With no args: shows the active run if one exists. Pass <runId> to inspect a specific past run, or --latest for the most recent run on disk.")
    .option("--latest", "Inspect the most recent run-<ts>.json on disk regardless of completion")
    .option("--json", "Print machine-readable JSON")
    .option(
      "--watch",
      "Re-render the status block on an interval until the run reaches a terminal state or SIGINT (#124). TTY: clear-and-home + redraw; non-TTY: separator + append; --json: NDJSON one object per tick.",
    )
    .option(
      "--interval <seconds>",
      "Refresh interval for --watch in seconds (default 10)",
      parsePositive,
      10,
    )
    .option(
      "--max-iterations <n>",
      "Escape hatch for --watch: stop after N ticks even if the run hasn't completed",
      parsePositive,
    )
    .action(async (runIdArg, opts) => {
      await cmdStatus(runIdArg, opts);
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
    .option(
      "--allow-closed-issue",
      "Allow dispatching against a closed issue. Default: spawn refuses with exit 2 when issue.state==='closed'. Used by the curve-study calibration flow with --issue-body-only to dispatch against closed-completed issues as ground-truth controls.",
    )
    .option(
      "--issue-body-only",
      "Workflow Step 1 fetches the issue body ONLY — no comments. Suspends the CLAUDE.md 'Issue Analysis' rule for this dispatch. Required for closed-issue calibration runs so the resolution-PR link in close comments doesn't contaminate measurements.",
    )
    .option(
      "--no-target-claude-md",
      "Suppress the live target-repo CLAUDE.md prepend in the agent's system prompt. Default: prepend on (every dispatch's effective context = target-repo CLAUDE.md + per-agent CLAUDE.md). Used by curve-study calibration to keep the effective context size equal to the per-agent CLAUDE.md size we're varying.",
    )
    .option(
      "--model <name>",
      "Coding-agent model override (default: claude-opus-4-7). Curve-redo calibration passes claude-sonnet-4-6 so every cell runs at a uniform tier ~5× cheaper than the prior Opus-only experiments. Recovery passes inherit this override.",
    )
    .option(
      "--replay-base-sha <sha>",
      "Curve-redo replay mode: reset the worktree HEAD to the supplied git SHA before the agent runs (closed-issue replay so the agent encounters the pre-fix codebase state). Open-issue cells omit this flag and stay at origin/main.",
    )
    .option(
      "--capture-diff-path <path>",
      "Curve-redo replay mode: after the agent finishes, write the worktree's diff (modified + newly-staged tracked files) to this path so downstream test-runner / reasoning-judge phases can score it.",
    )
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
      new Command("tighten-claude-md")
        .description(
          "Phase A (#172): propose intra-section prose-tightening rewrites for an agent's CLAUDE.md. Advisory only — no file mutation. The destructive --apply path is tracked at #173.",
        )
        .argument("<agentId>", "Agent to inspect (e.g. agent-916a)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--max-savings-pct <n>",
          "Soft cap on per-section savings before flagging the rewrite as 'excessive-savings' (default 40)",
          parsePositive,
          DEFAULT_MAX_SAVINGS_PCT,
        )
        .option(
          "--no-diff",
          "Suppress per-rewrite unified diffs in the human-readable output (#176). Falls back to the savings-only single-line summary; --json mode is unaffected (always omits diffs to keep the payload lean).",
        )
        .action(async (agentId, opts) => {
          await cmdAgentsTightenClaudeMd(agentId, opts);
        }),
    )
    .addCommand(
      new Command("compact-claude-md")
        .description(
          "Propose merge clusters for an agent's CLAUDE.md (#158 Phase A). With --apply: emit a confirm token (15-min TTL); with --confirm <token>: rewrite the file under the per-file lock (#162 Phase B). Two-step is the human-in-the-loop checkpoint — no single-flag silent bypass.",
        )
        .argument("<agentId>", "Agent to inspect (e.g. agent-916a)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--min-cluster-size <n>",
          "Minimum sections per merge cluster (default 3; 2 is too aggressive per issue #158)",
          parsePositive,
          DEFAULT_MIN_CLUSTER_SIZE,
        )
        .option(
          "--allow-pair-clusters",
          "Lower the cluster-size floor to 2 for this invocation (sugar for --min-cluster-size 2). Surfaces clean 2-section near-duplicates the default-3 floor would orphan; the --apply/--confirm gate is the human-in-the-loop check (per issue #168).",
        )
        .option(
          "--apply",
          "Compute the proposal AND mint a confirm token under state/compact-confirm-<token>.json (15-min TTL). Re-invoke with --confirm <token> to perform the rewrite.",
        )
        .option(
          "--confirm <token>",
          "Apply the proposal recorded in the named token, after re-validating against the live file content.",
        )
        .action(async (agentId, opts) => {
          await cmdAgentsCompactClaudeMd(agentId, opts);
        }),
    )
    .addCommand(
      new Command("prune-lessons")
        .description(
          "Propose removal of stale sections from an agent's CLAUDE.md (#179 Phase 1, option C). Uses utility-scoring data already collected by #178: drops sections with zero reinforcementRuns OR pushbackRuns > reinforcementRuns, after a cool-off of N later siblings. With --apply: mint a confirm token (15-min TTL); with --confirm <token>: perform the destructive rewrite under the per-file lock. Two-step pattern mirrors compact-claude-md.",
        )
        .argument("<agentId>", "Agent to inspect (e.g. agent-916a)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--min-siblings-after <n>",
          "Cool-off: a section is eligible only if at least this many other sections were introduced after it (default 10).",
          parsePositive,
          10,
        )
        .option(
          "--apply",
          "Compute the proposal AND mint a confirm token under state/lesson-prune-confirm-<token>.json (15-min TTL). Re-invoke with --confirm <token> to perform the rewrite.",
        )
        .option(
          "--confirm <token>",
          "Apply the proposal recorded in the named token, after re-validating against the live file content.",
        )
        .action(async (agentId, opts) => {
          await cmdAgentsPruneLessons(agentId, opts);
        }),
    )
    .addCommand(
      new Command("prune-tags")
        .description(
          "Drop registry tags not backed by any CLAUDE.md section + LLM-generalize survivors into broader categories (#219). Phase 1 (orphan drop) is deterministic; Phase 2 (generalization) is an opt-out LLM call. With --apply: mint a confirm token (15-min TTL); with --confirm <token>: mutate the registry under the per-file lock. Two-step pattern mirrors compact-claude-md / prune-lessons.",
        )
        .argument("<agentId>", "Agent to inspect (e.g. agent-92ff)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--no-generalize",
          "Phase 1 only: drop orphan tags, skip the LLM-clustering step. Deterministic, no LLM cost.",
        )
        .option(
          "--apply",
          "Compute the proposal AND mint a confirm token under state/prune-tags-confirm-<token>.json (15-min TTL). Re-invoke with --confirm <token> to mutate the registry.",
        )
        .option(
          "--confirm <token>",
          "Apply the proposal recorded in the named token, after re-validating against the live registry + CLAUDE.md content.",
        )
        .action(async (agentId, opts) => {
          await cmdAgentsPruneTags(agentId, opts);
        }),
    )
    .addCommand(
      new Command("migrate-tags-to-sidecar")
        .description(
          "Move legacy `tags:t1,t2` from sentinel headers in `agents/<id>/CLAUDE.md` into the per-agent `agents/<id>/section-tags.json` sidecar. Idempotent — re-running is a no-op once an agent's CLAUDE.md is clean. Use `--all` to walk every agent under `agents/`, or pass an explicit `<agentId>`.",
        )
        .argument("[agentId]", "Single agent to migrate (omit if --all)")
        .option("--all", "Migrate every directory under `agents/` that has a CLAUDE.md")
        .option("--json", "Print machine-readable JSON")
        .action(async (agentId, opts) => {
          await cmdAgentsMigrateTagsToSidecar(agentId, opts);
        }),
    )
    .addCommand(
      new Command("audit-lessons")
        .description(
          "Score every section of an agent's CLAUDE.md by intrinsic quality (in vacuum — no run history, no comparison across sections). Per-section sonnet calls rate each lesson on the same 0-1 scale as write-time predictedUtility. Advisory only (Phase 1); destructive --apply / --confirm deferred. Combine with `vp-dev agents prune-lessons` for the historical-reinforcement signal.",
        )
        .argument("<agentId>", "Agent to audit (e.g. agent-916a)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--max-cost-usd <usd>",
          "Cumulative cost cap across all section scoring calls (default 5).",
          parsePositive,
          5,
        )
        .option(
          "--concurrency <n>",
          "Parallel scoring calls (default 3 — respects Anthropic rate limits while keeping audit walltime bounded).",
          parsePositive,
          3,
        )
        .action(async (agentId, opts) => {
          await cmdAgentsAuditLessons(agentId, opts);
        }),
    )
    .addCommand(
      new Command("assess-claude-md")
        .description(
          "Phase 3 of #177 (issue #180): per-section verdict (keep / trim / drop) for an agent's CLAUDE.md. Combines #178's per-section utility data (reinforcement, pushback, past-incident, recency, cross-reference) with #179's context-cost curve. Advisory only — destructive --apply path deferred to Phase 4. Composes with compact-claude-md, tighten-claude-md, and prune-lessons.",
        )
        .argument("<agentId>", "Agent to inspect (e.g. agent-916a)")
        .option("--json", "Print machine-readable JSON")
        .option(
          "--keep-threshold <n>",
          "Sections with benefit ≥ this value are kept (default 0.20).",
          parsePositive,
          0.20,
        )
        .option(
          "--drop-threshold <n>",
          "Sections with benefit < this value are dropped (default 0.05).",
          parsePositive,
          0.05,
        )
        .option(
          "--recency-decay-days <n>",
          "Days after which lastReinforcedAt decays to zero recency (default 60).",
          parsePositive,
          60,
        )
        .action(async (agentId, opts) => {
          await cmdAgentsAssessClaudeMd(agentId, opts);
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
    )
    .addCommand(
      new Command("pull-snapshot")
        .description(
          "Sync per-agent CLAUDE.md files DOWN from the snapshot repo (default: szhygulin/vaultpilot-dev-agents) into local agents/. Default policy 'skip-existing' won't clobber a run-in-progress's freshly-summarized memory; --policy overwrite replaces local content under the per-file lock.",
        )
        .option("--repo <owner/repo>", "GitHub snapshot repo", DEFAULT_SNAPSHOT_REPO)
        .option("--clone-dir <path>", "Local clone dir for the snapshot repo (default: .claude/agents-snapshot)")
        .option("--policy <name>", "Conflict policy: skip-existing | overwrite", "skip-existing")
        .option("--dry-run", "Print what would be copied without writing")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsPullSnapshot(opts);
        }),
    )
    .addCommand(
      new Command("push-snapshot")
        .description(
          "Sync local per-agent CLAUDE.md files UP to the snapshot repo. Excludes synthetic curve-redo study agents (agent-916a-trim-*, agent-9180-9189) by default. Without --apply it's a dry run; with --apply it branches off origin/main, commits, pushes, and opens a PR via gh.",
        )
        .option("--repo <owner/repo>", "GitHub snapshot repo", DEFAULT_SNAPSHOT_REPO)
        .option("--clone-dir <path>", "Local clone dir for the snapshot repo (default: .claude/agents-snapshot)")
        .option("--include-synthetic", "Include synthetic curve-redo agents (default: skip them)")
        .option(
          "--apply",
          "Perform the push: commit + push + open PR. Without this flag, only the diff summary is printed.",
        )
        .option("--branch <name>", "Branch name to push (default: refresh-snapshot-YYYY-MM-DD)")
        .option("--message <text>", "Commit message + PR title")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsPushSnapshot(opts);
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
        .option(
          "--pr",
          "For `@local-claude` candidates: open a chore PR appending the lesson to project-local CLAUDE.md instead of staging to the queue file. With --yes, autonomous: gate=let-through → PR; gate=skip → queue. PR failures fall back to the queue so data isn't lost. Operator-invoked CLI flow — exempt from the in-run write-side-effect rule.",
        )
        .action(async (opts) => {
          await cmdLessonsReview(opts);
        }),
    )
    .addCommand(
      new Command("trim")
        .description("LLM-driven proposal to drop low-signal entries from a shared-lesson pool that hit the line cap")
        .argument("<domain>", "Pool domain to trim (e.g. 'solana'). Must match an existing pool file under agents/.shared/lessons/.")
        .option("--json", "Print the ranked proposal as JSON and exit (no mutation)")
        .option("--yes", "Auto-accept the LLM's proposal (required for non-TTY environments)")
        .option("--drop-maybes", "Treat 'maybe' verdicts as drops too (default: keep them)")
        .action(async (domain, opts) => {
          await cmdLessonsTrim(domain, opts);
        }),
    )
    .addCommand(
      new Command("clear-local-queue")
        .description(
          "Drop already-merged entries from state/local-claude-md-pending.md (issue #202, follow-up to PR #196). Compares each queue entry's heading + body-prefix against project-local CLAUDE.md sections via Jaccard; entries above threshold are considered already promoted. Default: advisory (lists what would be removed). With --apply: mutates the queue file under tmp-then-rename.",
        )
        .option(
          "--all",
          "Operator override: drop EVERY queue entry (e.g. after a manual cleanup pass). Mutually exclusive with --merged.",
        )
        .option(
          "--merged",
          "Drop only entries with similarity ≥ threshold to a project-local CLAUDE.md section (default mode when neither --all nor --merged is passed)",
        )
        .option(
          "--threshold <n>",
          "Override Jaccard threshold (0..1; default 0.55, env: VP_DEV_QUEUE_CLEAR_JACCARD_MIN)",
          parseUnitInterval,
        )
        .option(
          "--apply",
          "Actually mutate the queue file (default: list-only)",
        )
        .option("--yes", "Skip the y/N confirmation in --apply mode (required for non-TTY environments)")
        .option("--json", "Print machine-readable JSON output")
        .action(async (opts) => {
          await cmdLessonsClearLocalQueue(opts);
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

  const researchCmd = new Command("research")
    .description("Research tools (curve-study, plan-trims, register-trims) — operator-input studies that update calibrated artifacts under src/util/")
    .addCommand(
      new Command("register-trims")
        .description(
          "Register dev-agents named in an agents-spec JSON (output of plan-trims) into state/agents-registry.json and copy their CLAUDE.md files into agents/<devAgentId>/CLAUDE.md. Idempotent — re-running with the same spec is a no-op for already-registered IDs (CLAUDE.md is overwritten).",
        )
        .requiredOption("--agents-spec <path>", "agents-spec JSON produced by plan-trims")
        .requiredOption("--trims-dir <path>", "Directory containing the trimmed CLAUDE.md files (the plan-trims --output-dir)")
        .option("--tags-from <agentId>", "Copy the tag set from this parent agent so --prefer-agent matching works. Default: tags=['research-study'].")
        .action(async (opts) => {
          await cmdResearchRegisterTrims(opts);
        }),
    )
    .addCommand(
      new Command("plan-trims")
        .description(
          "Generate a random-sampled trim plan from a parent CLAUDE.md. For each target size, emits K replicates with different random subsets of sections — across replicates every section appears in some small trims and is absent from others, so the curve study's regression learns size's effect averaged over section identity. Writes one trimmed CLAUDE.md per (size, replicate) plus an agents-spec.json the operator feeds into curve-study after registering the dev-agents and creating per-agent clones.",
        )
        .requiredOption("--parent <agentId>", "Parent dev-agent whose agents/<id>/CLAUDE.md is the source")
        .requiredOption("--sizes <list>", "Comma-separated target sizes in bytes (e.g. 6000,14000,22000,30000,42000,58000)")
        .requiredOption("--replicates <n>", "K replicates per size (≥5 recommended for variance averaging)", parsePositive)
        .requiredOption("--output-dir <path>", "Where to write trimmed CLAUDE.md files (one per replicate)")
        .requiredOption("--output-spec <path>", "Where to write the agents-spec JSON for curve-study")
        .option("--seed-base <n>", "RNG seed base for reproducibility", parsePositive, 42)
        .option("--preserve <list>", "Comma-separated section slugs (id from heading) to keep in every trim. NOTE: any preserved section is a confounder; report it in the study writeup.", "")
        .option("--clone-base <path>", "Per-agent dedicated clone path template. Tokens: {agentId}, {repo}. When {repo} appears, the spec emits one entry per (agent × repo) so curve-study can dispatch the same agent against multiple repos with isolated clones. Default: /tmp/study-clones/{agentId}")
        .option("--repos <list>", "Comma-separated repo basenames substituted into the {repo} token of --clone-base. Required when {repo} is in --clone-base; ignored otherwise.")
        .action(async (opts) => {
          await cmdResearchPlanTrims(opts);
        }),
    )
    .addCommand(
      new Command("curve-study")
        .description(
          "Refit src/util/contextCostCurve.ts (CLAUDE.md size → accuracyDegradationFactor). Operator pre-trims the parent dev-agent into N forks at chosen byte budgets and registers them; this command dispatches all (devAgent × issue) cells with 4-way parallelism + per-dev-agent serialization, aggregates outcomes, scores quality per #179, fits an OLS polynomial regression, and writes a JSON proposal the operator hand-merges into CONTEXT_COST_SAMPLES. Each cell runs ISOLATED — neither the live target-repo CLAUDE.md nor the user-global ~/.claude/CLAUDE.md is loaded. Effective context per cell = per-agent CLAUDE.md only, matching the size axis we're varying. Isolation is hardcoded; running loaded would distort the curve by an operator-specific amount.",
        )
        .requiredOption("--agents-spec <path>", "JSON file: array of {devAgentId, sizeBytes, clonePath}")
        .requiredOption("--target-repo <owner/repo>", "GitHub target repo (e.g. szhygulin/vaultpilot-mcp-smoke-test)")
        .requiredOption("--issues <list>", "Comma-separated issue numbers (e.g. 50,52,54)")
        .option("--logs-dir <path>", "Where per-cell logs land", "logs")
        .option("--output <path>", "Where to write the JSON curve proposal", "curve-study-output.json")
        .option("--parallelism <n>", "Max concurrent research agents", parsePositive, 4)
        .option("--rubrics <path>", "Optional JSON file: array of {agentId, issueId, pushbackAccuracy?, prCorrectness?}")
        .option("--no-dry-run", "Disable --dry-run on spawn (default: dry-run on; intercepts push/PR side effects)")
        .option(
          "--allow-closed-issue",
          "Forward --allow-closed-issue to each cell's spawn. Required when --issues includes closed-completed issue numbers (ground-truth controls).",
        )
        .option(
          "--issue-body-only",
          "Forward --issue-body-only to each cell's spawn. Step 1 fetches body only — no comments. Required for closed-issue dispatches so the resolution-PR link doesn't contaminate the measurement.",
        )
        .option(
          "--max-total-cost-usd <usd>",
          "Cumulative cost cap (USD) across all cells. Dispatch aborts when reached and the partial results are aggregated. Defense in depth on top of per-cell --max-cost-usd.",
          parsePositive,
        )
        .option(
          "--mode <mode>",
          "replace (proposal = freshly measured samples only) | update (proposal = existing CONTEXT_COST_SAMPLES merged with fresh samples, re-fitted)",
          "replace",
        )
        .option(
          "--collision-policy <policy>",
          "When --mode update finds a fresh sample at the same xBytes as an existing one: replace-on-collision | average-on-collision | keep-both",
          "replace-on-collision",
        )
        .option(
          "--curve-form <form>",
          "Regression form: linear-log (y ~ a + b·log(x)) | linear-raw (y ~ a + b·x) | poly2-log (y ~ a + b·log(x) + c·log(x)²) | poly2-raw (y ~ a + b·x + c·x²). Default poly2-raw per #179 curve-redo finding (combined-leg dataset is non-monotone in log(bytes); poly2-raw clears accuracy F-test at p=0.030 R²adj=0.29, where linear-log gives p=0.737 R²≈0).",
          "poly2-raw",
        )
        .option(
          "--cell-scores-dir <path>",
          "Curve-redo Phase 1d: read per-cell A (reasoning judge) + B (hidden-test pass rate) JSONs from this directory and use the 0–200 quality formula instead of the envelope-label-derived QualityScore. Each cell needs `<agentId>-<issueId>-tests.json` and `-judge.json` files written by `vp-dev research run-tests` and `vp-dev research grade-reasoning`. Cells missing either side score 0.",
        )
        .action(async (opts) => {
          await cmdResearchCurveStudy(opts);
        }),
    )
    .addCommand(
      new Command("bench-specialists")
        .description(
          "Run experiment 2 of #179: dispatch the same N issues used in the curve study against the orchestrator's best-fit specialists (per-issue picker via Jaccard tag overlap). K=3 replicates per issue. Compares treatment cells against the curve-study trim baseline via paired Wilcoxon (cost: H1 specialist < trim; quality: H1 specialist > trim) + Holm-Bonferroni adjustment + Hedges' g effect size. ARCHIVE the 18 trim agents BEFORE running so the picker doesn't pick them.",
        )
        .requiredOption(
          "--issues <list>",
          "Comma-separated issue numbers (the same 13 used in experiment 1).",
        )
        .requiredOption("--target-repo <owner/repo>", "GitHub target repo")
        .requiredOption(
          "--clone-path <path>",
          "Path to a fresh clone of the target repo (cwd for spawn).",
        )
        .requiredOption(
          "--control-logs-dirs <list>",
          "Comma-separated directories holding experiment-1 control cells (e.g. research/issue-179-data/logs-mcp,research/issue-179-data/logs-dev).",
        )
        .option(
          "--replicates <n>",
          "K replicates per issue (default 3).",
          parsePositive,
          3,
        )
        .option("--logs-dir <path>", "Where treatment-arm logs land", "research/issue-179-data/logs-bench")
        .option("--output <path>", "Where to write the JSON output", "research/issue-179-data/bench-specialists.json")
        .option(
          "--max-cost-usd <usd>",
          "Cumulative cap; aborts further dispatches when reached.",
          parsePositive,
        )
        .option("--control-prefix <s>", "Filename prefix used by control logs", "curveStudy-")
        .option(
          "--skip-dispatch",
          "Skip the dispatch step + only re-aggregate existing treatment logs (after a partial run).",
        )
        .action(async (opts) => {
          await cmdResearchBenchSpecialists(opts);
        }),
    )
    .addCommand(
      new Command("generate-tests")
        .description(
          "Curve-redo Phase 1b: generate exactly N hidden tests per issue via Opus. Writes one .test.ts per generated test under --out-dir. Coding agents do NOT see these tests — they're applied to the agent's worktree-diff in Phase 1c's testRunner to score implementation quality. Default 4 batches × 25 tests = 100. Baseline-validation (do all tests fail before any agent runs?) is a Phase 2 operator concern, NOT this subcommand's responsibility.",
        )
        .requiredOption("--issue <n>", "Issue number to generate tests for", parsePositive)
        .requiredOption("--target-repo <owner/repo>", "Target GitHub repo (for issue body fetch)")
        .option(
          "--target-repo-path <path>",
          "Local clone path of the target repo (used for repo-tree + style fixture). Defaults to $HOME/dev/<repo-name>.",
        )
        .requiredOption(
          "--framework <name>",
          "Target test framework: 'node-test' (vp-development-agents) or 'vitest' (vp-mcp).",
        )
        .requiredOption(
          "--out-dir <path>",
          "Where the .test.ts files land (e.g. research/curve-redo-bundle/curve-redo-tests/<issueId>/). Created if missing.",
        )
        .option(
          "--batch-count <n>",
          "Number of LLM calls (default 4). Total tests = batch-count × tests-per-batch.",
          parsePositive,
          4,
        )
        .option(
          "--tests-per-batch <n>",
          "Tests requested per LLM call (default 25). Total tests = batch-count × tests-per-batch.",
          parsePositive,
          25,
        )
        .option(
          "--style-fixture <path>",
          "Optional path to a sibling .test.ts file to use as a style hint. Defaults to the largest .test.ts found in the repo.",
        )
        .action(async (opts) => {
          await cmdResearchGenerateTests(opts);
        }),
    )
    .addCommand(
      new Command("run-tests")
        .description(
          "Curve-redo Phase 1c: apply a captured cell diff to a fresh clone at the issue base SHA, copy the issue's hidden tests in, run the framework, and write the per-cell test-pass score JSON for Phase 1d's aggregator. Default test command: `npx --yes tsx --test ${testsGlob}` (node-test) / `npx --yes vitest run ${testsDir}` (vitest); override with --test-cmd.",
        )
        .option(
          "--diff-path <path>",
          "Cell's captured worktree diff (Phase 1a output). Omit when --baseline-only is set.",
        )
        .requiredOption("--tests-dir <path>", "Directory with the issue's hidden .test.ts files")
        .requiredOption(
          "--clone-dir <path>",
          "Fresh clone at the issue's base SHA (operator-managed; testRunner does not clone).",
        )
        .requiredOption("--framework <name>", "'node-test' or 'vitest'")
        .requiredOption("--out <path>", "Where to write the per-cell test-pass score JSON")
        .option("--timeout-ms <n>", "Per-cell test runtime cap (default 5 min).", parsePositive, 300000)
        .option(
          "--test-cmd <template>",
          "Override the framework's command template. Substitutions: ${testsGlob}, ${testsDir}.",
        )
        .option("--baseline-only", "Skip diff application — count baseline pass rate.")
        .option(
          "--tests-dest-rel-dir <path>",
          "Clone-relative directory to copy hidden tests into before running. Default `curve-redo-hidden-tests`. Set per-issue (e.g. `src/agent`) when generated tests use sibling imports (`./<x>.js`) that match the codebase's source-tree colocation pattern.",
        )
        .action(async (opts) => {
          await cmdResearchRunTests(opts);
        }),
    )
    .addCommand(
      new Command("grade-reasoning")
        .description(
          "Curve-redo Phase 1c: blinded Opus K=3 grading of a cell's diff (decision=implement) or pushback comment (decision=pushback). Output JSON has {median, scores, variance, rationales} for Phase 1d's aggregator. Agent IDs / branch names / replicate hints are stripped before sending — judges grade the artifact, not the agent.",
        )
        .requiredOption("--issue <n>", "Issue number (for body fetch)", parsePositive)
        .requiredOption("--target-repo <owner/repo>", "GitHub target repo")
        .requiredOption(
          "--decision <name>",
          "'implement' or 'pushback' (or 'error' to record a 0 score)",
        )
        .option(
          "--diff-path <path>",
          "Path to the cell's captured diff. Required when --decision implement.",
        )
        .option(
          "--pushback-path <path>",
          "Path to a file with the pushback comment text. Required when --decision pushback.",
        )
        .option("--k <n>", "Number of judge samples (default 3).", parsePositive, 3)
        .requiredOption("--out <path>", "Where to write the per-cell judge score JSON")
        .action(async (opts) => {
          await cmdResearchGradeReasoning(opts);
        }),
    );
  program.addCommand(researchCmd);

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
  preferAgent?: string;
  resumeIncomplete?: boolean;
  // Issue #142 (Phase 2 of #134): per-run flag that enables the
  // workflow prompt's Step N+1 ("Auto-file next phase") section. Off by
  // default. Persisted into the confirm token so a `--plan` → `--confirm`
  // round-trip preserves the operator's opt-in.
  autoPhaseFollowup?: boolean;
  // Issue #148 (Phase 2b of #133): destructive close path. Mutually
  // exclusive with `skipDedup`. When set, every non-canonical cluster
  // member from the dedup detection pass is commented + closed with
  // `--reason not_planned` AFTER approval but BEFORE the orchestrator
  // dispatches, so the run sees only canonicals. Carried through the
  // confirm token; bound into the previewHash via the canonicals-only
  // dispatch list and the rendered cluster block.
  applyDedup?: boolean;
  // Issue #148 (Phase 2b of #133): skip the dedup pass entirely (no
  // model call, no cost line, no clusters surfaced). Mutually exclusive
  // with `applyDedup`.
  skipDedup?: boolean;
  // Issue #185: pre-dispatch dependency check override. When set, the
  // dep check still runs and the would-be-deferred candidates render
  // in a WARNING block in the gate, but they dispatch anyway. Bound
  // into the --plan/--confirm previewHash via the rendered preview
  // text — a token written without the flag cannot be confirmed with
  // it.
  includeBlocked?: boolean;
  // Commander `--no-report` auto-generates `report: boolean` on opts: true
  // by default, false when `--no-report` is passed. Issue #136.
  report?: boolean;
  // Issue #136: route the report through the JSON formatter instead of
  // the bounded text block. Mutually orthogonal to `--no-report`: passing
  // both is a contradiction, treated as suppress.
  jsonReport?: boolean;
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
  // Issue #148 Phase 2b of #133: --apply-dedup performs the destructive
  // close path; --skip-dedup bypasses dedup detection entirely. The two
  // are contradictory intents — there is no "skip detection but apply
  // closes" mode (closes need detection). Reject the contradiction
  // before any work is done so the operator sees a clear error rather
  // than discovering at confirm-time that one flag silently won.
  if (opts.applyDedup && opts.skipDedup) {
    console.error("ERROR: --apply-dedup and --skip-dedup are mutually exclusive.");
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
    // Carry the cost ceiling forward — same partition at confirm-time as at
    // plan-time. Older tokens (pre-#86/#99) leave this undefined which
    // matches "no ceiling" semantics.
    opts.maxCostUsd = p.maxCostUsd;
    opts.preferAgent = p.preferAgentId;
    // #118 Phase 1: carry the resume intent across --plan → --confirm.
    // Phase 1 has no behavior coupling beyond the run-start log line, but
    // the flag must persist so Phase 2 can light up cleanly.
    opts.resumeIncomplete = p.resumeIncomplete;
    // #142 Phase 2: same plan→confirm carry for the auto-phase-followup
    // opt-in. Token-roundtrip-tested in `runConfirm.test.ts`.
    opts.autoPhaseFollowup = p.autoPhaseFollowup;
    // #148 Phase 2b: same plan→confirm carry for the dedup close-path
    // and skip-pass opt-ins. The previewHash already binds the cluster
    // set + the canonicals-only dispatch list at apply-dedup time, but
    // the flag itself must persist so the confirm-side launch performs
    // the actual closes (or skips detection) on the same intent the
    // operator authorized at plan time.
    opts.applyDedup = p.applyDedup;
    opts.skipDedup = p.skipDedup;
    // #185: same plan→confirm carry for the dependency-check override.
    // The previewHash already binds the deferred / force-included
    // sections rendered in the gate, but the flag itself must persist so
    // the confirm-side launch dispatches the same set the operator
    // authorized at plan time.
    opts.includeBlocked = p.includeBlocked;
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

  // Issue #185: pre-dispatch dependency check. After triage but BEFORE
  // dedup (so dedup operates on the post-deferral set; deferred issues
  // don't waste an Opus call). Fetches the body of each triage-passed
  // candidate, parses any `## Dependencies` (or alias) section / inline
  // `Dependencies:` line, and checks each referenced issue's GitHub
  // state. Candidates with at least one open / unknown / closed-not-
  // planned dep are deferred unless `--include-blocked` is set, in
  // which case they dispatch but render in a WARNING block in the gate.
  // Same-batch deps short-circuit the gh round-trip — we can't wait for
  // them to land mid-run anyway.
  const depsLogger = new Logger({
    runId: `deps-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    verbose: !!opts.verbose,
  });
  await depsLogger.open();
  let dependencyDeferred: DeferredByDependency[] = [];
  let dependencyForceIncluded: DeferredByDependency[] = [];
  try {
    const targetRepo = opts.targetRepo;
    const detailResults = await Promise.all(
      dispatchIssues.map((i) => getIssueDetail(targetRepo, i.id)),
    );
    const candidates = dispatchIssues.map((i, idx) => {
      const detail = detailResults[idx];
      return {
        summary: i,
        // Empty string when fetch failed (404, network) — parseDependencyRefs
        // returns [] for that, so the issue dispatches normally. The dep
        // check is best-effort: a transient gh failure must never block
        // the run by side-effect.
        body: detail?.body ?? "",
      };
    });
    const depResult = await checkDependencies({
      repo: targetRepo,
      candidates,
      includeBlocked: !!opts.includeBlocked,
      logger: depsLogger,
    });
    dispatchIssues = depResult.dispatchIssues;
    dependencyDeferred = depResult.deferred;
    dependencyForceIncluded = depResult.forceIncluded;
    depsLogger.info("deps.batch_completed", {
      total: candidates.length,
      dispatched: dispatchIssues.length,
      deferred: dependencyDeferred.length,
      forceIncluded: dependencyForceIncluded.length,
      includeBlocked: !!opts.includeBlocked,
    });
  } finally {
    await depsLogger.close();
  }

  if (dispatchIssues.length === 0) {
    console.error(
      `ERROR: all ${dependencyDeferred.length} candidate issue(s) deferred by the pre-dispatch dependency check. Land the prerequisite(s) first or re-run with --include-blocked.`,
    );
    process.exit(2);
  }

  // Issue #151 (Phase 2a-ii of #133): pre-dispatch dedup pass.
  // Runs against the triage-passed set so the operator sees clusters of
  // semantically-overlapping candidates in the gate. Phase 2a-ii is
  // advisory only — all cluster members still dispatch. Phase 2b (#148)
  // layers `--apply-dedup` to close non-canonicals before dispatch and
  // `--skip-dedup` to bypass the pass entirely. Single Opus call
  // (`maxTurns: 1`); fail-soft inside `detectDuplicates` so a flaky
  // model never blocks a run.
  const dedupLogger = new Logger({
    runId: `dedup-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    verbose: !!opts.verbose,
  });
  await dedupLogger.open();
  let duplicateClusters: DuplicateCluster[] = [];
  let dedupCostUsd: number | undefined;
  try {
    if (opts.skipDedup) {
      // Issue #148: --skip-dedup bypasses detection entirely. No model
      // call → no cost line in the gate, no clusters surfaced. The gate
      // text omits "Dedup cost:" the same way it omits "Triage cost:"
      // when --include-non-ready is passed (per #55).
      dedupLogger.info("dedup.bypassed", {
        reason: "--skip-dedup",
        issueCount: dispatchIssues.length,
      });
    } else if (dispatchIssues.length < 2) {
      dedupLogger.info("dedup.bypassed", {
        reason: "fewer than 2 candidate issues",
        issueCount: dispatchIssues.length,
      });
    } else {
      // Hoist to a local so the narrowing survives the .map() closure;
      // TS widens `opts.targetRepo` back to `string | undefined` inside
      // the arrow even though the line-461 guard rejected `undefined`.
      const targetRepo = opts.targetRepo;
      const detailResults = await Promise.all(
        dispatchIssues.map((i) => getIssueDetail(targetRepo, i.id)),
      );
      const issueDetails = detailResults.filter(
        (d): d is IssueDetail => d !== null,
      );
      if (issueDetails.length < 2) {
        dedupLogger.warn("dedup.insufficient_details", {
          requested: dispatchIssues.length,
          fetched: issueDetails.length,
        });
      } else {
        const result = await detectDuplicates({
          issues: issueDetails,
          logger: dedupLogger,
          // Issue #156: thread the target repo so the dedup pass can
          // namespace its cache file. The cache stabilizes both the
          // cluster output and the per-call cost across `--plan` and
          // `--confirm` invocations, which keeps the gate-text `Dedup
          // cost:` line identical and prevents previewHash drift.
          targetRepo,
        });
        duplicateClusters = result.clusters;
        dedupCostUsd = result.costUsd;
        // Same accounting pattern as triage: dedup runs before the runId
        // is minted, but its cost belongs to the same per-run total. On
        // a cache hit (`fromCache: true`) the model wasn't invoked and
        // no real spend was billed in this process — but the cost we
        // surface in the gate must match the *original* invocation's
        // cost, otherwise the gate-text and previewHash drift across
        // plan/confirm. We add the cached cost to the tracker too so
        // the per-run total reconciles with the same arithmetic the
        // gate displays. (`costTracker.add(0)` would also be defensible
        // — neither call dollars-billed at the moment — but mirrors
        // triage.ts's behavior where the cached cost flows through.)
        costTracker.add(dedupCostUsd);
        dedupLogger.info("dedup.completed", {
          issueCount: issueDetails.length,
          clusterCount: duplicateClusters.length,
          costUsd: dedupCostUsd,
          fromCache: result.fromCache,
        });
      }
    }
  } finally {
    await dedupLogger.close();
  }

  // Issue #148 (Phase 2b of #133): when --apply-dedup is set, shrink the
  // candidate dispatch list to canonicals-only BEFORE the open-PR /
  // cost-partition / preview stages. The actual `gh issue close` calls
  // run AFTER approval (a destructive side-effect must not happen
  // before the human authorizes the run); pre-filtering here ensures
  // pickAgents and the rendered preview describe the canonical set the
  // run will actually dispatch. The clusters themselves stay rendered
  // in the advisory block so the operator sees what's about to close.
  let plannedDuplicateCloses: { issueId: number; canonical: number }[] = [];
  if (opts.applyDedup && duplicateClusters.length > 0) {
    const candidateIds = new Set(dispatchIssues.map((i) => i.id));
    const dupIdsInCandidateSet = new Set<number>();
    for (const cluster of duplicateClusters) {
      for (const dupId of cluster.duplicates) {
        // Only close duplicates that are still in the candidate set.
        // A duplicate already filtered by triage / open-PR / budget
        // doesn't need closing as part of this run.
        if (candidateIds.has(dupId)) {
          dupIdsInCandidateSet.add(dupId);
          plannedDuplicateCloses.push({ issueId: dupId, canonical: cluster.canonical });
        }
      }
    }
    dispatchIssues = dispatchIssues.filter(
      (i) => !dupIdsInCandidateSet.has(i.id),
    );
    if (dispatchIssues.length === 0) {
      console.error(
        `ERROR: --apply-dedup would close all ${plannedDuplicateCloses.length} candidate issue(s) as duplicates. Inspect the cluster set and re-run without --apply-dedup, or narrow --issues to include the canonicals.`,
      );
      process.exit(2);
    }
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

  // Pre-dispatch cost estimate (#99). For each candidate, read its
  // matching `feature-plans/issue-<N>-*.md` (if present) and compute an
  // estimate. Then partition against `--max-cost-usd` minus the triage
  // spend so issues whose individual estimate exceeds remaining budget are
  // surfaced in the gate as skipped — preventing the doomed-dispatch
  // failure mode from #34.
  const estimates = new Map<number, IssueCostEstimate>();
  for (const issue of dispatchIssues) {
    const plan = await readPlanFileForIssue({
      targetRepoPath: repoPath,
      issueId: issue.id,
    });
    estimates.set(
      issue.id,
      estimateIssueCost({
        planContent: plan?.content,
        planFile: plan?.filename,
      }),
    );
  }
  const partition = partitionByBudget({
    issues: dispatchIssues,
    estimates,
    budgetUsd,
    alreadySpentUsd: triageCostUsd ?? 0,
  });
  const budgetExceededSkipped = partition.budgetExceededSkipped;
  // Forecast covers BOTH dispatched and skipped issues so the gate text can
  // show every estimate the user is being asked to (or refused) to authorize.
  const costForecast: IssueCostForecastEntry[] = dispatchIssues.map((issue) => {
    const est = estimates.get(issue.id)!;
    return {
      issueId: issue.id,
      estimateUsd: est.estimateUsd,
      source: est.source,
      fileCount: est.fileCount,
      planFile: est.planFile,
    };
  });
  const dispatchAfterBudgetCount = partition.dispatch.length;
  dispatchIssues = partition.dispatch;
  if (dispatchIssues.length === 0) {
    console.error(
      `ERROR: all ${dispatchAfterBudgetCount + budgetExceededSkipped.length} candidate issue(s) exceed the per-issue cost budget. Raise --max-cost-usd or split the issues per CLAUDE.md "Pre-dispatch scope-fit check" rule.`,
    );
    process.exit(2);
  }

  // Issue #118 Phase 1: enumerate salvageable `*-incomplete-<runId>` refs
  // on `origin` for the candidate dispatch issues so the preview can
  // surface them under the existing skip blocks. The lookup is purely
  // informational — failures degrade to "no salvage refs visible" rather
  // than blocking the run. Always runs regardless of --resume-incomplete
  // because the section's purpose is to show the user that partial state
  // exists *before* they decide whether to pass the flag.
  // No logger here — the triage logger is already closed and the run-id
  // logger is not yet open. The helper is best-effort: an `ls-remote`
  // failure simply yields an empty section.
  const incompleteOrigin = await findIncompleteBranchesOnOrigin({
    repoPath,
    issueIds: dispatchIssues.map((i) => i.id),
  });
  const incompleteBranchesAvailable = [...incompleteOrigin.values()].flat();

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
    costForecast,
    budgetExceededSkipped,
    budgetUsd,
    preferAgentId: opts.preferAgent,
    incompleteBranchesAvailable,
    duplicateClusters,
    dedupCostUsd,
    dependencyDeferred,
    dependencyForceIncluded,
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
      // Issue #137: persist the preview text so a confirm-time mismatch can
      // surface a unified line diff instead of a generic blame line.
      previewText,
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
        maxCostUsd: opts.maxCostUsd,
        // #118 Phase 1: carry the resume intent across --plan → --confirm.
        resumeIncomplete: opts.resumeIncomplete,
        // #142 Phase 2: persist the auto-phase-followup opt-in so the
        // confirm-side launch sees the same flag the user authorized at
        // plan time. The previewHash already binds this — flipping the
        // value between plan and confirm rebuilds the preview text and
        // rejects with a drift diff.
        autoPhaseFollowup: opts.autoPhaseFollowup,
        // #148 Phase 2b: persist the dedup mode flags. --apply-dedup
        // shrinks the dispatch list (preview text changes → previewHash
        // changes), so a token written under --apply-dedup cannot be
        // confirmed without it (and vice versa). --skip-dedup omits
        // both the cluster block and the dedup-cost line from the
        // preview, so the same hash protection holds.
        applyDedup: opts.applyDedup,
        skipDedup: opts.skipDedup,
        // #185: persist the dependency-check override. When the flag is
        // active, the deferred set renders as a WARNING force-included
        // block instead of a deferred block — the preview text differs
        // either way, and the previewHash binds that difference.
        includeBlocked: opts.includeBlocked,
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
    // Issue #157: surface the progress-check affordance at plan time so the
    // operator sees the canonical commands before the run starts. Without
    // this, agents/operators reach for `pgrep` + `ls -lt logs/` first and
    // burn turns rediscovering `vp-dev status` (no-args reads the active
    // run from `state/current-run.txt`).
    process.stdout.write("\nAfter launch, check progress with:\n");
    process.stdout.write("  vp-dev status                # active run\n");
    process.stdout.write("  vp-dev status --watch        # live tail\n");
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
      const storedText = confirmRecord.record.previewText;
      if (storedText) {
        // Issue #137: emit a unified line diff so the user sees which line
        // actually drifted ("Triage cost: ~$0.0241" → "Triage cost:
        // ~$0.0000", a new triage-skipped entry, an agent score shift,
        // etc) instead of generic prose blame.
        console.error("  Drift detected (- plan-time / + confirm-time):");
        const diff = diffPreview(storedText, previewText);
        for (const line of diff.split("\n")) {
          console.error(`    ${line}`);
        }
      } else {
        // Pre-#137 token without persisted preview text: fall back to the
        // legacy prose error.
        console.error(
          "  Registry, open-issue set, or triage outcome changed between --plan and --confirm.",
        );
      }
      console.error(
        "  Re-run with --plan to see the updated preview, then --confirm the new token.",
      );
      console.error(
        `  Stored hash:  ${confirmRecord.record.previewHash.slice(0, 16)}...`,
      );
      console.error(
        `  Current hash: ${currentHash.slice(0, 16)}...`,
      );
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
    // Persist the resolved ceiling into the run state so `vp-dev run --resume`
    // can re-apply it without the operator re-typing the flag (#86).
    maxCostUsd: budgetUsd,
  });
  // #151 Phase 2a-ii: persist the dedup pass's outcome so post-run audits
  // can attribute the spend (`dedupCostUsd`) and read which clusters were
  // surfaced (`duplicateClustersDetected`) without re-deriving from the
  // JSONL log. Both fields are optional — back-compat with run-state
  // files written before this surface existed (#150 shipped the schema).
  if (duplicateClusters.length > 0) {
    state.duplicateClustersDetected = duplicateClusters;
  }
  if (dedupCostUsd !== undefined) {
    state.dedupCostUsd = dedupCostUsd;
  }
  await saveRunState(state);
  await writeCurrentRunId(runId);

  // Issue #157: launch-time progress-check breadcrumb. Prints once per
  // run, immediately after the run becomes the active run on disk
  // (`state/current-run.txt`), so a mid-flight "how is it going?" question
  // resolves to `vp-dev status` (no-args path) on the first try instead of
  // shell forensics (`pgrep` + `ls -lt logs/` + `vp-dev status --help`).
  process.stdout.write("\nRun launched.\n");
  process.stdout.write(`  runId:           ${runId}\n`);
  process.stdout.write("  Check progress:  vp-dev status            # active run, no args needed\n");
  process.stdout.write("  Live tail:       vp-dev status --watch    # re-renders on interval\n\n");

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
    // #151 Phase 2a-ii: surface dedup outcome on the run-start line so
    // post-run audits can count clusters without parsing the dedup
    // logger's separate file. `null` (not omitted) when the pass was
    // bypassed — distinguishes "no candidates" from "ran free".
    duplicateClusterCount: duplicateClusters.length,
    dedupCostUsd: dedupCostUsd ?? null,
    dryRun: !!opts.dryRun,
    // `null` (not omitted) when no budget is set so log consumers can
    // distinguish "Phase-1 run with no cap" from "older log without
    // cost-tracking columns" without parsing the runId timestamp.
    maxCostUsd: budgetUsd ?? null,
    // Issue #118 Phase 1 / #119 Phase 2: surfaced as a flat boolean so log
    // consumers can count how often the flag is being passed. With Phase 2
    // shipped, when the flag is set AND at least one salvage ref is found
    // for a candidate issue, the orchestrator branches its worktree off
    // that ref + rebases onto origin/main; agents see the prior work as
    // their starting commit.
    resumeIncomplete: !!opts.resumeIncomplete,
    incompleteBranchesAvailableCount: incompleteBranchesAvailable.length,
    // #142 Phase 2: flat boolean in the run-start log so post-run audits
    // can confirm the opt-in was active for this run. Pairs naturally
    // with the `nextPhaseIssueUrl` field surfaced on the per-issue
    // `RunIssueEntry` (#141 Phase 1).
    autoPhaseFollowup: !!opts.autoPhaseFollowup,
    // Issue #139 (Phase 1 of #133): emit the resolved model tier each
    // orchestrator-side LLM call site is configured to use, so post-hoc
    // audits can confirm what tier was actually used (especially when the
    // operator overrode a default via VP_DEV_*_MODEL env vars).
    models: resolvedModelTiers(),
    // Issue #148 Phase 2b: surface the apply-dedup close intent and the
    // count of duplicate issues queued for closure on the started line
    // so post-run audits can attribute closes to a specific run without
    // grepping for individual `dedup.apply.*` events.
    applyDedup: !!opts.applyDedup,
    skipDedup: !!opts.skipDedup,
    plannedDuplicateCloseCount: plannedDuplicateCloses.length,
  });

  // Issue #148 Phase 2b of #133: --apply-dedup close path. Runs AFTER
  // the gate (approval or token-verify) and AFTER the run logger opens
  // so each close lands as a structured `dedup.apply.*` event under the
  // run's JSONL log. The candidate dispatch list was already shrunk to
  // canonicals-only above (so pickAgents and the rendered preview
  // reflect the canonical set); this loop performs the actual side
  // effects.
  //
  // Errors are caught per-cluster — a failed close on one issue (gh
  // network blip, branch protection edge case, etc.) is logged and
  // surfaced via the run-state JSONL log, but never aborts the run. The
  // canonical-side summary still posts even if some duplicate closes
  // failed; it lists only the closes that actually succeeded so the
  // canonical comment doesn't lie about the cross-reference chain.
  if (opts.applyDedup && plannedDuplicateCloses.length > 0) {
    const targetRepo = opts.targetRepo;
    // Group closes per canonical so we can post a single summary
    // comment on each canonical naming the dups that yielded to it.
    const closesByCanonical = new Map<number, { issueId: number; commentUrl: string }[]>();
    let successCount = 0;
    let failureCount = 0;
    for (const planned of plannedDuplicateCloses) {
      try {
        const r = await closeIssueAsDuplicate(
          targetRepo,
          planned.issueId,
          planned.canonical,
          runId,
          { dryRun: !!opts.dryRun },
        );
        successCount += 1;
        const list = closesByCanonical.get(planned.canonical) ?? [];
        list.push({ issueId: planned.issueId, commentUrl: r.commentUrl });
        closesByCanonical.set(planned.canonical, list);
        logger.info("dedup.apply.closed", {
          issueId: planned.issueId,
          canonical: planned.canonical,
          commentUrl: r.commentUrl,
          closedAt: r.closedAt,
          dryRun: !!opts.dryRun,
        });
      } catch (err) {
        failureCount += 1;
        logger.warn("dedup.apply.close_failed", {
          issueId: planned.issueId,
          canonical: planned.canonical,
          err: (err as Error).message,
        });
      }
    }
    // Canonical-side summary: one comment per canonical listing each
    // successfully-closed duplicate. Failures are excluded so the
    // cross-reference chain matches reality. Dry-run emits a synthetic
    // URL so downstream consumers (transcripts, run-log replays) can
    // see what would have happened.
    for (const [canonical, closes] of closesByCanonical) {
      if (closes.length === 0) continue;
      const lines = [
        `Pre-dispatch dedup (${runId}) closed the following duplicate(s) of this issue:`,
        ...closes.map(
          (c) => `- #${c.issueId} — ${c.commentUrl}`,
        ),
      ];
      const body = lines.join("\n");
      try {
        let commentUrl: string | null;
        if (opts.dryRun) {
          commentUrl = `https://dry-run/issue-comment/${targetRepo}/${canonical}`;
        } else {
          commentUrl = await postIssueComment(targetRepo, canonical, body);
        }
        logger.info("dedup.apply.canonical_summary_posted", {
          canonical,
          duplicateCount: closes.length,
          commentUrl,
          dryRun: !!opts.dryRun,
        });
      } catch (err) {
        logger.warn("dedup.apply.canonical_summary_failed", {
          canonical,
          err: (err as Error).message,
        });
      }
    }
    logger.info("dedup.apply.completed", {
      planned: plannedDuplicateCloses.length,
      succeeded: successCount,
      failed: failureCount,
      canonicalsCommented: closesByCanonical.size,
      dryRun: !!opts.dryRun,
    });
  }

  // Issue #119 Phase 2: when --resume-incomplete is set, build the
  // per-issue ResumeContext map from the salvage refs already enumerated
  // for the gate (`incompleteOrigin`). For each issue with at least one
  // ref, pick the most recent (lex-sorted runId desc — runIds are
  // ISO-timestamped). Enrich with errorSubtype / error / partialBranchUrl
  // from `state/<runId>.json` when available so the agent's seed can show
  // the failure mode + last meaningful action of the prior attempt.
  let resumeContextByIssue: Map<number, ResumeContext> | undefined;
  if (opts.resumeIncomplete) {
    resumeContextByIssue = await buildResumeContextMap({
      incompleteOrigin,
      logger,
      // Issue #129: pass the registry's agent records so the originating
      // agent's display name can be resolved and included in the seed —
      // resumed runs render a co-signature line on the PR body.
      agents: registry.agents,
    });
    logger.info("run.resume_incomplete_resolved", {
      runId,
      resumeContextCount: resumeContextByIssue.size,
      issueIds: [...resumeContextByIssue.keys()],
    });
    if (resumeContextByIssue.size > 0) {
      const lines = [...resumeContextByIssue.values()].map(
        (r) => `  #${parseIssueIdFromBranch(r.branch)}  ${r.branch}`,
      );
      process.stdout.write(
        `Resuming ${resumeContextByIssue.size} issue(s) from salvage refs (Phase 2):\n${lines.join("\n")}\n`,
      );
    } else {
      process.stdout.write(
        "[--resume-incomplete set but no salvage refs found for any candidate issue — this run routes from main]\n",
      );
    }
  }

  // Issue #128: capture the run's wall-clock start so the terminal sentinel
  // can include `durationMs`. Watchers (`tail -F | awk '/^run\.completed
  // /{print; exit}'`) anchor on that final line as their clean-exit signal.
  const runStartMs = Date.now();
  let runError: unknown = undefined;
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
      budgetUsd,
      resumeContextByIssue,
      // #142 Phase 2: thread the per-run opt-in down to every
      // `runIssueCore` so each coding agent's seed gets the Step N+1
      // section rendered when the operator passed `--auto-phase-followup`.
      autoPhaseFollowup: !!opts.autoPhaseFollowup,
    });
    const abortedBudgetCount = countByStatus(state, "aborted-budget");
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: dispatchIssues.length,
      // Run-final accounting (#85 acceptance): single total summed across
      // triage + dispatcher + coding-agent. Reconciles with the SDK
      // billing dashboard.
      totalCostUsd: costTracker.total(),
      maxCostUsd: budgetUsd ?? null,
      // #86 acceptance: surface aborted-budget as a distinct, machine-readable
      // count so post-run audits can reconcile "operator pulled the plug on
      // cost" against "agent crashed". Zero-valued when no abort happened.
      abortedBudgetCount,
      budgetAborted: abortedBudgetCount > 0,
    });
    if (abortedBudgetCount > 0) {
      process.stdout.write(
        `Run aborted on cost ceiling: $${costTracker.total().toFixed(4)} / $${(budgetUsd ?? 0).toFixed(4)} — ${abortedBudgetCount} issue(s) marked aborted-budget.\n`,
      );
    }
    if (isRunComplete(state)) await clearCurrentRunId();
  } catch (err) {
    runError = err;
  } finally {
    await logger.close();
    // Per-run summary line (existing behavior, now in the finally block so
    // it fires on the throw path too — operators want the log path even
    // when something blew up). Always precedes the terminal sentinel.
    process.stdout.write(`Run ${runId} log: logs/${runId}.jsonl\n`);
    // Issue #136: emit the end-of-run result report inline, then the
    // terminal sentinel. The bounded `=========` block reuses the same
    // `formatStatusText` operators already see from `vp-dev status` so
    // there's no second rendering codepath to maintain. `--no-report`
    // suppresses the block (operators piping into structured-log
    // consumers); the sentinel still trails on its own line so watchers
    // anchored on `^run\.completed ` (#128) keep working unchanged.
    process.stdout.write(
      await renderEndOfRunBlock({
        runId,
        state,
        totalCostUsd: costTracker.total(),
        durationMs: Date.now() - runStartMs,
        report: opts.report,
        json: opts.jsonReport,
      }),
    );
  }
  if (runError) throw runError;
}

/**
 * Issue #119 Phase 2: build the per-issue ResumeContext map from the
 * salvage-ref enumeration the gate already ran (`incompleteOrigin`).
 *
 * Picks the most recent salvage ref per issue (lex-sorted runId desc —
 * runIds are ISO-8601 stamped so lexicographic order matches chronological
 * order). Enriches each entry from `state/<runId>.json` when that file is
 * still on disk so the agent's seed surfaces the failure mode + last
 * meaningful action of the prior attempt; missing state file degrades to
 * a context with only the branch / runId / agentId fields populated.
 *
 * Pure-ish: reads from disk (run-state JSON) but does not mutate.
 *
 * Exported for unit testing.
 */
export async function buildResumeContextMap(opts: {
  incompleteOrigin: Map<number, { issueId: number; agentId: string; branchName: string; runId: string }[]>;
  logger?: Logger;
  /** Override `STATE_DIR` for deterministic tests. */
  stateDir?: string;
  /**
   * Optional registry agent records used to resolve the originating agent's
   * display name from `agentId` (issue #129). When omitted or no match is
   * found, the resulting context's `agentName` is left undefined and the
   * workflow's co-signature falls back to the agent id alone.
   */
  agents?: AgentRecord[];
}): Promise<Map<number, ResumeContext>> {
  const stateDir = opts.stateDir ?? STATE_DIR;
  const nameById = new Map<string, string>();
  for (const a of opts.agents ?? []) {
    if (a.name) nameById.set(a.agentId, a.name);
  }
  const out = new Map<number, ResumeContext>();
  for (const [issueId, refs] of opts.incompleteOrigin.entries()) {
    if (refs.length === 0) continue;
    // Lex-sort runId desc — runIds are `run-<ISO8601>` so newest-first.
    const sorted = [...refs].sort((a, b) => (a.runId > b.runId ? -1 : a.runId < b.runId ? 1 : 0));
    const pick = sorted[0];
    const enriched = await loadResumeEnrichment(pick.runId, issueId, stateDir).catch((err) => {
      opts.logger?.warn("resume.enrich_failed", {
        runId: pick.runId,
        issueId,
        err: (err as Error).message,
      });
      return undefined;
    });
    const agentName = nameById.get(pick.agentId);
    out.set(issueId, {
      branch: pick.branchName,
      runId: pick.runId,
      agentId: pick.agentId,
      ...(agentName ? { agentName } : {}),
      ...(enriched ?? {}),
    });
  }
  return out;
}

interface ResumeEnrichment {
  errorSubtype?: string;
  finalText?: string;
  partialBranchUrl?: string;
}

async function loadResumeEnrichment(
  runId: string,
  issueId: number,
  stateDir: string,
): Promise<ResumeEnrichment | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(stateDir, `${runId}.json`), "utf-8");
  } catch {
    return undefined;
  }
  let state: { issues?: Record<string, { error?: string; errorSubtype?: string; partialBranchUrl?: string }> };
  try {
    state = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const entry = state.issues?.[String(issueId)];
  if (!entry) return undefined;
  return {
    errorSubtype: entry.errorSubtype,
    finalText: entry.error,
    partialBranchUrl: entry.partialBranchUrl,
  };
}

/**
 * Pull the integer issue id out of a `vp-dev/agent-X/issue-N-incomplete-...`
 * branch name for log / preview rendering. Returns `0` for unparseable
 * inputs — the helper is best-effort, used only for human-facing strings.
 *
 * Exported for unit testing.
 */
export function parseIssueIdFromBranch(branch: string): number {
  const m = /\/issue-(\d+)-incomplete-/.exec(branch);
  return m ? parseInt(m[1], 10) : 0;
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
    preferAgentId: opts.preferAgent,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();

  // #86: re-apply the per-run cost ceiling automatically on resume —
  // `state.maxCostUsd` was persisted into the run-state at original-run
  // launch. A fresh `--max-cost-usd` flag (or VP_DEV_MAX_COST_USD) on the
  // resume invocation overrides the persisted value, letting an operator
  // raise / lower the ceiling without restarting from scratch. The
  // `costTracker` is fresh per resume (we have no stable way to recover
  // mid-run accumulated spend from prior partial runs); the practical
  // effect is "the ceiling applies to spend incurred during the resume,
  // not the cumulative spend across both halves."
  const flagBudget = resolveBudgetUsd({ flag: opts.maxCostUsd, env: process.env });
  const budgetUsd = flagBudget ?? state.maxCostUsd;
  const costTracker = new RunCostTracker();

  logger.info("run.resumed", {
    runId,
    parallelism: state.parallelism,
    issueCount: issues.length,
    maxCostUsd: budgetUsd ?? null,
  });
  // Issue #128: same terminal-sentinel discipline as cmdRun — captured here
  // so a resumed run also emits exactly one `run.completed` line on stdout
  // for external watchers to anchor their exit on.
  const runStartMs = Date.now();
  let runError: unknown = undefined;
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
      costTracker,
      budgetUsd,
      // #142 Phase 2: same flag plumbing on resume for symmetry with
      // `--prefer-agent`. Operators who started a run with
      // `--auto-phase-followup` and need to resume after a crash re-pass
      // the flag on the resume invocation; otherwise it stays off.
      autoPhaseFollowup: !!opts.autoPhaseFollowup,
    });
    const abortedBudgetCount = countByStatus(state, "aborted-budget");
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: issues.length,
      totalCostUsd: costTracker.total(),
      maxCostUsd: budgetUsd ?? null,
      abortedBudgetCount,
      budgetAborted: abortedBudgetCount > 0,
    });
    if (abortedBudgetCount > 0) {
      process.stdout.write(
        `Run aborted on cost ceiling: $${costTracker.total().toFixed(4)} / $${(budgetUsd ?? 0).toFixed(4)} — ${abortedBudgetCount} issue(s) marked aborted-budget.\n`,
      );
    }
    if (isRunComplete(state)) await clearCurrentRunId();
  } catch (err) {
    runError = err;
  } finally {
    await logger.close();
    // Issue #136: same end-of-run report on resume — operators rerun
    // `vp-dev run --resume` after a crash and want the same per-issue
    // rollup the originating run would have produced. The terminal
    // sentinel (#128) still trails the report so external watchers
    // anchored on `^run\.completed ` keep working uniformly.
    process.stdout.write(
      await renderEndOfRunBlock({
        runId,
        state,
        totalCostUsd: costTracker.total(),
        durationMs: Date.now() - runStartMs,
        report: opts.report,
        json: opts.jsonReport,
      }),
    );
  }
  if (runError) throw runError;
}

/**
 * Issue #136: shared helper that turns the run-final state into the stdout
 * block emitted by both `cmdRun` and `runResume`. Two switches:
 *
 *   - `report: false` (passed by `--no-report`) → emit only the terminal
 *     sentinel from #128. Existing pre-#136 behavior — operators piping
 *     into structured-log consumers.
 *   - `json: true` (passed by `--json-report`) → emit the JSON variant of
 *     the report (same shape as `vp-dev status <runId> --json`) ahead of
 *     the sentinel.
 *   - default (neither) → emit the bounded `=========` text block ahead
 *     of the sentinel.
 *
 * Loads the registry once for the agentNames lookup (best-effort — if the
 * read fails we render with bare agent IDs, since corrupting an
 * end-of-run report is strictly worse than losing display names).
 */
async function renderEndOfRunBlock(input: {
  runId: string;
  state: RunState;
  totalCostUsd: number;
  durationMs: number;
  report?: boolean;
  json?: boolean;
}): Promise<string> {
  // Default report=true unless explicitly `false` (Commander `--no-report`).
  const wantReport = input.report !== false;
  if (!wantReport) {
    return formatRunCompletedSentinel({
      runId: input.runId,
      state: input.state,
      totalCostUsd: input.totalCostUsd,
      durationMs: input.durationMs,
    });
  }
  let agentNames: Map<string, string | undefined> | undefined;
  try {
    const reg = await loadRegistry();
    agentNames = new Map<string, string | undefined>(
      reg.agents.map((a) => [a.agentId, a.name]),
    );
  } catch {
    agentNames = undefined;
  }
  return formatRunReport({
    runId: input.runId,
    state: input.state,
    totalCostUsd: input.totalCostUsd,
    durationMs: input.durationMs,
    agentNames,
    json: input.json,
  });
}

interface StatusOpts {
  latest?: boolean;
  json?: boolean;
  watch?: boolean;
  interval?: number;
  maxIterations?: number;
}

async function cmdStatus(runIdArg?: string, opts: StatusOpts = {}): Promise<void> {
  // Three resolution modes for which run to inspect:
  //   1. Explicit `runId` arg → that run.
  //   2. --latest → most recent run-*.json on disk regardless of completion.
  //   3. (default) the active run referenced by `state/current-run.txt`.
  let runId: string | undefined = runIdArg ?? undefined;
  if (!runId) {
    runId = opts.latest
      ? (await findLatestRunId()) ?? undefined
      : (await readCurrentRunId()) ?? undefined;
  }
  if (!runId) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ runId: null, reason: opts.latest ? "no runs on disk" : "no active run" }, null, 2) + "\n");
    } else {
      process.stdout.write(opts.latest ? "No runs on disk.\n" : "No active run.\n");
    }
    return;
  }

  // Resolve names from registry once (best-effort — keep status read-only).
  // For --watch we reuse this map across ticks; agent registry edits during
  // a run are vanishingly rare and the cost of re-reading every tick isn't
  // worth the freshness gain.
  const reg = await loadRegistry();
  const agentNames = new Map<string, string | undefined>(
    reg.agents.map((a) => [a.agentId, a.name]),
  );

  if (opts.watch) {
    await runStatusWatch(runId, opts, agentNames);
    return;
  }

  let state;
  try {
    state = await loadRunState(runId);
  } catch (err) {
    process.stderr.write(`ERROR: could not load run-state for ${runId}: ${(err as Error).message}\n`);
    process.exit(2);
  }

  // Issue #131: best-effort load of the JSONL log so the status output
  // can surface tool counts, time-since-last-activity, and a recent
  // events tail. Fresh runs may not have any events on disk yet —
  // `loadRunActivity` returns an empty activity for ENOENT; other I/O
  // errors are surfaced as a warning so the formatter still gets to
  // render the per-issue status block (the original pre-#131 view).
  const activity = await tryLoadRunActivity(runId);
  if (opts.json) {
    process.stdout.write(JSON.stringify(formatStatusJson(state, { agentNames, activity }), null, 2) + "\n");
    return;
  }
  process.stdout.write(formatStatusText(state, { agentNames, activity }));
}

async function tryLoadRunActivity(runId: string) {
  try {
    return await loadRunActivity({ logPath: defaultRunLogPath(runId) });
  } catch (err) {
    process.stderr.write(`WARN: could not read run log for ${runId}: ${(err as Error).message}\n`);
    return undefined;
  }
}

async function runStatusWatch(
  runId: string,
  opts: StatusOpts,
  agentNames: Map<string, string | undefined>,
): Promise<void> {
  const intervalSec = opts.interval ?? 10;
  const intervalMs = intervalSec * 1000;
  const isTty = Boolean(process.stdout.isTTY);
  const mode = resolveRenderMode({ json: Boolean(opts.json), isTty });

  const ac = new AbortController();
  const onSigint = () => ac.abort();
  process.on("SIGINT", onSigint);

  try {
    const result = await watchStatus({
      tickFn: async () => {
        const state = await loadRunState(runId);
        // Re-load the JSONL log every tick so cost-burn, tool counts,
        // and the recent-events tail track in-flight progress. Cheap
        // on small log files; if this becomes a bottleneck on long
        // runs, switch to a tail-position cache here.
        const activity = await tryLoadRunActivity(runId);
        const output = opts.json
          ? JSON.stringify(formatStatusJson(state, { agentNames, activity }))
          : formatStatusText(state, { agentNames, activity });
        return { done: isRunComplete(state), output };
      },
      intervalMs,
      mode,
      maxIterations: opts.maxIterations,
      signal: ac.signal,
    });
    // Surface a one-line trailer to stderr in text modes so the operator
    // can tell why the loop stopped (run-complete vs ctrl-c vs cap). JSON
    // mode stays pure NDJSON for downstream parsers.
    if (mode !== "json") {
      process.stderr.write(`\n[watch] exited (${result.reason}) after ${result.iterations} tick(s)\n`);
    }
  } catch (err) {
    process.stderr.write(`ERROR: watch failed for ${runId}: ${(err as Error).message}\n`);
    process.exit(2);
  } finally {
    process.off("SIGINT", onSigint);
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
  const verdict = detectOverload(agent, md);
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

interface AgentsCompactClaudeMdOpts {
  json?: boolean;
  minClusterSize: number;
  apply?: boolean;
  confirm?: string;
  allowPairClusters?: boolean;
}

async function cmdAgentsCompactClaudeMd(
  agentId: string,
  opts: AgentsCompactClaudeMdOpts,
): Promise<void> {
  if (opts.apply && opts.confirm) {
    process.stderr.write(
      "ERROR: --apply and --confirm are mutually exclusive. Use --apply first, then --confirm <token>.\n",
    );
    process.exit(2);
  }

  if (opts.confirm) {
    await cmdAgentsCompactClaudeMdConfirm(agentId, opts);
    return;
  }

  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (agent.archived) {
    process.stderr.write(
      `ERROR: agent '${agentId}' is already archived; compaction is for active agents.\n`,
    );
    process.exit(2);
  }
  const { md, bytes } = await readAgentClaudeMdBytes(agentId);
  if (bytes === 0) {
    process.stderr.write(
      `ERROR: agent '${agentId}' has no CLAUDE.md on disk yet — nothing to compact.\n`,
    );
    process.exit(2);
  }

  const minClusterSize = resolveMinClusterSize({
    minClusterSize: opts.minClusterSize,
    allowPairClusters: opts.allowPairClusters,
  });
  const floorNote = opts.allowPairClusters && minClusterSize !== opts.minClusterSize
    ? " (lowered by --allow-pair-clusters)"
    : "";
  process.stdout.write(
    `Generating compaction proposal for ${agentId} (min-cluster-size=${minClusterSize}${floorNote})...\n`,
  );
  const proposal = await proposeCompaction({
    agent,
    claudeMd: md,
    minClusterSize,
  });

  if (!opts.apply) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ agentId, proposal }, null, 2) + "\n");
      return;
    }
    process.stdout.write(formatCompactionProposal(proposal) + "\n");
    return;
  }

  // --apply path: refuse to mint a token if the proposal isn't safe to apply.
  // Per #162, validator warnings are a hard rejection (Phase A surfaces them
  // as advisory; Phase B treats them as the gate). Empty proposals are also
  // rejected — there's nothing to confirm.
  if (proposal.clusters.length === 0) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ agentId, proposal, applyRefused: "no-clusters" }, null, 2) + "\n",
      );
      return;
    }
    process.stdout.write(formatCompactionProposal(proposal) + "\n");
    process.stdout.write(
      "\nERROR: --apply refused; proposal has zero merge clusters. Nothing to confirm.\n",
    );
    process.exit(2);
  }
  if (proposal.warnings.length > 0) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          { agentId, proposal, applyRefused: "warnings-present" },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    process.stdout.write(formatCompactionProposal(proposal) + "\n");
    process.stdout.write(
      `\nERROR: --apply refused; ${proposal.warnings.length} validator finding(s) (dropped-incident-date or clamped-body — see proposal output). Re-run after the model emits a clean proposal.\n`,
    );
    process.exit(2);
  }

  const token = mintCompactToken();
  const proposalHash = computeProposalHash(proposal, md);
  await writeCompactConfirmToken({ token, agentId, proposal, proposalHash });

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          agentId,
          proposal,
          confirmToken: token,
          proposalHash,
          confirmCommand: `vp-dev agents compact-claude-md ${agentId} --confirm ${token}`,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  process.stdout.write(formatCompactionProposal(proposal) + "\n");
  process.stdout.write(
    `\nConfirm token: ${token} (15-min TTL, written to state/compact-confirm-${token}.json)\n` +
      `Apply with:    vp-dev agents compact-claude-md ${agentId} --confirm ${token}\n` +
      `If the file changes between now and confirm, the token rejects and you'll need to re-run --apply.\n`,
  );
}

async function cmdAgentsCompactClaudeMdConfirm(
  agentId: string,
  opts: AgentsCompactClaudeMdOpts,
): Promise<void> {
  const token = opts.confirm;
  if (!token) {
    process.stderr.write("ERROR: --confirm requires a token argument.\n");
    process.exit(2);
  }
  const read = await readCompactConfirmToken(token);
  if (!read.ok) {
    process.stderr.write(`ERROR: ${read.message}\n`);
    process.exit(2);
  }
  if (read.record.agentId !== agentId) {
    process.stderr.write(
      `ERROR: token ${token} was minted for agent '${read.record.agentId}', not '${agentId}'.\n`,
    );
    process.exit(2);
  }

  const result = await applyCompaction({
    agentId,
    proposal: read.record.proposal,
    expectedProposalHash: read.record.proposalHash,
    computeProposalHash,
  });

  if (result.kind === "drift-rejected") {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ agentId, token, result }, null, 2) + "\n",
      );
    } else {
      process.stderr.write(
        `ERROR: --confirm rejected (${result.reason}): ${result.details}\n`,
      );
    }
    // Don't delete the token on drift — operator may want to re-inspect.
    process.exit(2);
  }

  await deleteCompactConfirmToken(token);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ agentId, token, result }, null, 2) + "\n",
    );
    return;
  }
  process.stdout.write(
    `Compacted ${agentId}/CLAUDE.md\n` +
      `  ${(result.bytesBefore / 1024).toFixed(1)}KB -> ${(result.bytesAfter / 1024).toFixed(1)}KB ` +
      `(${result.clustersApplied} cluster(s), ${result.sectionsMerged} sections merged)\n` +
      `  merge runId: ${result.runId}\n`,
  );
}

interface AgentsPruneLessonsOpts {
  json?: boolean;
  minSiblingsAfter: number;
  apply?: boolean;
  confirm?: string;
}

async function cmdAgentsPruneLessons(
  agentId: string,
  opts: AgentsPruneLessonsOpts,
): Promise<void> {
  const {
    proposeLessonPrune,
    formatLessonPruneProposal,
    computePruneProposalHash,
    applyLessonPrune,
  } = await import("./agent/lessonPrune.js");
  const {
    mintToken,
    writeLessonPruneConfirmToken,
    readLessonPruneConfirmToken,
    deleteLessonPruneConfirmToken,
  } = await import("./state/lessonPruneConfirm.js");
  const { agentClaudeMdPath } = await import("./agent/specialization.js");

  if (opts.confirm) {
    const tokenResult = await readLessonPruneConfirmToken(opts.confirm);
    if (!tokenResult.ok) {
      process.stderr.write(`ERROR: ${tokenResult.message}\n`);
      process.exit(2);
    }
    const { record } = tokenResult;
    if (record.agentId !== agentId) {
      process.stderr.write(
        `ERROR: token ${opts.confirm} is bound to ${record.agentId}, not ${agentId}.\n`,
      );
      process.exit(2);
    }
    const result = await applyLessonPrune({
      agentId,
      proposal: record.proposal,
      expectedProposalHash: record.proposalHash,
    });
    if (result.kind === "drift-rejected") {
      process.stderr.write(`ERROR: ${result.details}\n`);
      process.exit(2);
    }
    await deleteLessonPruneConfirmToken(opts.confirm);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ agentId, token: opts.confirm, result }, null, 2) + "\n",
      );
      return;
    }
    process.stdout.write(
      `Pruned ${agentId}/CLAUDE.md\n` +
        `  ${(result.bytesBefore / 1024).toFixed(1)}KB -> ${(result.bytesAfter / 1024).toFixed(1)}KB ` +
        `(${result.sectionsDropped} section(s) dropped)\n`,
    );
    return;
  }

  const proposal = await proposeLessonPrune({
    agentId,
    minSiblingsAfter: opts.minSiblingsAfter,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
    return;
  }

  process.stdout.write(formatLessonPruneProposal(proposal) + "\n");

  if (!opts.apply) return;

  if (proposal.pruned.length === 0) {
    process.stdout.write(
      "Nothing to prune; no token minted.\n",
    );
    return;
  }

  // Compute hash from the live file (the proposal hash binds plan-time bytes
  // to the listed stable IDs; any drift between plan and confirm rejects).
  let currentFile = "";
  try {
    currentFile = await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
  } catch {
    process.stderr.write(
      `ERROR: agents/${agentId}/CLAUDE.md is missing; cannot mint a token.\n`,
    );
    process.exit(2);
  }
  const proposalHash = computePruneProposalHash(proposal, currentFile);
  const token = mintToken();
  await writeLessonPruneConfirmToken({
    token,
    agentId,
    proposal,
    proposalHash,
  });
  process.stdout.write(
    `\nConfirm token: ${token} (15-min TTL, written to state/lesson-prune-confirm-${token}.json)\n` +
      `Apply with:    vp-dev agents prune-lessons ${agentId} --confirm ${token}\n`,
  );
}

interface AgentsPruneTagsOpts {
  json?: boolean;
  generalize?: boolean; // Commander stores --no-generalize as generalize:false
  apply?: boolean;
  confirm?: string;
}

async function cmdAgentsPruneTags(
  agentId: string,
  opts: AgentsPruneTagsOpts,
): Promise<void> {
  const {
    proposePruneTags,
    formatPruneTagsProposal,
    computePruneTagsProposalHash,
    applyPruneTags,
  } = await import("./agent/pruneTags.js");
  const {
    mintToken,
    writePruneTagsConfirmToken,
    readPruneTagsConfirmToken,
    deletePruneTagsConfirmToken,
  } = await import("./state/pruneTagsConfirm.js");
  const { agentClaudeMdPath } = await import("./agent/specialization.js");

  if (opts.confirm) {
    const tokenResult = await readPruneTagsConfirmToken(opts.confirm);
    if (!tokenResult.ok) {
      process.stderr.write(`ERROR: ${tokenResult.message}\n`);
      process.exit(2);
    }
    const { record } = tokenResult;
    if (record.agentId !== agentId) {
      process.stderr.write(
        `ERROR: token ${opts.confirm} is bound to ${record.agentId}, not ${agentId}.\n`,
      );
      process.exit(2);
    }
    const result = await applyPruneTags({
      agentId,
      proposal: record.proposal,
      expectedProposalHash: record.proposalHash,
    });
    if (result.kind === "drift-rejected") {
      process.stderr.write(`ERROR: ${result.details}\n`);
      process.exit(2);
    }
    await deletePruneTagsConfirmToken(opts.confirm);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ agentId, token: opts.confirm, result }, null, 2) + "\n",
      );
      return;
    }
    process.stdout.write(
      `Pruned ${agentId} tags\n` +
        `  ${result.tagsBefore.length} -> ${result.tagsAfter.length} ` +
        `(${result.droppedCount} dropped, ${result.generalizedCount} generalization cluster(s))\n` +
        `  final: ${result.tagsAfter.join(", ")}\n`,
    );
    return;
  }

  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (agent.archived) {
    process.stderr.write(
      `ERROR: agent '${agentId}' is archived; pruning is for active agents.\n`,
    );
    process.exit(2);
  }

  // Read CLAUDE.md (missing file is fine — proposal handles empty-result path).
  let claudeMd = "";
  try {
    claudeMd = await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
  } catch {
    // empty string flows through proposePruneTags' zero-section branch
  }

  const { readSectionTags } = await import("./state/sectionTags.js");
  const sidecar = await readSectionTags(agentId);

  // Commander wires --no-generalize to `generalize: false` (default true).
  const noGeneralize = opts.generalize === false;

  const proposal = await proposePruneTags({
    agent,
    claudeMd,
    sectionTagsByStableId: sidecar.sections,
    noGeneralize,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
    return;
  }

  process.stdout.write(formatPruneTagsProposal(proposal) + "\n");

  if (!opts.apply) return;

  // No-op proposals don't mint a token. The "no attributable sections" path
  // returns finalTags === registryTagsBefore; otherwise compare for any change.
  const before = [...proposal.registryTagsBefore].sort().join(",");
  const after = [...proposal.finalTags].sort().join(",");
  if (before === after) {
    process.stdout.write("\nNothing to prune; no token minted.\n");
    return;
  }

  const proposalHash = computePruneTagsProposalHash(proposal, agent.tags, claudeMd);
  const token = mintToken();
  await writePruneTagsConfirmToken({
    token,
    agentId,
    proposal,
    proposalHash,
  });
  process.stdout.write(
    `\nConfirm token: ${token} (15-min TTL, written to state/prune-tags-confirm-${token}.json)\n` +
      `Apply with:    vp-dev agents prune-tags ${agentId} --confirm ${token}\n`,
  );
}

interface AgentsMigrateTagsToSidecarOpts {
  all?: boolean;
  json?: boolean;
}

async function cmdAgentsMigrateTagsToSidecar(
  agentId: string | undefined,
  opts: AgentsMigrateTagsToSidecarOpts,
): Promise<void> {
  const { migrateAgentTagsToSidecar, migrateAllAgentsTagsToSidecar } = await import(
    "./agent/migrateTagsToSidecar.js"
  );

  if (!opts.all && !agentId) {
    process.stderr.write(
      "ERROR: pass <agentId> or --all to migrate-tags-to-sidecar.\n",
    );
    process.exit(2);
  }
  if (opts.all && agentId) {
    process.stderr.write(
      "ERROR: --all and <agentId> are mutually exclusive.\n",
    );
    process.exit(2);
  }

  const results = opts.all
    ? await migrateAllAgentsTagsToSidecar()
    : [await migrateAgentTagsToSidecar(agentId as string)];

  if (opts.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    return;
  }

  if (results.length === 0) {
    process.stdout.write("No agents found under agents/.\n");
    return;
  }

  let totalRewritten = 0;
  let totalSentinels = 0;
  for (const r of results) {
    if (r.claudeMdRewritten) totalRewritten++;
    totalSentinels += r.legacySentinelsFound;
    const status = r.claudeMdRewritten
      ? `migrated ${r.legacySentinelsFound} sentinel(s) -> ${r.stableIdsWritten} sidecar entries (${r.bytesBefore} -> ${r.bytesAfter} bytes)`
      : "no legacy `tags:` found (already clean or no CLAUDE.md)";
    process.stdout.write(`${r.agentId}: ${status}\n`);
  }
  if (results.length > 1) {
    process.stdout.write(
      `\n${totalRewritten}/${results.length} agents migrated; ${totalSentinels} legacy sentinels stripped.\n`,
    );
  }
}

interface AgentsAuditLessonsOpts {
  json?: boolean;
  maxCostUsd: number;
  concurrency: number;
}

async function cmdAgentsAuditLessons(
  agentId: string,
  opts: AgentsAuditLessonsOpts,
): Promise<void> {
  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  const { proposeAudit, formatAuditProposal } = await import("./agent/auditLessons.js");
  const proposal = await proposeAudit({
    agentId,
    maxCostUsd: opts.maxCostUsd,
    concurrency: opts.concurrency,
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
    return;
  }
  process.stdout.write(formatAuditProposal(proposal) + "\n");
}

interface AgentsAssessClaudeMdOpts {
  json?: boolean;
  keepThreshold: number;
  dropThreshold: number;
  recencyDecayDays: number;
}

async function cmdAgentsAssessClaudeMd(
  agentId: string,
  opts: AgentsAssessClaudeMdOpts,
): Promise<void> {
  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (opts.dropThreshold > opts.keepThreshold) {
    process.stderr.write(
      `ERROR: --drop-threshold (${opts.dropThreshold}) must be ≤ --keep-threshold (${opts.keepThreshold}).\n`,
    );
    process.exit(2);
  }
  const { proposeAssessment, formatAssessProposal } = await import(
    "./agent/assessClaudeMd.js"
  );
  const proposal = await proposeAssessment({
    agentId,
    keepThreshold: opts.keepThreshold,
    dropThreshold: opts.dropThreshold,
    recencyDecayDays: opts.recencyDecayDays,
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
    return;
  }
  process.stdout.write(formatAssessProposal(proposal) + "\n");
}

interface AgentsTightenClaudeMdOpts {
  json?: boolean;
  maxSavingsPct: number;
  // Commander stores `--no-diff` as `diff: false` (boolean, defaults to
  // true). Naming the option `noDiff` would invert the convention; using
  // `diff` matches Commander's default and keeps the call-site readable.
  diff?: boolean;
}

async function cmdAgentsTightenClaudeMd(
  agentId: string,
  opts: AgentsTightenClaudeMdOpts,
): Promise<void> {
  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (agent.archived) {
    process.stderr.write(
      `ERROR: agent '${agentId}' is already archived; tightening is for active agents.\n`,
    );
    process.exit(2);
  }
  const { md, bytes } = await readAgentClaudeMdBytes(agentId);
  if (bytes === 0) {
    process.stderr.write(
      `ERROR: agent '${agentId}' has no CLAUDE.md on disk yet — nothing to tighten.\n`,
    );
    process.exit(2);
  }

  process.stdout.write(
    `Generating tighten proposal for ${agentId} (max-savings-pct=${opts.maxSavingsPct})...\n`,
  );
  const proposal = await proposeTighten({
    agent,
    claudeMd: md,
    maxSavingsPct: opts.maxSavingsPct,
  });

  if (opts.json) {
    // JSON mode keeps its lean payload — `rewrittenBody` is already in
    // each rewrite, so a JSON consumer that wants a diff can derive one
    // by re-parsing the agent's CLAUDE.md (#176 out of scope: per-rewrite
    // diff field for --json mode).
    process.stdout.write(JSON.stringify({ agentId, proposal }, null, 2) + "\n");
    return;
  }
  // Build the source-body lookup from the same MD we just proposed
  // against. Commander parses `--no-diff` into `opts.diff === false`;
  // when the flag is absent, `opts.diff` is `undefined` (effectively
  // true → show diffs by default, per #176).
  const sections = parseClaudeMdSections(md);
  const sources = new Map(sections.map((s) => [s.sectionId, s.body]));
  process.stdout.write(
    formatTightenProposal(proposal, {
      showDiffs: opts.diff !== false,
      sources,
    }) + "\n",
  );
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
  allowClosedIssue?: boolean;
  issueBodyOnly?: boolean;
  /** commander's --no-target-claude-md sets `targetClaudeMd: false`. */
  targetClaudeMd?: boolean;
  /** Curve-redo: model override threaded into runIssueCore → runCodingAgent. */
  model?: string;
  /** Curve-redo: optional base SHA for closed-issue replay. */
  replayBaseSha?: string;
  /** Curve-redo: optional path to write the post-run worktree diff. */
  captureDiffPath?: string;
}

async function cmdSpawn(opts: SpawnOpts): Promise<void> {
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);
  const issue = await getIssue(opts.targetRepo, opts.issue);
  if (!issue) {
    process.stderr.write(`ERROR: issue #${opts.issue} not found in ${opts.targetRepo}.\n`);
    process.exit(2);
  }
  if (issue.state === "closed" && !opts.allowClosedIssue) {
    process.stderr.write(`ERROR: issue #${opts.issue} is closed. Pass --allow-closed-issue to dispatch against it (used by the curve-study calibration flow with --issue-body-only).\n`);
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

    const replayMode =
      opts.replayBaseSha || opts.captureDiffPath
        ? {
            baseSha: opts.replayBaseSha,
            // Capture path is required when replay mode is used at all —
            // there's no point doing a rollback if we don't keep the diff.
            // Mirror the flag absence as a friendly error rather than a
            // type-system one.
            captureDiffPath: opts.captureDiffPath ?? "",
          }
        : undefined;
    if (replayMode && !replayMode.captureDiffPath) {
      process.stderr.write(
        "ERROR: --replay-base-sha was passed without --capture-diff-path. Replay-mode runs need a destination for the post-run diff or the rollback is wasted.\n",
      );
      process.exit(2);
    }

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
      issueBodyOnly: !!opts.issueBodyOnly,
      suppressTargetClaudeMd: opts.targetClaudeMd === false,
      model: opts.model,
      replayMode,
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

interface AgentsPullSnapshotOpts {
  repo: string;
  cloneDir?: string;
  policy: string;
  dryRun?: boolean;
  json?: boolean;
}

function summaryStats(summary: SyncSummary): {
  added: number;
  updated: number;
  skipped: number;
  unchanged: number;
  excluded: number;
} {
  return {
    added: summary.added.length,
    updated: summary.updated.length,
    skipped: summary.skipped.length,
    unchanged: summary.unchanged.length,
    excluded: summary.excluded.length,
  };
}

async function cmdAgentsPullSnapshot(opts: AgentsPullSnapshotOpts): Promise<void> {
  if (opts.policy !== "skip-existing" && opts.policy !== "overwrite") {
    process.stderr.write(
      `ERROR: --policy must be 'skip-existing' or 'overwrite', got '${opts.policy}'.\n`,
    );
    process.exit(2);
  }
  let summary: SyncSummary;
  try {
    summary = await pullSnapshot({
      repo: opts.repo,
      cloneDir: opts.cloneDir,
      policy: opts.policy as ConflictPolicy,
      dryRun: opts.dryRun,
    });
  } catch (err) {
    process.stderr.write(`ERROR: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          repo: opts.repo,
          policy: opts.policy,
          dryRun: !!opts.dryRun,
          counts: summaryStats(summary),
          ...summary,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const counts = summaryStats(summary);
  const verb = opts.dryRun ? "Would pull" : "Pulled";
  process.stdout.write(
    `${verb} from ${opts.repo} (policy=${opts.policy}): ` +
      `${counts.added} added, ${counts.updated} updated, ${counts.skipped} skipped (existing), ${counts.unchanged} unchanged.\n`,
  );
  if (summary.added.length) process.stdout.write(`  added:   ${summary.added.join(", ")}\n`);
  if (summary.updated.length) process.stdout.write(`  updated: ${summary.updated.join(", ")}\n`);
  if (summary.skipped.length) process.stdout.write(`  skipped: ${summary.skipped.join(", ")}\n`);
}

interface AgentsPushSnapshotOpts {
  repo: string;
  cloneDir?: string;
  includeSynthetic?: boolean;
  apply?: boolean;
  branch?: string;
  message?: string;
  json?: boolean;
}

async function cmdAgentsPushSnapshot(opts: AgentsPushSnapshotOpts): Promise<void> {
  let result: Awaited<ReturnType<typeof pushSnapshot>>;
  try {
    result = await pushSnapshot({
      repo: opts.repo,
      cloneDir: opts.cloneDir,
      includeSynthetic: opts.includeSynthetic,
      apply: opts.apply,
      branch: opts.branch,
      message: opts.message,
    });
  } catch (err) {
    process.stderr.write(`ERROR: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          repo: opts.repo,
          apply: !!opts.apply,
          branch: result.branch,
          prUrl: result.prUrl,
          counts: summaryStats(result.summary),
          ...result.summary,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const counts = summaryStats(result.summary);
  const verb = opts.apply ? "Pushed" : "Would push";
  process.stdout.write(
    `${verb} to ${opts.repo} (branch=${result.branch}): ` +
      `${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.excluded} excluded as synthetic.\n`,
  );
  if (result.summary.added.length) process.stdout.write(`  added:    ${result.summary.added.join(", ")}\n`);
  if (result.summary.updated.length) process.stdout.write(`  updated:  ${result.summary.updated.join(", ")}\n`);
  if (result.summary.excluded.length) process.stdout.write(`  excluded: ${result.summary.excluded.join(", ")}\n`);
  if (!opts.apply) {
    process.stdout.write("\nDry run. Re-invoke with --apply to commit + push + open the PR.\n");
  } else if (result.prUrl) {
    process.stdout.write(`\nPR opened: ${result.prUrl}\n`);
  }
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
  pr?: boolean;
}

async function cmdLessonsReview(opts: LessonsReviewOpts): Promise<void> {
  const tier: LessonTier = opts.global ? "global" : "target";
  const reg = await loadRegistry();
  // Don't filter archived agents — the candidate may have been tagged before
  // a split, and we still want to surface it. The boundary that matters is
  // the human-review gate, not the agent's lifecycle status.
  const pending = await collectPendingCandidates(reg.agents);

  // Phase A instrumentation for #201: log one body-Jaccard observation per
  // pending candidate so Phase B threshold tuning has data to fit against.
  // Fail-soft per CLAUDE.md "Fail-soft wiring for state-collection hooks":
  // a logging error must not abort review — wrap each emit individually.
  const logTs = new Date().toISOString();
  for (const p of pending) {
    try {
      const claudeMd = await loadComparandClaudeMd(tier, p.candidate.domain);
      const score = computeBodyJaccardScore({
        candidateBody: p.candidate.body,
        claudeMd,
      });
      await appendBodyJaccardLogLine({
        ts: logTs,
        event: "lesson.body_jaccard",
        candidateAgentId: p.agentId,
        candidateDomain: p.candidate.domain,
        tier,
        ...score,
      });
    } catch (err) {
      process.stderr.write(
        `warn: body-Jaccard log emit failed for ${p.agentId} -> ${p.candidate.domain}: ${(err as Error).message}\n`,
      );
    }
  }

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
    await runAutoAcceptLoop(pending, tier, !!opts.pr);
    return;
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to auto-accept everything that validates, or pipe to a TTY.\n",
    );
    process.exit(2);
  }

  await runInteractiveReview(pending, tier, !!opts.pr);
}

/**
 * Read the project-local CLAUDE.md size (cwd-relative) and run the L2 gate
 * for an `@local-claude` candidate. Returns `null` for non-local domains so
 * the caller skips this branch cleanly.
 */
async function computeLocalClaudeGate(
  p: PendingCandidate,
): Promise<LocalClaudeUtilityGateResult | null> {
  if (!isLocalClaudeCandidate(p.candidate.domain)) return null;
  let currentBytes = 0;
  try {
    const content = await fs.readFile("CLAUDE.md", "utf-8");
    currentBytes = Buffer.byteLength(content, "utf-8");
  } catch {
    // No project CLAUDE.md → treat as zero-cost; gate will let through.
  }
  const candidateBytes = Buffer.byteLength(p.candidate.body, "utf-8");
  return evaluateLocalClaudeUtilityGate({
    utility: p.candidate.utility,
    currentLocalClaudeMdBytes: currentBytes,
    candidateBytes,
  });
}

/**
 * Try to open a PR for an accepted @local-claude candidate. On any failure,
 * caller falls back to the queue path so the lesson isn't lost. Returns the
 * outcome (with PR URL on success) or null when the path doesn't apply.
 */
async function tryOpenLocalClaudePr(
  p: PendingCandidate,
  ts: string,
  gate: LocalClaudeUtilityGateResult | null,
): Promise<OpenLocalClaudePrOutcome | null> {
  if (!isLocalClaudeCandidate(p.candidate.domain)) return null;
  return openLocalClaudePr({
    sourceAgentId: p.agentId,
    ts,
    utility: p.candidate.utility,
    gate: gate ?? undefined,
    body: p.candidate.body,
  });
}

async function runAutoAcceptLoop(
  pending: PendingCandidate[],
  tier: LessonTier,
  usePr: boolean,
): Promise<void> {
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
    const localGate = await computeLocalClaudeGate(p);
    if (localGate && localGate.decision === "skip") {
      // Auto-accept: respect the L2 gate and skip — the operator can re-run
      // interactively to override.
      process.stdout.write(
        `skipped (local-gate: utility=${p.candidate.utility ?? "n/a"} < threshold=${localGate.threshold.toFixed(3)}) ${p.agentId} -> ${p.candidate.domain}\n`,
      );
      skippedCount += 1;
      continue;
    }
    // Autonomous PR path (#196 Phase 2): when --pr is set AND the local
    // gate is let-through, open a chore PR directly. Failure falls back to
    // the queue path so the lesson isn't lost.
    if (usePr && localGate && localGate.decision === "let-through") {
      const ts = new Date().toISOString();
      const prOutcome = await tryOpenLocalClaudePr(p, ts, localGate);
      if (prOutcome && prOutcome.kind === "pr-opened") {
        // Rewrite the source marker so the candidate doesn't resurface.
        await rejectCandidate({
          pending: p,
          reason: `promoted-local via PR ${prOutcome.prUrl}`,
          ts,
        }).catch(() => {});
        process.stdout.write(
          `accepted [@local-claude] ${p.agentId} -> PR ${prOutcome.prUrl} (branch ${prOutcome.branchName})\n`,
        );
        acceptedCount += 1;
        continue;
      }
      if (prOutcome && prOutcome.kind === "pr-failed") {
        process.stdout.write(
          `PR-creation failed (${prOutcome.reason}); falling back to queue.\n`,
        );
      }
      // fall through to queue
    }
    const result = await acceptCandidate({
      pending: p,
      tier,
      localGate: localGate ?? undefined,
    });
    if (result.localQueueOutcome) {
      process.stdout.write(
        `accepted [@local-claude] ${p.agentId} -> queued at ${result.localQueueOutcome.filePath} (${result.localQueueOutcome.totalBytes} bytes total)\n`,
      );
      acceptedCount += 1;
      continue;
    }
    const ao = result.appendOutcome;
    if (ao && ao.kind === "appended") {
      process.stdout.write(
        `accepted [${tier}] ${p.agentId} -> ${p.candidate.domain} (${ao.totalLines}/${MAX_POOL_LINES} lines)\n`,
      );
      acceptedCount += 1;
    } else if (ao && ao.kind === "rejected-pool-full") {
      process.stdout.write(
        `skipped (pool full) [${tier}] ${p.agentId} -> ${p.candidate.domain}: ${ao.totalLines}/${MAX_POOL_LINES} lines. Trim the pool by hand and re-run review.\n`,
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

async function runInteractiveReview(
  pending: PendingCandidate[],
  tier: LessonTier,
  usePr: boolean,
): Promise<void> {
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
      const localGate = await computeLocalClaudeGate(p);
      if (localGate) {
        const utility = p.candidate.utility ?? undefined;
        process.stdout.write(
          `local-gate: utility=${utility ?? "n/a"} costScore=${localGate.costScore.toFixed(3)} threshold=${localGate.threshold.toFixed(3)} ratio=${localGate.ratio} decision=${localGate.decision}\n`,
        );
        if (localGate.decision === "skip") {
          process.stdout.write(
            `WARNING: utility below threshold — accept anyway only if the lesson is genuinely project-wide.\n`,
          );
        }
      }
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
        // Interactive --pr: try to open a PR for an accepted @local-claude
        // candidate (operator's accept overrides the L2 gate). On PR
        // failure, fall back to the queue path.
        if (usePr && isLocalClaudeCandidate(p.candidate.domain)) {
          const ts = new Date().toISOString();
          const prOutcome = await tryOpenLocalClaudePr(p, ts, localGate);
          if (prOutcome && prOutcome.kind === "pr-opened") {
            await rejectCandidate({
              pending: p,
              reason: `promoted-local via PR ${prOutcome.prUrl}`,
              ts,
            }).catch(() => {});
            process.stdout.write(
              `Accepted [@local-claude]: opened PR ${prOutcome.prUrl} (branch ${prOutcome.branchName}).\n`,
            );
            acceptedCount += 1;
            continue;
          }
          if (prOutcome && prOutcome.kind === "pr-failed") {
            process.stdout.write(
              `PR-creation failed (${prOutcome.reason}); falling back to queue.\n`,
            );
          }
          // fall through to queue
        }
        const result = await acceptCandidate({
          pending: p,
          tier,
          localGate: localGate ?? undefined,
        });
        if (result.localQueueOutcome) {
          process.stdout.write(
            `Accepted [@local-claude]: queued to ${result.localQueueOutcome.filePath} (${result.localQueueOutcome.totalBytes} bytes total).\n` +
              `Read the queue and open a chore PR appending the section(s) to project-local CLAUDE.md.\n`,
          );
          acceptedCount += 1;
          continue;
        }
        const ao = result.appendOutcome;
        if (ao && ao.kind === "appended") {
          process.stdout.write(
            `Accepted [${tier}]: appended to ${ao.filePath} (${ao.totalLines}/${MAX_POOL_LINES} lines).\n`,
          );
          acceptedCount += 1;
        } else if (ao && ao.kind === "rejected-pool-full") {
          process.stdout.write(
            `POOL FULL: ${ao.filePath} reached ${ao.totalLines}/${MAX_POOL_LINES} lines. Trim the pool file by hand and re-run review for this candidate. (Marker left in source CLAUDE.md.)\n`,
          );
          skippedCount += 1;
        } else if (ao) {
          process.stdout.write(`Append refused (validation): ${ao.validation.errors.join("; ")}\n`);
          skippedCount += 1;
        } else {
          process.stdout.write(`Append refused: no outcome returned (unexpected).\n`);
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

interface LessonsTrimOpts {
  json?: boolean;
  yes?: boolean;
  dropMaybes?: boolean;
}

async function cmdLessonsTrim(domain: string, opts: LessonsTrimOpts): Promise<void> {
  if (!isValidDomain(domain)) {
    process.stderr.write(
      `ERROR: invalid domain '${domain}': expected lowercase dash-separated tag (e.g. 'solana', 'eip-712').\n`,
    );
    process.exit(2);
  }
  const filePath = sharedLessonsPath("target", domain);
  try {
    await fs.access(filePath);
  } catch {
    process.stderr.write(
      `ERROR: no shared-lesson pool found for domain '${domain}' at ${filePath}.\n`,
    );
    process.exit(2);
  }

  process.stderr.write(`Generating trim proposal for '${domain}'...\n`);
  const runId = `trim-${new Date().toISOString().replace(/[:.]/g, "-")}-${domain}`;
  const logger = new Logger({ runId, verbose: false });
  await logger.open();
  let result: { proposal: TrimProposal; file: PoolFile };
  try {
    result = await proposeTrim({ domain, logger });
  } catch (err) {
    process.stderr.write(`ERROR: trim proposal failed: ${(err as Error).message}\n`);
    await logger.close();
    process.exit(2);
  } finally {
    await logger.close();
  }

  const { proposal, file } = result;
  const dropMaybes = !!opts.dropMaybes;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ proposal, dropMaybes }, null, 2) + "\n",
    );
    return;
  }

  if (proposal.totalEntries === 0) {
    process.stdout.write(`Pool for '${domain}' has no entries — nothing to trim.\n`);
    return;
  }

  process.stdout.write(formatTrimProposal(file, proposal, { dropMaybes }) + "\n\n");

  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to auto-accept, or pipe to a TTY.\n",
      );
      process.exit(2);
    }
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try {
      answer = (await rl.question("Apply this trim? [y/N] ")).trim().toLowerCase();
    } finally {
      rl.close();
    }
    if (answer !== "y" && answer !== "yes") {
      process.stdout.write("Aborted — no mutation.\n");
      return;
    }
  } else {
    process.stdout.write("Auto-confirmed (--yes).\n");
  }

  const applied: ApplyTrimResult = await applyTrimProposal({
    proposal,
    file,
    dropMaybes,
  });
  if (applied.kind === "still-over-cap") {
    process.stderr.write(
      `REFUSED: trimmed pool would still be ${applied.totalLines}/${MAX_POOL_LINES} lines. The model didn't drop enough — re-run \`vp-dev lessons trim ${domain}\` (optionally with --drop-maybes) or edit ${applied.filePath} by hand.\n`,
    );
    process.exit(2);
  }
  process.stdout.write(
    `Trimmed '${domain}': kept ${applied.kept}, dropped ${applied.dropped}, ${applied.totalLines}/${MAX_POOL_LINES} lines. (${applied.filePath})\n`,
  );
}

interface LessonsClearLocalQueueOpts {
  all?: boolean;
  merged?: boolean;
  threshold?: number;
  apply?: boolean;
  yes?: boolean;
  json?: boolean;
}

async function cmdLessonsClearLocalQueue(
  opts: LessonsClearLocalQueueOpts,
): Promise<void> {
  if (opts.all && opts.merged) {
    process.stderr.write(
      "ERROR: --all and --merged are mutually exclusive.\n",
    );
    process.exit(2);
  }
  // Default mode: --merged. The advisory output still surfaces the full
  // entry count + match count, so the operator sees how many entries
  // would NOT be dropped (i.e. those still pending PR / merge).
  const mode: "all" | "merged" = opts.all ? "all" : "merged";
  const {
    LOCAL_CLAUDE_QUEUE_FILE,
  } = await import("./agent/localClaudeQueue.js");
  const {
    DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
    clearLocalClaudeQueue,
    detectMergedQueueEntries,
    parseQueueEntries,
    resolveQueueClearJaccardMin,
  } = await import("./agent/localClaudeQueueClear.js");

  const threshold = opts.threshold ?? resolveQueueClearJaccardMin();
  const queueFilePath = LOCAL_CLAUDE_QUEUE_FILE;
  const claudeMdPath = "CLAUDE.md";

  // Read current state for advisory output. Both file-not-found cases are
  // benign: missing queue → nothing to do; missing CLAUDE.md → no merges.
  let queueContent = "";
  try {
    queueContent = await fs.readFile(queueFilePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  let claudeMd = "";
  try {
    claudeMd = await fs.readFile(claudeMdPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const allEntries = parseQueueEntries(queueContent);
  const detected =
    mode === "merged"
      ? detectMergedQueueEntries({
          queueContent,
          claudeMd,
          jaccardMin: threshold,
        })
      : { entries: allEntries, merged: [] };
  const candidatesToRemove =
    mode === "all" ? allEntries : detected.merged.map((m) => m.entry);

  if (opts.json && !opts.apply) {
    const payload = {
      mode,
      threshold: mode === "merged" ? threshold : undefined,
      defaultThreshold: DEFAULT_QUEUE_CLEAR_JACCARD_MIN,
      queueFilePath,
      claudeMdPath,
      totalEntries: allEntries.length,
      candidatesToRemove: candidatesToRemove.length,
      matches: detected.merged.map((m) => ({
        sourceHeader: m.entry.header,
        heading: m.entry.heading,
        similarity: Number(m.similarity.toFixed(4)),
        matchedSectionHeading: m.matchedSection.heading,
      })),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  if (allEntries.length === 0) {
    process.stdout.write(
      `Queue is empty (${queueFilePath}). Nothing to clear.\n`,
    );
    return;
  }

  // Advisory header.
  process.stdout.write(
    `Queue: ${queueFilePath} (${allEntries.length} entries, ${queueContent.length} bytes)\n`,
  );
  if (mode === "merged") {
    process.stdout.write(
      `Mode: --merged (threshold ${threshold}; project CLAUDE.md: ${
        claudeMd.length > 0 ? `${claudeMd.length} bytes` : "MISSING — no merges detectable"
      })\n`,
    );
    if (detected.merged.length === 0) {
      process.stdout.write(
        "No queue entries match a section in project-local CLAUDE.md above threshold. Nothing to drop.\n",
      );
      return;
    }
    process.stdout.write(
      `\n${detected.merged.length} entries look already-merged (similarity ≥ ${threshold}):\n\n`,
    );
    printTable(
      ["heading", "similarity", "matched-section", "source"],
      detected.merged.map((m) => [
        truncate(m.entry.heading || "(no heading)", 40),
        m.similarity.toFixed(3),
        truncate(m.matchedSection.heading, 40),
        extractSourceFromHeader(m.entry.header),
      ]),
    );
  } else {
    process.stdout.write("Mode: --all (operator override; will drop EVERY entry)\n\n");
    printTable(
      ["heading", "source"],
      allEntries.map((e) => [
        truncate(e.heading || "(no heading)", 50),
        extractSourceFromHeader(e.header),
      ]),
    );
  }

  if (!opts.apply) {
    process.stdout.write(
      "\nList-only (default). Re-run with --apply to actually mutate the queue file.\n",
    );
    return;
  }

  // --apply path. Confirm via TTY prompt unless --yes was passed. Mirrors
  // `cleanup incomplete-branches` rather than the compact/prune-lessons
  // token-gate pattern: queue is gitignored append-only state, false
  // positives are recoverable from the rendered CLAUDE.md content, and the
  // proposal-vs-current-file drift invariant doesn't apply here.
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes for non-interactive use.\n",
      );
      process.exit(2);
    }
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answer: string;
    try {
      answer = (
        await rl.question(
          `\nDrop ${candidatesToRemove.length} entry/entries from ${queueFilePath}? [y/N] `,
        )
      )
        .trim()
        .toLowerCase();
    } finally {
      rl.close();
    }
    if (answer !== "y" && answer !== "yes") {
      process.stdout.write("Aborted — no mutation.\n");
      return;
    }
  } else {
    process.stdout.write("\nAuto-confirmed (--yes).\n");
  }

  const result = await clearLocalClaudeQueue({
    mode,
    jaccardMin: mode === "merged" ? threshold : undefined,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  process.stdout.write(
    `\nQueue cleared: removed ${result.removed} entry/entries, ${result.remaining} remaining. (${result.bytesBefore} -> ${result.bytesAfter} bytes)\n`,
  );
}

function extractSourceFromHeader(header: string): string {
  const m = header.match(/source=(\S+)/);
  return m ? m[1] : "(unknown)";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
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

/** Parse a finite number in (0, 1]. Used by `lessons clear-local-queue --threshold`. */
function parseUnitInterval(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    throw new Error(`Expected finite number in (0, 1], got "${value}"`);
  }
  return n;
}

/** Count issues in a given terminal status — pure helper, no I/O. */
function countByStatus(state: RunState, status: string): number {
  let n = 0;
  for (const e of Object.values(state.issues)) {
    if (e.status === status) n += 1;
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

interface ResearchRegisterTrimsOpts {
  agentsSpec: string;
  trimsDir: string;
  tagsFrom?: string;
}

async function cmdResearchRegisterTrims(opts: ResearchRegisterTrimsOpts): Promise<void> {
  const specRaw = JSON.parse(await fs.readFile(opts.agentsSpec, "utf8")) as Array<{ devAgentId: string }>;
  const uniqueIds = [...new Set(specRaw.map((s) => s.devAgentId))];
  const registry = await loadRegistry();
  const parentTags = opts.tagsFrom
    ? registry.agents.find((a) => a.agentId === opts.tagsFrom)?.tags ?? null
    : null;
  if (opts.tagsFrom && !parentTags) {
    throw new Error(`--tags-from agent '${opts.tagsFrom}' not found in registry`);
  }
  let registered = 0;
  let already = 0;
  await mutateRegistry(async (reg) => {
    for (const id of uniqueIds) {
      const existed = reg.agents.some((a) => a.agentId === id);
      const rec = createAgent(reg); // mints new id we discard
      // Replace minted record with the requested specific id
      reg.agents = reg.agents.filter((a) => a.agentId !== rec.agentId);
      const explicit: typeof rec = {
        ...rec,
        agentId: id,
        tags: parentTags ?? ["research-study"],
      };
      if (existed) {
        const i = reg.agents.findIndex((a) => a.agentId === id);
        if (i >= 0) {
          reg.agents[i].tags = parentTags ?? reg.agents[i].tags;
        }
        already += 1;
      } else {
        reg.agents.push(explicit);
        registered += 1;
      }
    }
  });
  for (const id of uniqueIds) {
    const src = path.join(opts.trimsDir, `${id}-CLAUDE.md`);
    const dstDir = path.join("agents", id);
    const dst = path.join(dstDir, "CLAUDE.md");
    await fs.mkdir(dstDir, { recursive: true });
    await fs.copyFile(src, dst);
  }
  process.stdout.write(`Registered ${registered} new agents (+${already} already present), copied ${uniqueIds.length} CLAUDE.md files into agents/<devAgentId>/.\n`);
  if (parentTags) {
    process.stdout.write(`Tags copied from ${opts.tagsFrom}: ${parentTags.length} tags.\n`);
  }
}

interface ResearchPlanTrimsOpts {
  parent: string;
  sizes: string;
  replicates: number;
  outputDir: string;
  outputSpec: string;
  seedBase: number;
  preserve: string;
  cloneBase?: string;
  repos?: string;
}

async function cmdResearchPlanTrims(opts: ResearchPlanTrimsOpts): Promise<void> {
  const { planRandomTrims } = await import("./research/curveStudy/randomTrim.js");
  const parentPath = path.join("agents", opts.parent, "CLAUDE.md");
  const parent = await fs.readFile(parentPath, "utf8");
  const sizes = opts.sizes.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  if (sizes.length === 0) throw new Error("--sizes: no valid sizes parsed");
  const preserve = opts.preserve ? opts.preserve.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const cloneTemplate = opts.cloneBase ?? "/tmp/study-clones/{agentId}";
  const wantsRepoToken = cloneTemplate.includes("{repo}");
  const repos = opts.repos
    ? opts.repos.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  if (wantsRepoToken && repos.length === 0) {
    throw new Error("--clone-base contains {repo} token but --repos is empty. Pass --repos repo1,repo2 to template the spec.");
  }
  if (!wantsRepoToken && repos.length > 0) {
    process.stderr.write("WARNING: --repos provided but --clone-base has no {repo} token; --repos will be ignored.\n");
  }

  const plans = planRandomTrims({
    parent,
    preserve,
    sizes,
    replicates: opts.replicates,
    seedBase: opts.seedBase,
  });

  await fs.mkdir(opts.outputDir, { recursive: true });
  const spec: Array<{ devAgentId: string; sizeBytes: number; clonePath: string; targetBytes: number; seed: number; selectedIds: string[]; droppedIds: string[]; repo?: string }> = [];
  for (const plan of plans) {
    const devAgentId = `${opts.parent}-trim-${plan.size}-s${plan.seed}`;
    const trimPath = path.join(opts.outputDir, `${devAgentId}-CLAUDE.md`);
    await fs.writeFile(trimPath, plan.result.trimmed);
    if (wantsRepoToken) {
      for (const repo of repos) {
        spec.push({
          devAgentId,
          sizeBytes: plan.result.actualBytes,
          clonePath: cloneTemplate.replace("{agentId}", devAgentId).replace("{repo}", repo),
          targetBytes: plan.size,
          seed: plan.seed,
          selectedIds: plan.result.selectedIds,
          droppedIds: plan.result.droppedIds,
          repo,
        });
      }
    } else {
      spec.push({
        devAgentId,
        sizeBytes: plan.result.actualBytes,
        clonePath: cloneTemplate.replace("{agentId}", devAgentId),
        targetBytes: plan.size,
        seed: plan.seed,
        selectedIds: plan.result.selectedIds,
        droppedIds: plan.result.droppedIds,
      });
    }
  }
  await fs.writeFile(opts.outputSpec, JSON.stringify(spec, null, 2));

  process.stdout.write(`\nPlan: ${plans.length} trims (${sizes.length} sizes × ${opts.replicates} replicates)\n`);
  for (const s of spec) {
    process.stdout.write(`  ${s.devAgentId}  target=${s.targetBytes}B  actual=${s.sizeBytes}B  kept=${s.selectedIds.length}/${s.selectedIds.length + s.droppedIds.length}\n`);
  }
  process.stdout.write(`\nTrimmed CLAUDE.md files → ${opts.outputDir}\n`);
  process.stdout.write(`agents-spec → ${opts.outputSpec}\n`);
  process.stdout.write(`\nNext steps:\n`);
  process.stdout.write(`  1. Register each devAgentId in the registry with its CLAUDE.md.\n`);
  process.stdout.write(`  2. Clone --target-repo into each clonePath.\n`);
  process.stdout.write(`  3. vp-dev research curve-study --agents-spec ${opts.outputSpec} --target-repo ... --issues ...\n`);
  if (preserve.length > 0) {
    process.stdout.write(`\nWARNING: preserve list = [${preserve.join(", ")}]. Any preserved section is a confounder for the curve. Report it in the study writeup.\n`);
  }
}

interface ResearchCurveStudyOpts {
  agentsSpec: string;
  targetRepo: string;
  issues: string;
  logsDir: string;
  output: string;
  parallelism: number;
  rubrics?: string;
  dryRun: boolean;
  allowClosedIssue?: boolean;
  issueBodyOnly?: boolean;
  maxTotalCostUsd?: number;
  mode: string;
  collisionPolicy: string;
  curveForm: string;
  /** Curve-redo Phase 1d: per-cell A/B JSON dir; opts into the new 0–200 quality formula. */
  cellScoresDir?: string;
}

type CurveForm = "linear-log" | "linear-raw" | "poly2-log" | "poly2-raw";

function parseCurveForm(s: string): { degree: number; xTransform: "identity" | "log" } {
  switch (s as CurveForm) {
    case "linear-log":
      return { degree: 1, xTransform: "log" };
    case "linear-raw":
      return { degree: 1, xTransform: "identity" };
    case "poly2-log":
      return { degree: 2, xTransform: "log" };
    case "poly2-raw":
      return { degree: 2, xTransform: "identity" };
    default:
      throw new Error(
        `--curve-form must be one of linear-log|linear-raw|poly2-log|poly2-raw, got '${s}'`,
      );
  }
}

async function cmdResearchCurveStudy(opts: ResearchCurveStudyOpts): Promise<void> {
  const { runCurveStudy } = await import("./research/curveStudy/study.js");
  if (opts.mode !== "replace" && opts.mode !== "update") {
    throw new Error(`--mode must be 'replace' or 'update', got '${opts.mode}'`);
  }
  if (
    opts.collisionPolicy !== "replace-on-collision" &&
    opts.collisionPolicy !== "average-on-collision" &&
    opts.collisionPolicy !== "keep-both"
  ) {
    throw new Error(`--collision-policy must be replace-on-collision|average-on-collision|keep-both, got '${opts.collisionPolicy}'`);
  }
  const { degree, xTransform } = parseCurveForm(opts.curveForm);
  const agents = JSON.parse(await fs.readFile(opts.agentsSpec, "utf8")) as ReadonlyArray<{
    devAgentId: string;
    sizeBytes: number;
    clonePath: string;
  }>;
  const issues = opts.issues.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  const rubrics = opts.rubrics ? JSON.parse(await fs.readFile(opts.rubrics, "utf8")) : undefined;

  let existingAccuracySamples: ReadonlyArray<{ xBytes: number; factor: number }> | undefined;
  let existingTokenCostSamples: ReadonlyArray<{ xBytes: number; factor: number }> | undefined;
  if (opts.mode === "update") {
    const mod = await import("./util/contextCostCurve.js");
    existingAccuracySamples = mod.ACCURACY_DEGRADATION_SAMPLES;
    existingTokenCostSamples = mod.TOKEN_COST_SAMPLES;
  }

  const result = await runCurveStudy({
    agents,
    issues,
    targetRepo: opts.targetRepo,
    parallelism: opts.parallelism,
    dryRun: opts.dryRun,
    allowClosedIssue: !!opts.allowClosedIssue,
    issueBodyOnly: !!opts.issueBodyOnly,
    // Hardcoded isolation: each cell runs without the live target-repo CLAUDE.md
    // or the user-global ~/.claude/CLAUDE.md. Effective context = per-agent
    // CLAUDE.md only, matching the size axis we're varying. Loaded mode is
    // operator-specific (user-global content varies per individual) and would
    // dilute the per-agent signal — the curve is consumed by the orchestrator's
    // pickAgents at decision time, where target + global are constant across
    // candidates and per-agent bytes are the only variable that differs.
    suppressTargetClaudeMd: true,
    maxTotalCostUsd: opts.maxTotalCostUsd,
    logsDir: opts.logsDir,
    outputPath: opts.output,
    cwd: process.cwd(),
    rubrics,
    mode: opts.mode,
    collisionPolicy: opts.collisionPolicy,
    regressionDegree: degree,
    regressionXTransform: xTransform,
    existingAccuracySamples,
    existingTokenCostSamples,
    cellScoresDir: opts.cellScoresDir,
  });
  process.stdout.write(`\nDone. ${result.cells.length} cells, $${result.totalCostUsd.toFixed(2)}, ${(result.wallMs / 60000).toFixed(1)}min.\n`);
  process.stdout.write(`Mode: ${result.mode}. Curve form: ${opts.curveForm}. Proposal written to ${opts.output}.\n`);
  printCurveSummary("ACCURACY_DEGRADATION_SAMPLES", result.accuracy, degree);
  printCurveSummary("TOKEN_COST_SAMPLES", result.tokenCost, degree);
}

interface ResearchBenchSpecialistsOpts {
  issues: string;
  targetRepo: string;
  clonePath: string;
  controlLogsDirs: string;
  replicates: number;
  logsDir: string;
  output: string;
  maxCostUsd?: number;
  controlPrefix: string;
  skipDispatch?: boolean;
}

async function cmdResearchBenchSpecialists(
  opts: ResearchBenchSpecialistsOpts,
): Promise<void> {
  const { runSpecialistBench, formatBenchReport } = await import(
    "./research/specialistBench/study.js"
  );
  const issueIds = opts.issues
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (issueIds.length === 0) {
    process.stderr.write(`ERROR: --issues must be a comma-separated list of issue numbers.\n`);
    process.exit(2);
  }
  const controlLogsDirs = opts.controlLogsDirs
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result = await runSpecialistBench({
    issueIds,
    targetRepo: opts.targetRepo,
    clonePath: opts.clonePath,
    replicates: opts.replicates,
    logsDir: opts.logsDir,
    controlLogsDirs,
    controlPrefix: opts.controlPrefix,
    outputPath: opts.output,
    cwd: process.cwd(),
    maxTotalCostUsd: opts.maxCostUsd,
    skipDispatch: opts.skipDispatch,
    onEvent: (e) => {
      const ts = e.t.toISOString().slice(11, 19);
      if (e.kind === "pick") {
        process.stderr.write(`[${ts}] pick: issue #${e.issueId} → ${e.pickedAgentId}\n`);
      } else if (e.kind === "start") {
        process.stderr.write(
          `[${ts}] start: issue #${e.spec.issueId} rep=${e.spec.replicate} agent=${e.spec.pickedAgentId}\n`,
        );
      } else if (e.kind === "done") {
        process.stderr.write(
          `[${ts}] done: issue #${e.spec.issueId} rep=${e.spec.replicate} rc=${e.rc}\n`,
        );
      } else if (e.kind === "budget-exhausted") {
        process.stderr.write(`[${ts}] BUDGET EXHAUSTED at $${e.usdSoFar.toFixed(2)}\n`);
      }
    },
  });
  process.stdout.write("\n" + formatBenchReport(result) + "\n");
  process.stdout.write(`\nProposal written to ${opts.output}.\n`);
}

interface ResearchGenerateTestsOpts {
  issue: number;
  targetRepo: string;
  targetRepoPath?: string;
  framework: string;
  outDir: string;
  batchCount: number;
  testsPerBatch: number;
  styleFixture?: string;
}

async function cmdResearchGenerateTests(opts: ResearchGenerateTestsOpts): Promise<void> {
  if (opts.framework !== "node-test" && opts.framework !== "vitest") {
    process.stderr.write(
      `ERROR: --framework must be 'node-test' or 'vitest', got '${opts.framework}'.\n`,
    );
    process.exit(2);
  }
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);
  const detail = await getIssueDetail(opts.targetRepo, opts.issue);
  if (!detail) {
    process.stderr.write(`ERROR: issue #${opts.issue} not found in ${opts.targetRepo}.\n`);
    process.exit(2);
  }
  const { generateTests } = await import("./research/curveStudy/testGenerator.js");
  const totalRequested = opts.batchCount * opts.testsPerBatch;
  process.stderr.write(
    `Generating ${totalRequested} tests for issue #${opts.issue} (${detail.title})\n` +
      `  framework=${opts.framework}, batches=${opts.batchCount} × ${opts.testsPerBatch}\n` +
      `  out-dir=${opts.outDir}\n`,
  );
  const result = await generateTests({
    issueId: opts.issue,
    issueTitle: detail.title,
    issueBody: detail.body,
    repoPath,
    framework: opts.framework as "node-test" | "vitest",
    outDir: opts.outDir,
    batchCount: opts.batchCount,
    testsPerBatch: opts.testsPerBatch,
    styleFixturePath: opts.styleFixture,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) process.exit(1);
}

function printCurveSummary(
  label: string,
  curve: { samples: ReadonlyArray<{ xBytes: number; factor: number }>; regression: { degree: number; xTransform: "identity" | "log"; n: number; rss: number; tss: number; rSquared: number; rSquaredAdjusted: number; significance: { fStatistic: number; fDfRegression: number; fDfResidual: number; fPValue: number } } | null },
  degree: number,
): void {
  process.stdout.write(`\n=== ${label} ===\n`);
  if (!curve.regression) {
    process.stdout.write(`No regression fitted (need >${degree} samples; got ${curve.samples.length}).\n`);
    return;
  }
  const r = curve.regression;
  const sig = r.significance;
  const adj = Number.isFinite(r.rSquaredAdjusted) ? r.rSquaredAdjusted.toFixed(3) : "n/a";
  const fp = Number.isFinite(sig.fPValue) ? sig.fPValue.toExponential(2) : "n/a";
  const fStat = Number.isFinite(sig.fStatistic) ? sig.fStatistic.toFixed(2) : "n/a";
  process.stdout.write(
    `Regression (degree=${r.degree}, xTransform=${r.xTransform}, n=${r.n}, R²=${r.rSquared.toFixed(3)}, adj-R²=${adj}, F(${sig.fDfRegression},${sig.fDfResidual})=${fStat}, p=${fp})\n`,
  );
  if (Number.isFinite(sig.fPValue) && sig.fPValue > 0.05) {
    process.stdout.write(
      `WARNING: overall F-test p-value > 0.05 — fit is not statistically significant.\n`,
    );
  }
  process.stdout.write(`Samples to hand-merge into ${label} (src/util/contextCostCurve.ts):\n`);
  for (const s of curve.samples) {
    process.stdout.write(`  { xBytes: ${s.xBytes}, factor: ${s.factor.toFixed(3)} },\n`);
  }
}

interface ResearchRunTestsOpts {
  diffPath?: string;
  testsDir: string;
  cloneDir: string;
  framework: string;
  out: string;
  timeoutMs: number;
  testCmd?: string;
  baselineOnly?: boolean;
  testsDestRelDir?: string;
}

async function cmdResearchRunTests(opts: ResearchRunTestsOpts): Promise<void> {
  if (opts.framework !== "node-test" && opts.framework !== "vitest") {
    process.stderr.write(
      `ERROR: --framework must be 'node-test' or 'vitest', got '${opts.framework}'.\n`,
    );
    process.exit(2);
  }
  if (!opts.baselineOnly && !opts.diffPath) {
    process.stderr.write(
      `ERROR: --diff-path is required unless --baseline-only is set.\n`,
    );
    process.exit(2);
  }
  const { runHiddenTests } = await import("./research/curveStudy/testRunner.js");
  const result = await runHiddenTests({
    diffPath: opts.diffPath,
    testsDir: opts.testsDir,
    cloneDir: opts.cloneDir,
    framework: opts.framework as "node-test" | "vitest",
    timeoutMs: opts.timeoutMs,
    testCmd: opts.testCmd,
    baselineOnly: !!opts.baselineOnly,
    testsDestRelDir: opts.testsDestRelDir,
  });
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  await fs.writeFile(opts.out, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  // Non-zero exit when the run failed structurally (apply / parse / timeout)
  // so caller scripts can branch on it without re-parsing the JSON.
  if (!result.applyCleanly || result.errorReason) process.exit(1);
}

interface ResearchGradeReasoningOpts {
  issue: number;
  targetRepo: string;
  decision: string;
  diffPath?: string;
  pushbackPath?: string;
  k: number;
  out: string;
}

async function cmdResearchGradeReasoning(opts: ResearchGradeReasoningOpts): Promise<void> {
  if (opts.decision !== "implement" && opts.decision !== "pushback" && opts.decision !== "error") {
    process.stderr.write(
      `ERROR: --decision must be 'implement', 'pushback', or 'error', got '${opts.decision}'.\n`,
    );
    process.exit(2);
  }
  const detail = await getIssueDetail(opts.targetRepo, opts.issue);
  if (!detail) {
    process.stderr.write(`ERROR: issue #${opts.issue} not found in ${opts.targetRepo}.\n`);
    process.exit(2);
  }
  let diff: string | undefined;
  let pushbackComment: string | undefined;
  if (opts.decision === "implement") {
    if (!opts.diffPath) {
      process.stderr.write(`ERROR: --diff-path is required when --decision implement.\n`);
      process.exit(2);
    }
    diff = await fs.readFile(opts.diffPath, "utf-8");
  } else if (opts.decision === "pushback") {
    if (!opts.pushbackPath) {
      process.stderr.write(`ERROR: --pushback-path is required when --decision pushback.\n`);
      process.exit(2);
    }
    pushbackComment = await fs.readFile(opts.pushbackPath, "utf-8");
  }
  const { gradeReasoning } = await import("./research/curveStudy/reasoningJudge.js");
  const result = await gradeReasoning({
    issueId: opts.issue,
    issueTitle: detail.title,
    issueBody: detail.body,
    decision: opts.decision as "implement" | "pushback" | "error",
    diff,
    pushbackComment,
    k: opts.k,
  });
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  await fs.writeFile(opts.out, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.isError) process.exit(1);
}
