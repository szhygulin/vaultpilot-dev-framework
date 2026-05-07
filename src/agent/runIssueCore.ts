import { promises as fs } from "node:fs";
import { ensureAgent, mutateRegistry } from "../state/registry.js";
import { runCodingAgent } from "./codingAgent.js";
import { applyReplayRollback, captureWorktreeDiff, readWorktreeHead } from "./replay.js";
import {
  agentClaudeMdPath,
  appendBlock,
  expireSentinels,
  forkClaudeMd,
  type AppendOutcome,
} from "./specialization.js";
import { isInfraFlake, summarizeFailureRun, summarizeRun, type SummarizerOutput } from "./summarizer.js";
import { resolveExpiryPolicies } from "../util/sentinels.js";
import {
  BYTE_BUDGET_WARNING_THRESHOLD,
  normalizedAccuracyFactor,
} from "../util/contextCostCurve.js";
import {
  checkLessonNovelty,
  deriveStableSectionId,
  extractCitedStableIds,
  recordIntroduction,
  recordPushback,
  recordReinforcement,
} from "../state/lessonUtility.js";
import { shouldPushPartial } from "./shouldPushPartial.js";
import {
  buildIncompleteBranchName,
  createWorktree,
  pushPartialBranch,
  removeWorktree,
  type WorktreeHandle,
} from "../git/worktree.js";
import type { Logger } from "../log/logger.js";
import type { AgentRecord, IssueSummary, ResultEnvelope, ResumeContext } from "../types.js";
import type { RunCostTracker } from "../util/costTracker.js";

export interface RunIssueCoreInput {
  agent: AgentRecord;
  issue: IssueSummary;
  targetRepo: string;
  targetRepoPath: string;
  runId: string;
  dryRun: boolean;
  logger: Logger;
  skipSummary?: boolean;
  inspectPaths?: string[];
  /**
   * Per-run cost accumulator threaded down from `cmdRun()`. Phase 1 of
   * the cost-ceiling design (#85): measurement only, no enforcement.
   * Optional so `vp-dev spawn` (single-issue, no run scope) can omit it.
   */
  costTracker?: RunCostTracker;
  /**
   * Per-run cost ceiling in USD threaded down from `cmdRun()` (Phase 2,
   * #86). Used here only to guard the summarizer call: if the per-run
   * total has already crossed the ceiling by the time this run finishes,
   * the summarizer is skipped to avoid poisoning the agent's
   * `agents/<agent-id>/CLAUDE.md` with a lesson distilled from a run the
   * orchestrator was about to abort. Optional and a no-op when absent.
   */
  budgetUsd?: number;
  /**
   * Issue #119 Phase 2: per-issue resume context. When set, `createWorktree`
   * branches off the named salvage ref + rebases onto origin/main, and the
   * coding agent's seed gets a "## Previous attempt (resumed)" section.
   * Built upstream by the CLI from `findIncompleteBranchesOnOrigin` when
   * `--resume-incomplete` is passed; orchestrator looks up the per-issue
   * entry from its map before invoking this helper.
   */
  resumeContext?: ResumeContext;
  /**
   * Issue #142 (Phase 2 of #134): per-run flag that turns on the
   * workflow prompt's auto-file-next-phase Step N+1 section. Forwarded
   * verbatim to `runCodingAgent`, which threads it into
   * `buildAgentSystemPrompt`. Optional: undefined / false preserves the
   * pre-#142 behavior (no Step N+1 rendered, no follow-up issue filed).
   */
  autoPhaseFollowup?: boolean;
  /**
   * Issue #179 phase 3: when `true`, the workflow's Step 1 omits the
   * comments fetch — body-only dispatch for closed-issue calibration runs.
   */
  issueBodyOnly?: boolean;
  /**
   * Issue #179 phase 3: suppress the live target-repo CLAUDE.md prepend
   * so the calibration's effective context size matches the per-agent
   * file's nominal size. Forwarded to runCodingAgent → buildAgentSystemPrompt.
   */
  suppressTargetClaudeMd?: boolean;
  /**
   * Coding-agent model override forwarded to runCodingAgent. Defaults to
   * `claude-opus-4-7` when undefined. Curve-redo calibration passes
   * `claude-sonnet-4-6` so every cell runs at a uniform tier.
   */
  model?: string;
  /**
   * Curve-redo calibration mode. When set:
   *   - if `baseSha` is supplied, the worktree is `git reset --hard`'d to
   *     that SHA after creation but before the coding agent runs (closed-
   *     issue replay; open-issue cells omit baseSha and the worktree stays
   *     at origin/main).
   *   - after the coding agent finishes, the worktree's diff (modified +
   *     newly-staged tracked files) is written to `captureDiffPath` so
   *     downstream test-runner / reasoning-judge phases can score it.
   *   - the diff capture's base is the supplied `baseSha` if present, else
   *     the worktree's HEAD SHA snapshotted just before the agent runs.
   *     Open-issue cells (no `baseSha`) thus capture committed agent work
   *     without needing operator-side wiring.
   * Undefined for normal callers — preserves pre-curve-redo behavior.
   */
  replayMode?: {
    baseSha?: string;
    captureDiffPath: string;
  };
}

