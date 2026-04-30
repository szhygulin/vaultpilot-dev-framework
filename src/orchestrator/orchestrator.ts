import { promises as fs } from "node:fs";
import {
  isRunComplete,
  pendingIssueIds,
  saveRunState,
} from "../state/runState.js";
import { loadRegistry, saveRegistry, createAgent, ensureAgent, mutateRegistry } from "../state/registry.js";
import { dispatch } from "./dispatcher.js";
import { runCodingAgent } from "../agent/codingAgent.js";
import { applyMemoryUpdate } from "../memory/tagger.js";
import {
  createWorktree,
  fetchOriginMain,
  removeWorktree,
  targetRepoPath,
  type WorktreeHandle,
} from "../git/worktree.js";
import type { Logger } from "../log/logger.js";
import type { AgentRecord, IssueSummary, RunState } from "../types.js";

export interface OrchestratorInput {
  state: RunState;
  issues: IssueSummary[];
  parallelism: number;
  maxTicks: number;
  logger: Logger;
  dryRun: boolean;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<void> {
  const repoPath = await targetRepoPath(input.state.targetRepo);
  await fetchOriginMain(repoPath);

  const issuesById = new Map(input.issues.map((i) => [i.id, i]));

  const inFlight = new Map<string, Promise<void>>();

  while (!isRunComplete(input.state) && input.state.tickCount < input.maxTicks) {
    input.state.tickCount += 1;
    input.state.lastTickAt = new Date().toISOString();
    await saveRunState(input.state);

    const reg = await loadRegistry();
    const idleAgents = await ensureIdleAgents({
      desiredParallelism: input.parallelism,
      state: input.state,
      reg,
    });
    await saveRegistry(reg);
    await saveRunState(input.state);

    const pending = pendingIssueIds(input.state)
      .map((id) => issuesById.get(id))
      .filter((i): i is IssueSummary => i !== undefined);

    const cap = Math.min(idleAgents.length, pending.length, input.parallelism - inFlight.size);

    if (cap > 0) {
      const proposal = await dispatch({
        idleAgents: idleAgents.slice(0, cap),
        pendingIssues: pending,
        cap,
        logger: input.logger,
      });
      input.logger.info("tick.proposal", {
        tick: input.state.tickCount,
        source: proposal.source,
        assignments: proposal.assignments,
      });

      for (const assignment of proposal.assignments) {
        const agent = ensureAgent(reg, assignment.agentId);
        const issue = issuesById.get(assignment.issueId);
        if (!issue) continue;

        markInFlight(input.state, agent.agentId, assignment.issueId);
        await saveRunState(input.state);

        const promise = runOneIssue({
          agent,
          issue,
          repoPath,
          dryRun: input.dryRun,
          logger: input.logger,
          state: input.state,
        }).catch(async (err) => {
          input.logger.error("agent.uncaught", {
            agentId: agent.agentId,
            issueId: issue.id,
            err: (err as Error).message,
          });
          markFailed(input.state, agent.agentId, issue.id, (err as Error).message);
          await saveRunState(input.state);
        }).finally(() => {
          inFlight.delete(`${agent.agentId}:${issue.id}`);
        });
        inFlight.set(`${agent.agentId}:${issue.id}`, promise);
      }
      await saveRegistry(reg);
    }

    if (inFlight.size === 0) {
      // No work was scheduled and nothing is running — break to avoid infinite tick loop.
      input.logger.warn("orchestrator.no_progress", {
        tick: input.state.tickCount,
        pending: pendingIssueIds(input.state).length,
      });
      break;
    }
    await Promise.race(inFlight.values());
  }

  await Promise.allSettled(inFlight.values());
  await saveRunState(input.state);
}

async function ensureIdleAgents(opts: {
  desiredParallelism: number;
  state: RunState;
  reg: Awaited<ReturnType<typeof loadRegistry>>;
}): Promise<AgentRecord[]> {
  const inFlightAgents = new Set(
    opts.state.agents.filter((a) => a.status === "in-flight").map((a) => a.agentId),
  );

  // Lazily create agents up to parallelism cap.
  const knownIds = new Set(opts.reg.agents.map((a) => a.agentId));
  for (const a of opts.state.agents) knownIds.add(a.agentId);
  while (knownIds.size < opts.desiredParallelism) {
    const fresh = createAgent(opts.reg);
    knownIds.add(fresh.agentId);
    if (!opts.state.agents.some((a) => a.agentId === fresh.agentId)) {
      opts.state.agents.push({ agentId: fresh.agentId, status: "idle" });
    }
  }

  return opts.reg.agents.filter((a) => !inFlightAgents.has(a.agentId));
}

function markInFlight(state: RunState, agentId: string, issueId: number): void {
  state.issues[String(issueId)] = { status: "in-flight", agentId };
  let entry = state.agents.find((a) => a.agentId === agentId);
  if (!entry) {
    entry = { agentId, status: "in-flight" };
    state.agents.push(entry);
  } else {
    entry.status = "in-flight";
  }
}

function markFailed(state: RunState, agentId: string, issueId: number, reason: string): void {
  state.issues[String(issueId)] = {
    status: "failed",
    agentId,
    outcome: "error",
    error: reason,
  };
  const a = state.agents.find((x) => x.agentId === agentId);
  if (a) a.status = "idle";
}

async function runOneIssue(opts: {
  agent: AgentRecord;
  issue: IssueSummary;
  repoPath: string;
  dryRun: boolean;
  logger: Logger;
  state: RunState;
}): Promise<void> {
  let worktree: WorktreeHandle | null = null;
  try {
    worktree = await createWorktree({
      repoPath: opts.repoPath,
      agentId: opts.agent.agentId,
      issueId: opts.issue.id,
    });
    opts.logger.info("agent.spawned", {
      agentId: opts.agent.agentId,
      issueId: opts.issue.id,
      worktree: worktree.path,
      branch: worktree.branch,
    });

    const result = await runCodingAgent({
      agent: opts.agent,
      issueId: opts.issue.id,
      targetRepo: opts.state.targetRepo,
      worktreePath: worktree.path,
      branchName: worktree.branch,
      dryRun: opts.dryRun,
      logger: opts.logger,
    });

    if (result.envelope) {
      const env = result.envelope;
      opts.agent.issuesHandled += 1;
      if (env.decision === "implement") opts.agent.implementCount += 1;
      else if (env.decision === "pushback") opts.agent.pushbackCount += 1;
      else opts.agent.errorCount += 1;

      await applyMemoryUpdate({
        agent: opts.agent,
        envelope: env,
        issueId: opts.issue.id,
      });
      opts.logger.info("memory.updated", {
        agentId: opts.agent.agentId,
        issueId: opts.issue.id,
        addTags: env.memoryUpdate.addTags,
        finding: env.memoryUpdate.findingTitle ?? null,
      });

      opts.state.issues[String(opts.issue.id)] = {
        status: env.decision === "error" ? "failed" : "done",
        agentId: opts.agent.agentId,
        outcome: env.decision,
        prUrl: env.prUrl,
        commentUrl: env.commentUrl,
      };
    } else {
      opts.agent.errorCount += 1;
      opts.state.issues[String(opts.issue.id)] = {
        status: "failed",
        agentId: opts.agent.agentId,
        outcome: "error",
        error: result.parseError ?? result.errorReason ?? "Unknown agent failure",
      };
    }

    await mutateRegistry((reg) => {
      const persisted = ensureAgent(reg, opts.agent.agentId);
      Object.assign(persisted, {
        tags: opts.agent.tags,
        issuesHandled: opts.agent.issuesHandled,
        implementCount: opts.agent.implementCount,
        pushbackCount: opts.agent.pushbackCount,
        errorCount: opts.agent.errorCount,
        lastActiveAt: new Date().toISOString(),
      });
    });

    const stateAgent = opts.state.agents.find((a) => a.agentId === opts.agent.agentId);
    if (stateAgent) stateAgent.status = "idle";
    await saveRunState(opts.state);
  } finally {
    if (worktree) {
      const isImplement = opts.state.issues[String(opts.issue.id)]?.outcome === "implement";
      // For pushback / error / no-envelope we delete the local branch (no remote tracking).
      // For implement we keep the branch so the user can inspect or push if dry-run.
      await removeWorktree({
        repoPath: opts.repoPath,
        worktree,
        deleteBranch: !isImplement,
      });
      // Best-effort cleanup of an empty worktree dir.
      try {
        await fs.rmdir(worktree.path);
      } catch {
        // ignore
      }
    }
  }
}
