import {
  isRunComplete,
  markAborted,
  pendingIssueIds,
  saveRunState,
} from "../state/runState.js";
import { createAgent, mutateRegistry } from "../state/registry.js";
import { dispatch } from "./dispatcher.js";
import { jaccard } from "./routing.js";
import { forkClaudeMd } from "../agent/specialization.js";
import { runIssueCore } from "../agent/runIssueCore.js";
import {
  fetchOriginMain,
  resolveTargetRepoPath,
} from "../git/worktree.js";
import { postIssueComment } from "../github/gh.js";
import { composeFailurePostMortem } from "./failurePostMortem.js";
import type { Logger } from "../log/logger.js";
import type {
  AgentRecord,
  AgentRegistryFile,
  IssueSummary,
  RunIssueEntry,
  RunState,
} from "../types.js";
import type { RunCostTracker } from "../util/costTracker.js";

export interface OrchestratorInput {
  state: RunState;
  issues: IssueSummary[];
  parallelism: number;
  maxTicks: number;
  logger: Logger;
  dryRun: boolean;
  targetRepoPath?: string;
  /**
   * Per-run cost accumulator (issue #85 Phase 1 — measurement only).
   * Threaded down to the dispatcher (orchestrator-side `query()` cost)
   * and to each `runIssueCore` → `runCodingAgent` (issue-side cost).
   * Optional so the orchestrator can be exercised without one in tests.
   */
  costTracker?: RunCostTracker;
  /**
   * Per-run cost ceiling in USD (#86 Phase 2 — enforcement). Once
   * `costTracker.exceedsBudget(budgetUsd)` returns true, the orchestrator
   * stops dispatching new work, marks every remaining `pending` issue
   * `aborted-budget`, lets in-flight issues finish naturally, and drains.
   *
   * Optional: when undefined or when no `costTracker` was supplied, the
   * budget gate is a no-op and the run completes on the original
   * issues-exhausted condition.
   */
  budgetUsd?: number;
  /**
   * Issue #84: per-run agent override. When set, the named agent gets a
   * +1.0 score bump in both `pickAgents()` (summoning) and the
   * dispatcher's deterministic fallback (per-tick routing). Existence and
   * non-archived state are validated by the CLI before the gate; the
   * orchestrator trusts the validated string here.
   */
  preferAgentId?: string;
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
      maxParallelism: input.parallelism,
      state: input.state,
      pendingIssues: pending,
      targetRepoPath: repoPath,
      preferAgentId: input.preferAgentId,
    });

    const idleAgents = summonedAgents.filter(
      (a) => !isAgentInFlight(input.state, a.agentId),
    );

    const cap = Math.min(idleAgents.length, pending.length, input.parallelism - inFlight.size);

    if (cap > 0) {
      // Pin the preferred agent into the cap-limited idle slice so the
      // dispatcher can actually see it. With many idle agents and a small
      // cap, slicing the first N would otherwise drop the preferred agent
      // when it sorts past position N — silently negating the override.
      const idleSlice = sliceIdleWithPreferred({
        idle: idleAgents,
        cap,
        preferAgentId: input.preferAgentId,
      });
      const proposal = await dispatch({
        idleAgents: idleSlice,
        pendingIssues: pending,
        cap,
        logger: input.logger,
        costTracker: input.costTracker,
        preferAgentId: input.preferAgentId,
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
          costTracker: input.costTracker,
          budgetUsd: input.budgetUsd,
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

    // Per-run cost ceiling check (#86 Phase 2). Runs after every
    // Promise.race resolution so the gate engages at the earliest natural
    // sync point: as soon as one in-flight issue finishes and the loop
    // would otherwise schedule more work. Graceful shutdown: stop
    // dispatching, mark remaining `pending` issues `aborted-budget`, drop
    // out of the dispatch loop. The outer `Promise.allSettled` then drains
    // currently in-flight issues to their natural completion (no hard
    // kill, so partial PRs / git refs stay in valid states).
    if (
      input.budgetUsd !== undefined &&
      input.costTracker?.exceedsBudget(input.budgetUsd)
    ) {
      const total = input.costTracker.total();
      const stillPending = pendingIssueIds(input.state);
      input.logger.warn("run.budget_exceeded", {
        tick: input.state.tickCount,
        total,
        budget: input.budgetUsd,
        abortedIssueCount: stillPending.length,
        inFlightAtAbort: inFlight.size,
      });
      for (const id of stillPending) markAborted(input.state, id);
      await saveRunState(input.state);
      break;
    }
  }

  await Promise.allSettled(inFlight.values());
  await saveRunState(input.state);
}

export interface PickAgentsInput {
  reg: AgentRegistryFile;
  pendingIssues: IssueSummary[];
  /** User-authorized maximum: hard cap on team size. */
  maxParallelism: number;
  /**
   * Issue #84: per-run agent override. When set, the named agent's score
   * is bumped by `PREFER_AGENT_BUMP` so it lands first in pass 1
   * regardless of natural Jaccard overlap. Validation (existence,
   * non-archived) is the CLI's responsibility; the picker trusts the
   * string and silently no-ops when the id doesn't match a live agent.
   */
  preferAgentId?: string;
}

export interface PickedAgent {
  agent: AgentRecord;
  score: number;
  /** Why this agent was picked: matched a specialty, or fills a generalist seat. */
  rationale: "specialist" | "general" | "fresh-general";
  /**
   * True when this agent was force-picked via `--prefer-agent`. The setup
   * preview surfaces this with a `(preferred via --prefer-agent)`
   * annotation on the rationale line so the user sees the override took
   * effect. Does not influence routing — the bumped score already did.
   */
  preferred?: boolean;
}

/**
 * Bump applied to the preferred agent's score in `pickAgents()` and the
 * dispatcher's deterministic fallback. Jaccard caps at 1.0 and the
 * issuesHandled bonus is 0.05*log(...), so +1.0 is comfortably larger
 * than any natural tiebreak gap. Kept exported so the test files can
 * assert against the same constant.
 */
export const PREFER_AGENT_BUMP = 1.0;

export interface PickResult {
  reusedAgents: PickedAgent[];
  newAgentsToMint: number;
  /** Authorized cap (input.maxParallelism). Surfaced in the setup preview. */
  authorized: number;
  /** Derived team size: reusedAgents.length + newAgentsToMint, ≤ authorized. */
  planned: number;
  specialistCount: number;
  generalCount: number;
}

/** Pure scoring: no registry mutation, no file I/O. Reusable for setup preview + runtime. */
export function pickAgents(input: PickAgentsInput): PickResult {
  const cap = input.maxParallelism;
  const issueCount = input.pendingIssues.length;

  // Archived agents (post-split parents) are kept in the registry for
  // history but never summoned again — their work has been redistributed
  // to children.
  const live = input.reg.agents.filter((a) => !a.archived);
  // Score every agent against the issue set, then bucket by rationale.
  // The preferred agent (issue #84) gets a +PREFER_AGENT_BUMP nudge so it
  // sorts first regardless of natural overlap. We track the natural score
  // separately so a preferred agent with zero natural fit lands as
  // `general` in the rationale label rather than masquerading as a
  // specialist.
  const scored = live
    .map((a) => {
      const natural = agentSetScore(a, input.pendingIssues);
      const isPreferred =
        input.preferAgentId !== undefined && a.agentId === input.preferAgentId;
      return {
        agent: a,
        score: natural + (isPreferred ? PREFER_AGENT_BUMP : 0),
        naturalScore: natural,
        isPreferred,
      };
    })
    .sort(
      (p, q) =>
        q.score - p.score || cmpDateDesc(p.agent.lastActiveAt, q.agent.lastActiveAt),
    );

  const reused: PickedAgent[] = [];
  const takenIds = new Set<string>();

  // Pass 1 — pick specialists (positive score = some Jaccard overlap or a
  // recency bonus on a previously-used agent). Keep going until the cap is
  // hit OR we've covered enough issues that adding more agents has nothing
  // to chew on. The preferred agent always lands here because its bumped
  // score is > 0; if its natural score was 0 we tag the rationale as
  // `general` so the specialist/general counts on the gate text stay
  // honest.
  for (const s of scored) {
    if (reused.length >= cap) break;
    if (reused.length >= issueCount) break;
    if (s.score <= 0) break;
    const rationale: PickedAgent["rationale"] =
      s.isPreferred && s.naturalScore <= 0 ? "general" : "specialist";
    reused.push({
      agent: s.agent,
      score: s.score,
      rationale,
      ...(s.isPreferred ? { preferred: true } : {}),
    });
    takenIds.add(s.agent.agentId);
  }
  const specialistCount = reused.filter((r) => r.rationale === "specialist").length;
  // Snapshot of generals already on the roster from pass 1 (only ever
  // non-zero when the preferred agent had zero natural overlap and landed
  // labeled `general`). Pass 2's break condition counts pass-2 additions
  // only, so we don't double-count and short-circuit when a preferred
  // general was already seated.
  const passOneGenerals = reused.length - specialistCount;

  // Pass 2 — fill remaining seats with general agents from the registry,
  // bounded by issue count. Don't summon more than there are issues.
  const generalReserveTarget = Math.min(cap - reused.length, issueCount - reused.length);
  if (generalReserveTarget > 0) {
    for (const s of scored) {
      if (reused.length - specialistCount - passOneGenerals >= generalReserveTarget) break;
      if (takenIds.has(s.agent.agentId)) continue;
      reused.push({ agent: s.agent, score: s.score, rationale: "general" });
      takenIds.add(s.agent.agentId);
    }
  }
  const generalCount = reused.length - specialistCount;

  // Mint fresh agents only to fill remaining seats — capped by issue count
  // (a 10-issue cap with 3 issues + 0 registry agents → 3 fresh, not 10).
  const newAgentsToMint = Math.max(0, Math.min(cap, issueCount) - reused.length);

  const planned = reused.length + newAgentsToMint;
  return {
    reusedAgents: reused,
    newAgentsToMint,
    authorized: cap,
    planned,
    specialistCount,
    generalCount,
  };
}

async function summonAgents(opts: {
  maxParallelism: number;
  state: RunState;
  pendingIssues: IssueSummary[];
  targetRepoPath: string;
  preferAgentId?: string;
}): Promise<AgentRecord[]> {
  const minted: AgentRecord[] = [];

  const summoned = await mutateRegistry((reg) => {
    const pick = pickAgents({
      reg,
      pendingIssues: opts.pendingIssues,
      maxParallelism: opts.maxParallelism,
      preferAgentId: opts.preferAgentId,
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

/**
 * Issue #84: when the orchestrator's per-tick cap is smaller than the idle
 * roster, slice the first `cap` agents but guarantee the preferred agent
 * (if any) is included. Without this, a `--prefer-agent` whose natural
 * sort position lands past `cap` would be silently dropped before the
 * dispatcher even sees it. Order otherwise unchanged.
 */
export function sliceIdleWithPreferred(opts: {
  idle: AgentRecord[];
  cap: number;
  preferAgentId?: string;
}): AgentRecord[] {
  if (opts.cap >= opts.idle.length) return opts.idle.slice(0, opts.cap);
  const head = opts.idle.slice(0, opts.cap);
  if (!opts.preferAgentId) return head;
  if (head.some((a) => a.agentId === opts.preferAgentId)) return head;
  const preferred = opts.idle.find((a) => a.agentId === opts.preferAgentId);
  if (!preferred) return head;
  // Preferred agent missing from the head slice — drop the last entry
  // and append the preferred. Keeps `cap` invariant.
  return [...head.slice(0, opts.cap - 1), preferred];
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

export interface ComposeFailureInput {
  agentId: string;
  /** SDK error subtype (e.g. `error_max_turns`) — primary cause when present. */
  errorSubtype?: string;
  /** Free-form human reason from the SDK or thrown errors. */
  errorReason?: string;
  /** Envelope-parser symptom — secondary diagnostic only. */
  parseError?: string;
  /** Orphan-branch URL from the reconcile pass; appended to `error` when present. */
  branchUrl?: string;
}

/**
 * Compose a failed `RunIssueEntry` from a no-envelope agent result, applying
 * the cause-vs-symptom ordering required by issue #87.
 *
 * Priority for the primary `error` string:
 *   1. `errorSubtype` (machine-readable SDK cause — `error_max_turns`, etc.)
 *   2. `errorReason`  (free-form human reason)
 *   3. `parseError`   (envelope-parser symptom — only when SDK reported nothing)
 *   4. `"Unknown agent failure"` fallback
 *
 * `errorSubtype` and `parseError` are preserved as their own fields on the
 * entry so triage can distinguish "ran out of turns" from a genuine envelope
 * parser bug without parsing free-form strings out of `error`.
 *
 * Exported for unit testing — call site is the no-envelope branch of
 * `runOneIssue`.
 */
export function composeFailureEntry(input: ComposeFailureInput): RunIssueEntry {
  const baseError =
    input.errorSubtype ??
    input.errorReason ??
    input.parseError ??
    "Unknown agent failure";
  const error = input.branchUrl
    ? `${baseError} | orphan branch: ${input.branchUrl}`
    : baseError;
  return {
    status: "failed",
    agentId: input.agentId,
    outcome: "error",
    error,
    ...(input.errorSubtype ? { errorSubtype: input.errorSubtype } : {}),
    ...(input.parseError ? { parseError: input.parseError } : {}),
  };
}

async function runOneIssue(opts: {
  agent: AgentRecord;
  issue: IssueSummary;
  repoPath: string;
  dryRun: boolean;
  logger: Logger;
  state: RunState;
  costTracker?: RunCostTracker;
  budgetUsd?: number;
}): Promise<void> {
  const result = await runIssueCore({
    agent: opts.agent,
    issue: opts.issue,
    targetRepo: opts.state.targetRepo,
    targetRepoPath: opts.repoPath,
    runId: opts.state.runId,
    dryRun: opts.dryRun,
    logger: opts.logger,
    costTracker: opts.costTracker,
    budgetUsd: opts.budgetUsd,
  });

  // Track whether this run was a non-clean exit so the post-mortem comment
  // step below can fire after the run-state entry is settled. Two failure
  // shapes count: (a) no envelope at all, (b) envelope with decision="error".
  let nonCleanExit = false;

  if (result.envelope) {
    const env = result.envelope;
    opts.state.issues[String(opts.issue.id)] = {
      status: env.decision === "error" ? "failed" : "done",
      agentId: opts.agent.agentId,
      outcome: env.decision,
      prUrl: env.prUrl,
      commentUrl: env.commentUrl,
      partialBranchUrl: result.partialBranchUrl,
    };
    nonCleanExit = env.decision === "error";
  } else {
    // Reconciliation found a branch on remote without a PR — surface it in
    // the failure record so the user can salvage with one `gh pr create`
    // instead of grepping run logs for the orphan branch name. The partial
    // branch (issue #88) is a separate, labeled ref pushed by the safety
    // net; it lives in `partialBranchUrl` so post-run audits can find it
    // without parsing free-form `error` strings.
    const failure = composeFailureEntry({
      agentId: opts.agent.agentId,
      errorSubtype: result.errorSubtype,
      errorReason: result.errorReason,
      parseError: result.parseError,
      branchUrl: result.branchUrl,
    });
    opts.state.issues[String(opts.issue.id)] = {
      ...failure,
      partialBranchUrl: result.partialBranchUrl,
    };
    nonCleanExit = true;
  }

  const stateAgent = opts.state.agents.find((a) => a.agentId === opts.agent.agentId);
  if (stateAgent) stateAgent.status = "idle";
  await saveRunState(opts.state);

  // Issue #100: post a fail-fast post-mortem comment on the GitHub issue
  // after a non-clean exit. The triage gate on the next `vp-dev run` reads
  // this comment and skips re-dispatch until a human resolves the blocker
  // (or `--include-non-ready` overrides). Skipped in dry-run because gh
  // calls in dry-run runs are intercepted into echoes; failing to post
  // logs a warning but never aborts the run.
  if (nonCleanExit && !opts.dryRun) {
    const body = composeFailurePostMortem({
      runId: opts.state.runId,
      agentId: opts.agent.agentId,
      errorSubtype: result.errorSubtype,
      errorReason: result.errorReason,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      partialBranchUrl: result.partialBranchUrl,
    });
    try {
      await postIssueComment(opts.state.targetRepo, opts.issue.id, body);
      opts.logger.info("orchestrator.post_mortem_posted", {
        agentId: opts.agent.agentId,
        issueId: opts.issue.id,
        runId: opts.state.runId,
      });
    } catch (err) {
      opts.logger.warn("orchestrator.post_mortem_failed", {
        agentId: opts.agent.agentId,
        issueId: opts.issue.id,
        runId: opts.state.runId,
        err: (err as Error).message,
      });
    }
  }
}