export interface RunIssueCoreResult {
  envelope?: ResultEnvelope;
  finalText: string;
  parseError?: string;
  durationMs: number;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
  /**
   * SDK result subtype passed through from CodingAgentResult — e.g.
   * `error_max_turns`, `error_max_budget_usd`, `error_during_execution`.
   * Distinct from `errorReason` (free-form human string) so the orchestrator
   * can record the machine-readable cause of failure on the run-state entry
   * and not collapse it into the parser-symptom string. See issue #87.
   */
  errorSubtype?: string;
  appendOutcome?: AppendOutcome;
  summarySkipReason?: string;
  worktreePath?: string;
  branchName?: string;
  /** See CodingAgentResult.reconciled. */
  reconciled?: string;
  /** See CodingAgentResult.branchUrl. */
  branchUrl?: string;
  /**
   * Set when the orchestrator-level safety net pushed in-flight worktree
   * edits to a labeled `<branch>-incomplete-<runId>` ref before pruning.
   * Distinct from `branchUrl` (which describes the agent's primary branch
   * found via reconcile). See issue #88.
   */
  partialBranchUrl?: string;
}

export async function runIssueCore(input: RunIssueCoreInput): Promise<RunIssueCoreResult> {
  let worktree: WorktreeHandle | null = null;
  let envelope: ResultEnvelope | undefined;

  try {
    await forkClaudeMd(input.agent.agentId, input.targetRepoPath);

    worktree = await createWorktree({
      repoPath: input.targetRepoPath,
      agentId: input.agent.agentId,
      issueId: input.issue.id,
      resumeFromBranch: input.resumeContext?.branch,
    });
    input.logger.info("agent.spawned", {
      agentId: input.agent.agentId,
      issueId: input.issue.id,
      worktree: worktree.path,
      branch: worktree.branch,
      resumedFrom: input.resumeContext?.branch,
      resumedRunId: input.resumeContext?.runId,
    });

    // Curve-redo replay-mode rollback: when a baseSha is supplied (closed-
    // issue replay), reset the worktree HEAD to that SHA before the agent
    // runs so it encounters the pre-fix codebase state. Open-issue cells
    // omit baseSha and the worktree stays at origin/main. Throws on bad
    // SHA — orchestrator surfaces it via the per-cell error envelope.
    if (input.replayMode?.baseSha) {
      await applyReplayRollback({
        worktreePath: worktree.path,
        baseSha: input.replayMode.baseSha,
      });
      input.logger.info("agent.replay_rollback", {
        agentId: input.agent.agentId,
        issueId: input.issue.id,
        baseSha: input.replayMode.baseSha,
      });
    }

    // Snapshot the worktree HEAD BEFORE the coding agent runs (after any
    // replay rollback). captureWorktreeDiff diffs against this so committed
    // work the agent makes on its branch is visible in the captured diff
    // even when the caller didn't pass an explicit baseSha. Without this
    // snapshot, `git diff --cached` is HEAD-relative and silently drops the
    // agent's commit (the worktree is clean post-commit). Skipped when
    // captureDiffPath is unset to keep normal callers shell-free.
    let captureBaseSha: string | undefined;
    if (input.replayMode?.captureDiffPath) {
      captureBaseSha =
        input.replayMode.baseSha ?? (await readWorktreeHead(worktree.path));
    }

    const result = await runCodingAgent({
      agent: input.agent,
      issueId: input.issue.id,
      targetRepo: input.targetRepo,
      targetRepoPath: input.targetRepoPath,
      worktreePath: worktree.path,
      branchName: worktree.branch,
      dryRun: input.dryRun,
      logger: input.logger,
      inspectPaths: input.inspectPaths,
      costTracker: input.costTracker,
      resumeContext: input.resumeContext,
      autoPhaseFollowup: input.autoPhaseFollowup,
      issueBodyOnly: input.issueBodyOnly,
      suppressTargetClaudeMd: input.suppressTargetClaudeMd,
      model: input.model,
    });

    // Curve-redo replay-mode diff capture: persist the agent's worktree
    // edits before any teardown. Best-effort — a capture failure must not
    // mask a successful run, so we log + continue rather than throw.
    if (input.replayMode?.captureDiffPath) {
      try {
        await captureWorktreeDiff({
          worktreePath: worktree.path,
          outPath: input.replayMode.captureDiffPath,
          baseSha: captureBaseSha,
        });
        input.logger.info("agent.replay_diff_captured", {
          agentId: input.agent.agentId,
          issueId: input.issue.id,
          path: input.replayMode.captureDiffPath,
        });
      } catch (err) {
        input.logger.warn("agent.replay_diff_capture_failed", {
          agentId: input.agent.agentId,
          issueId: input.issue.id,
          path: input.replayMode.captureDiffPath,
          err: (err as Error).message,
        });
      }
    }

    envelope = result.envelope;
    let appendOutcome: AppendOutcome | undefined;
    let summarySkipReason: string | undefined;

    // #86 Phase 2: when the per-run cost ceiling has already been crossed
    // by the time this in-flight issue finished, skip the summarizer.
    // Rationale: the orchestrator is about to mark the run aborted, and
    // distilling a lesson from a run that's being torn down for cost
    // reasons risks seeding the agent's prompt with a lesson the operator
    // never intended to land. Doesn't change the envelope outcome — the
    // PR / pushback / error stays as the agent reported it; only the
    // summarizer write is suppressed.
    const budgetExceededAtCompletion =
      input.budgetUsd !== undefined &&
      input.costTracker?.exceedsBudget(input.budgetUsd) === true;
    if (budgetExceededAtCompletion && !input.skipSummary) {
      summarySkipReason =
        "budget exceeded mid-run; summarizer skipped to avoid memory poisoning";
      input.logger.info("specialization.skipped", {
        agentId: input.agent.agentId,
        issueId: input.issue.id,
        reason: summarySkipReason,
      });
    }

    if (envelope) {
      input.agent.issuesHandled += 1;
      if (envelope.decision === "implement") input.agent.implementCount += 1;
      else if (envelope.decision === "pushback") input.agent.pushbackCount += 1;
      else input.agent.errorCount += 1;

      applyTagUpdate(input.agent, envelope);

      if (!input.skipSummary && !budgetExceededAtCompletion) {
        // Read current CLAUDE.md size for the marginal-cost transparency line
        // injected into the summarizer prompt (#179 Phase 1, option F). Surfaces
        // the empirical accuracy-degradation cost so the LLM can choose to skip
        // low-value lessons. Fail-soft: if the file is missing or unreadable, we
        // pass undefined and the prompt drops the line cleanly.
        const currentClaudeMdBytes = await fs
          .readFile(agentClaudeMdPath(input.agent.agentId), "utf-8")
          .then((s) => Buffer.byteLength(s, "utf-8"))
          .catch(() => undefined);

        // Failure-mode branch: agent emitted decision="error" — fire the
        // failure summarizer (different prompt, biased toward extracting a
        // lesson). Success/pushback paths stay on summarizeRun.
        const isAgentFailure = envelope.decision === "error";
        const summary: SummarizerOutput = isAgentFailure
          ? await summarizeFailureRun({
              agent: input.agent,
              issue: input.issue,
              envelope,
              errorReason: result.errorReason,
              toolUseTrace: result.toolUseTrace,
              finalText: result.finalText,
              logger: input.logger,
              currentClaudeMdBytes,
            })
          : await summarizeRun({
              agent: input.agent,
              issue: input.issue,
              envelope,
              toolUseTrace: result.toolUseTrace,
              finalText: result.finalText,
              logger: input.logger,
              currentClaudeMdBytes,
            });

        const outcomeTag = isAgentFailure ? "failure-lesson" : envelope.decision;
        const appendResult = await maybeAppendSummary({
          summary,
          agent: input.agent,
          issue: input.issue,
          runId: input.runId,
          outcome: outcomeTag,
          tags: envelope.memoryUpdate.addTags,
          targetRepoPath: input.targetRepoPath,
          logger: input.logger,
        });
        appendOutcome = appendResult.appendOutcome;
        summarySkipReason = appendResult.summarySkipReason;

        // Issue #178 (Phase 1 of #177): record utility-scoring signals for
        // the just-appended block. Fire-and-forget; never block the main
        // run path on a utility-scoring failure.
        if (appendOutcome?.kind === "appended") {
          await recordUtilityForAppend({
            agentId: input.agent.agentId,
            runId: input.runId,
            issueId: input.issue.id,
            heading: summary.heading ?? "",
            body: summary.body ?? "",
            tags: envelope.memoryUpdate.addTags,
            logger: input.logger,
            predictedUtility: summary.predictedUtility,
          });
        }

        // Sentinel expiry: after a successful implement run has been
        // recorded, walk the agent's CLAUDE.md and drop sentinels that
        // newer blocks have superseded. Per-kind policies cover
        // failure-lessons (K newer overlapping implements), success
        // implements (K newer Jaccard-≥-0.5 implements), and pushback
        // (preserved by default). Only fires after `implement` —
        // pushback / failure-lesson runs don't trigger expiry. Policies
        // are env-configurable via VP_DEV_{FAILURE,SUCCESS,PUSHBACK}_LESSON_EXPIRE_K.
        if (
          envelope.decision === "implement" &&
          appendOutcome?.kind === "appended"
        ) {
          try {
            const policies = resolveExpiryPolicies();
            const expired = await expireSentinels(
              input.agent.agentId,
              policies,
            );
            if (expired.kind === "expired") {
              input.logger.info("specialization.expired", {
                agentId: input.agent.agentId,
                issueId: input.issue.id,
                policies: policies.map((p) => ({
                  kind: p.kind,
                  k: Number.isFinite(p.k) ? p.k : "infinity",
                })),
                droppedCount: expired.dropped.length,
                droppedKinds: expired.dropped.map((h) => h.outcome),
                droppedIssues: expired.dropped.map((h) => h.issueId),
                totalBytes: expired.totalBytes,
              });
            }
          } catch (err) {
            input.logger.warn("specialization.expire_failed", {
              agentId: input.agent.agentId,
              issueId: input.issue.id,
              err: (err as Error).message,
            });
          }
        }
      }
    } else {
      input.agent.errorCount += 1;

      // No envelope — the SDK or the agent crashed before emitting one. Fire
      // the failure summarizer unless the cause is an infra flake (transport
      // error, GitHub 5xx, worktree creation fail) where there's no lesson,
      // or the run is being torn down for budget reasons (#86).
      if (!input.skipSummary && !budgetExceededAtCompletion) {
        if (isInfraFlake(result.errorReason)) {
          summarySkipReason = `infra flake skipped: ${result.errorReason}`;
          input.logger.info("specialization.skipped", {
            agentId: input.agent.agentId,
            issueId: input.issue.id,
            reason: summarySkipReason,
          });
        } else if (result.errorReason || result.parseError || result.finalText) {
          const currentClaudeMdBytes = await fs
            .readFile(agentClaudeMdPath(input.agent.agentId), "utf-8")
            .then((s) => Buffer.byteLength(s, "utf-8"))
            .catch(() => undefined);
          const summary = await summarizeFailureRun({
            agent: input.agent,
            issue: input.issue,
            errorReason: result.errorReason ?? result.parseError,
            toolUseTrace: result.toolUseTrace,
            finalText: result.finalText,
            logger: input.logger,
            currentClaudeMdBytes,
          });
          const appendResult = await maybeAppendSummary({
            summary,
            agent: input.agent,
            issue: input.issue,
            runId: input.runId,
            outcome: "failure-lesson",
            // No envelope this branch — fall back to the agent's current
            // tag fingerprint as the failure-lesson's topical signal.
            // Best-effort; expiry's tag-overlap check stays conservative.
            tags: input.agent.tags,
            targetRepoPath: input.targetRepoPath,
            logger: input.logger,
          });
          appendOutcome = appendResult.appendOutcome;
          summarySkipReason = appendResult.summarySkipReason;

          // Issue #178: record utility-scoring signals for failure-lesson
          // blocks too — they're attributable sections like any other.
          if (appendOutcome?.kind === "appended") {
            await recordUtilityForAppend({
              agentId: input.agent.agentId,
              runId: input.runId,
              issueId: input.issue.id,
              heading: summary.heading ?? "",
              body: summary.body ?? "",
              tags: input.agent.tags,
              logger: input.logger,
              predictedUtility: summary.predictedUtility,
            });
          }
        }
      }
    }

    // Issue #178: record pushback citation against existing sections
    // whose heading + tags overlap the agent's pushback reasoning. Runs
    // regardless of whether maybeAppendSummary appended — the signal is
    // about which prior rule the agent applied, not the new lesson.
    if (envelope?.decision === "pushback" && !input.skipSummary) {
      await recordUtilityForPushback({
        agentId: input.agent.agentId,
        runId: input.runId,
        issueId: input.issue.id,
        commentText: envelope.reason ?? "",
        tags: envelope.memoryUpdate.addTags,
        targetRepoPath: input.targetRepoPath,
        logger: input.logger,
      });
    }

    await mutateRegistry((reg) => {
      const persisted = ensureAgent(reg, input.agent.agentId);
      Object.assign(persisted, {
        tags: input.agent.tags,
        issuesHandled: input.agent.issuesHandled,
        implementCount: input.agent.implementCount,
        pushbackCount: input.agent.pushbackCount,
        errorCount: input.agent.errorCount,
        lastActiveAt: new Date().toISOString(),
      });
    });

    // Orchestrator-level safety net: when the run ended in a non-clean
    // exit (per `shouldPushPartial`) AND the agent did not finish with a
    // clean implement decision, push whatever's currently in the worktree
    // to a labeled `<branch>-incomplete-<runId>` ref so the partial work
    // isn't lost when `removeWorktree` deletes the local branch in the
    // finally below. The in-agent recovery pass (codingAgent.ts) attempts
    // the same first for `error_max_turns`, but can itself fail — this
    // is the deterministic backstop. Skipped in dry-run because remote
    // pushes are intercepted into echoes. See #88, broadened by #95.
    let partialBranchUrl: string | undefined;
    if (
      worktree &&
      shouldPushPartial(result) &&
      envelope?.decision !== "implement" &&
      !input.dryRun
    ) {
      const incompleteBranch = buildIncompleteBranchName(worktree.branch, input.runId);
      try {
        const pushResult = await pushPartialBranch({
          repoPath: input.targetRepoPath,
          worktreePath: worktree.path,
          worktreeBranch: worktree.branch,
          incompleteBranch,
          runId: input.runId,
          // The catch-all branch in `shouldPushPartial` (`isError && !envelope`)
          // can fire without a tagged subtype; pass a sentinel so the salvage
          // commit message stays human-readable rather than emitting
          // `errorSubtype=undefined`.
          errorSubtype: result.errorSubtype ?? "unknown",
          targetRepo: input.targetRepo,
          logger: input.logger,
          agentId: input.agent.agentId,
          issueId: input.issue.id,
        });
        if (pushResult.pushed) {
          partialBranchUrl = pushResult.branchUrl;
        } else {
          input.logger.info("worktree.partial_branch_skipped", {
            agentId: input.agent.agentId,
            issueId: input.issue.id,
            reason: pushResult.reason,
          });
        }
      } catch (err) {
        // Defensive: the helper already catches its own failures and returns
        // structured `reason`. If something throws anyway (e.g. an unexpected
        // type-error in the helper itself), surface as a warn and continue —
        // never block the main failure path on the safety net.
        input.logger.warn("worktree.partial_branch_unexpected_error", {
          agentId: input.agent.agentId,
          issueId: input.issue.id,
          err: (err as Error).message,
        });
      }
    }

    return {
      envelope,
      finalText: result.finalText,
      parseError: result.parseError,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
      isError: result.isError,
      errorReason: result.errorReason,
      errorSubtype: result.errorSubtype,
      appendOutcome,
      summarySkipReason,
      worktreePath: worktree?.path,
      branchName: worktree?.branch,
      reconciled: result.reconciled,
      branchUrl: result.branchUrl,
      partialBranchUrl,
    };
  } finally {
    if (worktree) {
      const isImplement = envelope?.decision === "implement";
      await removeWorktree({
        repoPath: input.targetRepoPath,
        worktree,
        deleteBranch: !isImplement,
      });
      try {
        await fs.rmdir(worktree.path);
      } catch {
        // ignore
      }
    }
  }
}

