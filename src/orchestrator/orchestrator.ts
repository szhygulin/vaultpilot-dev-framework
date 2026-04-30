import { promises as fs } from "node:fs";
import {
  isRunComplete,
  pendingIssueIds,
  saveRunState,
} from "../state/runState.js";
import { createAgent, ensureAgent, mutateRegistry } from "../state/registry.js";
import { dispatch } from "./dispatcher.js";
import { runCodingAgent } from "../agent/codingAgent.js";
import { jaccard } from "./routing.js";
import { appendBlock, forkClaudeMd } from "../agent/specialization.js";
import { summarizeRun } from "../agent/summarizer.js";
import {
  createWorktree,
  fetchOriginMain,
  removeWorktree,
  resolveTargetRepoPath,
  type WorktreeHandle,
} from "../git/worktree.js";
import type { Logger } from "../log/logger.js";
import type {
  AgentRecord,
  AgentRegistryFile,
  IssueSummary,
  ResultEnvelope,
  RunState,
} from "../types.js";

export interface OrchestratorInput {
  state: RunState;
  issues: IssueSummary[];
  parallelism: number;
  maxTicks: number;
  logger: Logger;
  dryRun: boolean;
  targetRepoPath?: string;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<void> {
  const repoPath = await resolveTargetRepoPath(input.state.targetRepo, input.targetRepoPath);
  await fetchOriginMain(repoPath);

  const issuesById = new Map(input.issues.map((i) => [i.id, i]));

  const inFlight = new Map<string, Promise<void>>();

  while (!isRunComplete(input.state) && input.state.tickCount < input.maxTicks) {
    input.state.tickCount += 1;
    input.state.lastTickAt = new Date().toISOString();
    await saveRunState(input.state);

    const pending = pendingIssueIds(input.state)
      .map((id) => issuesById.get(id))
      .filter((i): i is IssueSummary => i !== undefined);

    const summonedAgents = await summonAgents({
      desiredParallelism: input.parallelism,
      state: input.state,
      pendingIssues: pending,
      targetRepoPath: repoPath,
    });

    const idleAgents = summonedAgents.filter(
      (a) => !isAgentInFlight(input.state, a.agentId),
    );

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
        summonedAgentIds: summonedAgents.map((a) => a.agentId),
      });

      for (const assignment of proposal.assignments) {
        const agent = summonedAgents.find((a) => a.agentId === assignment.agentId);
        const issue = issuesById.get(assignment.issueId);
        if (!agent || !issue) continue;

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
    }

    if (inFlight.size === 0) {
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

export interface PickAgentsInput {
  reg: AgentRegistryFile;
  pendingIssues: IssueSummary[];
  desiredParallelism: number;
}

export interface PickedAgent {
  agent: AgentRecord;
  score: number;
}

export interface PickResult {
  reusedAgents: PickedAgent[];
  newAgentsToMint: number;
}

/** Pure scoring: no registry mutation, no file I/O. Reusable for setup preview + runtime. */
export function pickAgents(input: PickAgentsInput): PickResult {
  const scored = input.reg.agents
    .map((a) => ({ agent: a, score: agentSetScore(a, input.pendingIssues) }))
    .sort(
      (p, q) =>
        q.score - p.score || cmpDateDesc(p.agent.lastActiveAt, q.agent.lastActiveAt),
    );

  const reused: PickedAgent[] = [];
  const takenIds = new Set<string>();

  for (const s of scored) {
    if (reused.length >= input.desiredParallelism) break;
    if (s.score <= 0) break;
    reused.push(s);
    takenIds.add(s.agent.agentId);
  }
  if (reused.length < input.desiredParallelism) {
    for (const s of scored) {
      if (reused.length >= input.desiredParallelism) break;
      if (takenIds.has(s.agent.agentId)) continue;
      reused.push(s);
      takenIds.add(s.agent.agentId);
    }
  }

  const newAgentsToMint = Math.max(0, input.desiredParallelism - reused.length);
  return { reusedAgents: reused, newAgentsToMint };
}

async function summonAgents(opts: {
  desiredParallelism: number;
  state: RunState;
  pendingIssues: IssueSummary[];
  targetRepoPath: string;
}): Promise<AgentRecord[]> {
  const minted: AgentRecord[] = [];

  const summoned = await mutateRegistry((reg) => {
    const pick = pickAgents({
      reg,
      pendingIssues: opts.pendingIssues,
      desiredParallelism: opts.desiredParallelism,
    });
    const taken: AgentRecord[] = pick.reusedAgents.map((p) => p.agent);

    for (let i = 0; i < pick.newAgentsToMint; i++) {
      const fresh = createAgent(reg);
      taken.push(fresh);
      minted.push(fresh);
    }

    for (const a of taken) {
      if (!opts.state.agents.some((s) => s.agentId === a.agentId)) {
        opts.state.agents.push({ agentId: a.agentId, status: "idle" });
      }
    }
    return taken;
  });

  for (const m of minted) {
    await forkClaudeMd(m.agentId, opts.targetRepoPath);
  }
  return summoned;
}

function agentSetScore(agent: AgentRecord, issues: IssueSummary[]): number {
  if (issues.length === 0) return 0;
  let best = 0;
  for (const i of issues) {
    const s = jaccard(agent.tags, i.labels) + 0.05 * Math.log(1 + agent.issuesHandled);
    if (s > best) best = s;
  }
  return best;
}

function cmpDateDesc(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

function isAgentInFlight(state: RunState, agentId: string): boolean {
  return state.agents.some((a) => a.agentId === agentId && a.status === "in-flight");
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
    await forkClaudeMd(opts.agent.agentId, opts.repoPath);

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
      targetRepoPath: opts.repoPath,
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

      applyTagUpdate(opts.agent, env);

      opts.state.issues[String(opts.issue.id)] = {
        status: env.decision === "error" ? "failed" : "done",
        agentId: opts.agent.agentId,
        outcome: env.decision,
        prUrl: env.prUrl,
        commentUrl: env.commentUrl,
      };

      const summary = await summarizeRun({
        agent: opts.agent,
        issue: opts.issue,
        envelope: env,
        toolUseTrace: result.toolUseTrace,
        finalText: result.finalText,
        logger: opts.logger,
      });

      if (summary.skip || !summary.heading || !summary.body) {
        opts.logger.info("specialization.skipped", {
          agentId: opts.agent.agentId,
          issueId: opts.issue.id,
          reason: summary.skipReason ?? "no body",
        });
      } else {
        const outcome = await appendBlock({
          agentId: opts.agent.agentId,
          runId: opts.state.runId,
          issueId: opts.issue.id,
          outcome: env.decision,
          heading: summary.heading,
          body: summary.body,
          targetRepoPath: opts.repoPath,
        });
        if (outcome.kind === "appended") {
          opts.logger.info("specialization.appended", {
            agentId: opts.agent.agentId,
            issueId: opts.issue.id,
            heading: summary.heading,
            bytesAppended: outcome.bytesAppended,
            totalBytes: outcome.totalBytes,
          });
        } else {
          opts.logger.warn("specialization.cap", {
            agentId: opts.agent.agentId,
            issueId: opts.issue.id,
            totalBytes: outcome.totalBytes,
          });
        }
      }
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
      await removeWorktree({
        repoPath: opts.repoPath,
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
