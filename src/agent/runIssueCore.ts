import { promises as fs } from "node:fs";
import { ensureAgent, mutateRegistry } from "../state/registry.js";
import { runCodingAgent } from "./codingAgent.js";
import {
  appendBlock,
  expireFailureLessons,
  forkClaudeMd,
  type AppendOutcome,
} from "./specialization.js";
import { isInfraFlake, summarizeFailureRun, summarizeRun, type SummarizerOutput } from "./summarizer.js";
import { resolveExpireK } from "../util/sentinels.js";
import {
  createWorktree,
  removeWorktree,
  type WorktreeHandle,
} from "../git/worktree.js";
import type { Logger } from "../log/logger.js";
import type { AgentRecord, IssueSummary, ResultEnvelope } from "../types.js";
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
}

export interface RunIssueCoreResult {
  envelope?: ResultEnvelope;
  finalText: string;
  parseError?: string;
  durationMs: number;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
  appendOutcome?: AppendOutcome;
  summarySkipReason?: string;
  worktreePath?: string;
  branchName?: string;
  /** See CodingAgentResult.reconciled. */
  reconciled?: string;
  /** See CodingAgentResult.branchUrl. */
  branchUrl?: string;
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
    });
    input.logger.info("agent.spawned", {
      agentId: input.agent.agentId,
      issueId: input.issue.id,
      worktree: worktree.path,
      branch: worktree.branch,
    });

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
    });

    envelope = result.envelope;
    let appendOutcome: AppendOutcome | undefined;
    let summarySkipReason: string | undefined;

    if (envelope) {
      input.agent.issuesHandled += 1;
      if (envelope.decision === "implement") input.agent.implementCount += 1;
      else if (envelope.decision === "pushback") input.agent.pushbackCount += 1;
      else input.agent.errorCount += 1;

      applyTagUpdate(input.agent, envelope);

      if (!input.skipSummary) {
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
            })
          : await summarizeRun({
              agent: input.agent,
              issue: input.issue,
              envelope,
              toolUseTrace: result.toolUseTrace,
              finalText: result.finalText,
              logger: input.logger,
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

        // Failure-lesson expiry: after a successful implement run has
        // been recorded, walk the agent's CLAUDE.md and drop any
        // failure-lesson sentinel that ≥ K subsequent implements with
        // overlapping tags have superseded. Only fires for implement —
        // pushback / failure-lesson runs don't trigger expiry. K is
        // env-configurable (`VP_DEV_FAILURE_LESSON_EXPIRE_K`, default 3).
        if (
          envelope.decision === "implement" &&
          appendOutcome?.kind === "appended"
        ) {
          try {
            const k = resolveExpireK();
            const expired = await expireFailureLessons(input.agent.agentId, k);
            if (expired.kind === "expired") {
              input.logger.info("specialization.expired", {
                agentId: input.agent.agentId,
                issueId: input.issue.id,
                k,
                droppedCount: expired.dropped.length,
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
      // error, GitHub 5xx, worktree creation fail) where there's no lesson.
      if (!input.skipSummary) {
        if (isInfraFlake(result.errorReason)) {
          summarySkipReason = `infra flake skipped: ${result.errorReason}`;
          input.logger.info("specialization.skipped", {
            agentId: input.agent.agentId,
            issueId: input.issue.id,
            reason: summarySkipReason,
          });
        } else if (result.errorReason || result.parseError || result.finalText) {
          const summary = await summarizeFailureRun({
            agent: input.agent,
            issue: input.issue,
            errorReason: result.errorReason ?? result.parseError,
            toolUseTrace: result.toolUseTrace,
            finalText: result.finalText,
            logger: input.logger,
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
        }
      }
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

    return {
      envelope,
      finalText: result.finalText,
      parseError: result.parseError,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
      isError: result.isError,
      errorReason: result.errorReason,
      appendOutcome,
      summarySkipReason,
      worktreePath: worktree?.path,
      branchName: worktree?.branch,
      reconciled: result.reconciled,
      branchUrl: result.branchUrl,
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
  } else {
    args.logger.warn("specialization.cap", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      totalBytes: appendOutcome.totalBytes,
    });
  }
  return { appendOutcome };
}