function applyTagUpdate(agent: AgentRecord, env: ResultEnvelope): void {
  const tags = new Set(agent.tags);
  for (const t of env.memoryUpdate.addTags) tags.add(t.toLowerCase());
  for (const t of env.memoryUpdate.removeTags ?? []) tags.delete(t.toLowerCase());
  if (tags.size === 0) tags.add("general");
  agent.tags = [...tags].sort();
}

interface AppendArgs {
  summary: SummarizerOutput;
  agent: AgentRecord;
  issue: IssueSummary;
  runId: string;
  outcome: string;
  /** Tags this issue contributed (envelope.memoryUpdate.addTags). */
  tags?: string[];
  targetRepoPath: string;
  logger: Logger;
}

async function maybeAppendSummary(args: AppendArgs): Promise<{
  appendOutcome?: AppendOutcome;
  summarySkipReason?: string;
}> {
  if (args.summary.skip || !args.summary.heading || !args.summary.body) {
    const summarySkipReason = args.summary.skipReason ?? "no body";
    args.logger.info("specialization.skipped", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      reason: summarySkipReason,
    });
    return { summarySkipReason };
  }

  // Dedup gate (#179 Phase 1, option G): if the candidate is a near-duplicate
  // of an existing section, skip the append and credit the matched section
  // via recordReinforcement instead. Fail-soft: read errors fall through to
  // the normal append path so a missing file never blocks lesson capture.
  try {
    const claudeMd = await fs
      .readFile(agentClaudeMdPath(args.agent.agentId), "utf-8")
      .catch(() => "");
    if (claudeMd) {
      const novelty = checkLessonNovelty({
        heading: args.summary.heading,
        body: args.summary.body,
        tags: args.tags,
        claudeMd,
      });
      if (novelty.kind === "duplicate") {
        args.logger.info("specialization.skipped_duplicate", {
          agentId: args.agent.agentId,
          issueId: args.issue.id,
          matchedStableIds: novelty.matchedStableIds,
          reason: "near-duplicate of existing section(s)",
        });
        // Credit the matched section(s) via reinforcement — the candidate
        // didn't add new bytes, but it DID re-validate the existing rule.
        await recordReinforcement({
          agentId: args.agent.agentId,
          runId: args.runId,
          citedSectionStableIds: novelty.matchedStableIds,
        }).catch((err) => {
          args.logger.warn("specialization.utility_record_failed", {
            agentId: args.agent.agentId,
            issueId: args.issue.id,
            err: (err as Error).message,
          });
        });
        return { summarySkipReason: "duplicate" };
      }
    }
  } catch (err) {
    args.logger.warn("specialization.dedup_check_failed", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      err: (err as Error).message,
    });
    // Fall through to the normal append path — dedup is advisory.
  }

  // Predicted-utility soft gate (#179 Phase 2 option B, half-ready-curve probe):
  // if the LLM emitted a `predictedUtility` value, compare it to the cost
  // score derived from `normalizedAccuracyFactor` at the post-append byte
  // size. Skip if utility < cost × ratio. Always log the decision so the
  // operator can analyze the (utility, cost, decision) distribution post-hoc.
  // Missing predictedUtility = no signal to act on; let through (back-compat
  // with summarizer responses pre-this-change).
  const currentBytesForGate = await fs
    .readFile(agentClaudeMdPath(args.agent.agentId), "utf-8")
    .then((s) => Buffer.byteLength(s, "utf-8"))
    .catch(() => 0);
  const utilityGate = evaluatePredictedUtilityGate({
    predictedUtility: args.summary.predictedUtility,
    agentId: args.agent.agentId,
    issueId: args.issue.id,
    headingLength: args.summary.heading.length,
    bodyLength: args.summary.body.length,
    currentClaudeMdBytes: currentBytesForGate,
    logger: args.logger,
  });
  if (utilityGate.kind === "skip") {
    return { summarySkipReason: utilityGate.reason };
  }

  const appendOutcome = await appendBlock({
    agentId: args.agent.agentId,
    runId: args.runId,
    issueId: args.issue.id,
    outcome: args.outcome,
    heading: args.summary.heading,
    body: args.summary.body,
    tags: args.tags,
    targetRepoPath: args.targetRepoPath,
  });
  if (appendOutcome.kind === "appended") {
    args.logger.info("specialization.appended", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      heading: args.summary.heading,
      outcome: args.outcome,
      bytesAppended: appendOutcome.bytesAppended,
      totalBytes: appendOutcome.totalBytes,
    });
    // Soft byte-budget warning (#200, option 1 scope). Fires when the
    // post-append size meets/exceeds the empirical p95 of the calibration
    // sample bytes. Observability only — no enforcement, no eviction. The
    // model-free p95 statistic was chosen over the issue's original
    // "elbow" framing because the validated K=13 fit (#179 / #203) is
    // linear-log and monotone (no inflection). Forced eviction is
    // deferred until a utility-signal correlation study lands per #200's
    // bake-window note.
    if (appendOutcome.totalBytes >= BYTE_BUDGET_WARNING_THRESHOLD) {
      args.logger.warn("specialization.budget_warning", {
        agentId: args.agent.agentId,
        issueId: args.issue.id,
        totalBytes: appendOutcome.totalBytes,
        threshold: BYTE_BUDGET_WARNING_THRESHOLD,
        overBy: appendOutcome.totalBytes - BYTE_BUDGET_WARNING_THRESHOLD,
        reason: "claude-md size at/above empirical p95 of calibration samples",
      });
    }
  } else {
    args.logger.warn("specialization.cap", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      totalBytes: appendOutcome.totalBytes,
    });
  }
  return { appendOutcome };
}

// Predicted-utility soft gate (#179 Phase 2 option B, half-ready-curve probe).
// Computes a cost score from `normalizedAccuracyFactor` at the post-append
// byte size and compares it to the LLM's self-rated `predictedUtility`.
// Skip = utility < cost × ratio. Missing utility = let through (no signal).
// Tunable via `VP_DEV_UTILITY_COST_RATIO` env var; default 1.0 means "utility
// just needs to match the cost score."

export const DEFAULT_UTILITY_COST_RATIO = 1.0;

export function resolveUtilityCostRatio(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VP_DEV_UTILITY_COST_RATIO;
  if (raw == null || raw === "") return DEFAULT_UTILITY_COST_RATIO;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_UTILITY_COST_RATIO;
  return n;
}

export interface UtilityGateInput {
  predictedUtility?: number;
  agentId: string;
  issueId: number;
  headingLength: number;
  bodyLength: number;
  /**
   * Current byte size of the agent's CLAUDE.md. Caller reads it once and
   * passes it in (mirrors the F-path's `currentClaudeMdBytes` plumbing).
   * Undefined or 0 = treat as fresh / empty file → costScore=0 → any
   * predictedUtility passes (no cost yet, gate is fully open).
   */
  currentClaudeMdBytes?: number;
  logger: Logger;
  /** Override env-resolved ratio for tests. */
  ratio?: number;
}

export type UtilityGateResult =
  | { kind: "let-through"; reason: "no-utility" | "utility-passes-gate" }
  | { kind: "skip"; reason: "low-predicted-utility" };

/**
 * Decide whether the candidate's `predictedUtility` justifies the byte cost
 * the lesson would add. Always logs the decision (with the computed cost
 * score and the threshold) so post-hoc analysis can read the distribution.
 *
 * The estimated added bytes uses the heading + body lengths plus a small
 * sentinel header allowance; it's a tighter forecast than the worst-case
 * upper bound used by `buildCostTransparencyLine`.
 *
 * Pure function (no I/O) so tests can exercise the gate logic directly.
 */
export function evaluatePredictedUtilityGate(
  input: UtilityGateInput,
): UtilityGateResult {
  if (input.predictedUtility === undefined) {
    input.logger.info("specialization.utility_gate", {
      agentId: input.agentId,
      issueId: input.issueId,
      decision: "let-through",
      reason: "no-utility",
    });
    return { kind: "let-through", reason: "no-utility" };
  }
  const currentBytes = input.currentClaudeMdBytes ?? 0;
  const sentinelOverhead = 200;
  const projectedBytes =
    currentBytes + input.headingLength + input.bodyLength + sentinelOverhead;
  // normalizedAccuracyFactor returns values in [1, 2] across the calibration
  // range, so subtracting 1 yields a 0-1 cost score directly.
  const factor = normalizedAccuracyFactor(projectedBytes);
  const costScore = Number.isFinite(factor)
    ? Math.max(0, Math.min(1, factor - 1))
    : 0;
  const ratio = input.ratio ?? resolveUtilityCostRatio();
  const threshold = costScore * ratio;
  const decision = input.predictedUtility >= threshold ? "let-through" : "skip";
  input.logger.info("specialization.utility_gate", {
    agentId: input.agentId,
    issueId: input.issueId,
    decision,
    predictedUtility: input.predictedUtility,
    costScore,
    threshold,
    ratio,
  });
  if (decision === "skip") return { kind: "skip", reason: "low-predicted-utility" };
  return { kind: "let-through", reason: "utility-passes-gate" };
}

// Issue #178 (Phase 1 of #177): per-section utility-scoring data collection.
// These helpers wrap the lessonUtility module in fail-soft try/catch so a
// utility-scoring write failure can never block the orchestrator's main path.

interface RecordUtilityForAppendArgs {
  agentId: string;
  runId: string;
  issueId: number;
  heading: string;
  body: string;
  tags?: string[];
  logger: Logger;
  /**
   * LLM self-rating from `SummarizerOutput.predictedUtility` (#179 Phase 2,
   * option B). Persisted via `recordIntroduction` so post-hoc analysis can
   * read it back. Optional for back-compat with summarizer responses
   * pre-this-change.
   */
  predictedUtility?: number;
}

async function recordUtilityForAppend(
  args: RecordUtilityForAppendArgs,
): Promise<void> {
  try {
    const ts = new Date().toISOString();
    await recordIntroduction({
      agentId: args.agentId,
      runId: args.runId,
      issueId: args.issueId,
      body: args.body,
      ts,
      predictedUtility: args.predictedUtility,
    });
    // Read the post-append CLAUDE.md and find which prior sections this
    // new block reinforces. Exclude the just-introduced block itself.
    const claudeMd = await fs
      .readFile(agentClaudeMdPath(args.agentId), "utf-8")
      .catch(() => "");
    if (!claudeMd) return;
    const selfStableId = deriveStableSectionId(args.runId, [args.issueId]);
    const cited = extractCitedStableIds({
      text: args.body,
      heading: args.heading,
      tags: args.tags,
      claudeMd,
      exclude: new Set([selfStableId]),
    });
    if (cited.length > 0) {
      await recordReinforcement({
        agentId: args.agentId,
        runId: args.runId,
        citedSectionStableIds: cited,
      });
      args.logger.info("specialization.utility_reinforced", {
        agentId: args.agentId,
        issueId: args.issueId,
        citedCount: cited.length,
      });
    }
  } catch (err) {
    args.logger.warn("specialization.utility_record_failed", {
      agentId: args.agentId,
      issueId: args.issueId,
      err: (err as Error).message,
    });
  }
}

interface RecordUtilityForPushbackArgs {
  agentId: string;
  runId: string;
  issueId: number;
  commentText: string;
  tags?: string[];
  targetRepoPath: string;
  logger: Logger;
}

async function recordUtilityForPushback(
  args: RecordUtilityForPushbackArgs,
): Promise<void> {
  try {
    const claudeMd = await fs
      .readFile(agentClaudeMdPath(args.agentId), "utf-8")
      .catch(() => "");
    if (!claudeMd) return;
    const cited = extractCitedStableIds({
      text: args.commentText,
      tags: args.tags,
      claudeMd,
    });
    if (cited.length > 0) {
      await recordPushback({
        agentId: args.agentId,
        runId: args.runId,
        citedSectionStableIds: cited,
      });
      args.logger.info("specialization.utility_pushback_recorded", {
        agentId: args.agentId,
        issueId: args.issueId,
        citedCount: cited.length,
      });
    }
  } catch (err) {
    args.logger.warn("specialization.utility_record_failed", {
      agentId: args.agentId,
      issueId: args.issueId,
      err: (err as Error).message,
    });
  }
}
