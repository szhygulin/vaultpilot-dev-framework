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
import {
  composeFailurePostMortem,
  detectUniformHarnessFailure,
  type PendingPostMortem,
} from "./failurePostMortem.js";
import type { Logger } from "../log/logger.js";
import type {
  AgentRecord,
  AgentRegistryFile,
  IssueSummary,
  ResumeContext,
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
  /**
   * Issue #119 Phase 2: per-issue resume context, keyed by issue id.
   * Built upstream by the CLI from `findIncompleteBranchesOnOrigin`
   * results when `--resume-incomplete` is passed. The orchestrator looks
   * up each in-flight issue's entry and forwards it to `runIssueCore` so
   * `createWorktree` can branch off the salvage ref + the agent's seed
   * gets the "## Previous attempt (resumed)" section.
   *
   * Optional: undefined or empty means every issue dispatches from main
   * as before (no Phase 2 routing).
   */
  resumeContextByIssue?: Map<number, ResumeContext>;
  /**
   * Issue #142 (Phase 2 of #134): per-run flag forwarded to every
   * `runIssueCore` call so each coding agent's workflow prompt gets the
   * Step N+1 "Auto-file next phase" section rendered. Phase 1 (#141)
   * shipped the renderer + envelope schema; this orchestrator-level
   * field is the lifecycle wiring that makes the flag observable.
   * Optional: undefined / false preserves pre-#142 behavior (no Step
   * N+1 rendered, no follow-up issue filed).
   */
  autoPhaseFollowup?: boolean;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<void> {
  const repoPath = await resolveTargetRepoPath(input.state.targetRepo, input.targetRepoPath);
  // Pass `targetRepo` so `fetchOriginMain` can defensively re-add origin
  // if a prior replay-mode run left it stripped (issue #253).
  await fetchOriginMain(repoPath, input.state.targetRepo);

  const issuesById = new Map(input.issues.map((i) => [i.id, i]));

  const inFlight = new Map<string, Promise<void>>();

  // Issue #250: post-mortem comments are deferred until the run completes
  // so we can detect the uniform-harness-failure pattern (every dispatched
  // agent dying at the same SDK/orchestrator-boundary step before reaching
  // issue content) and suppress the fanout. Issue-side failures (mixed
  // subtypes, `error_max_turns` after real work, etc.) still get per-issue
  // comments via `flushPendingPostMortems` below.
  const pendingPostMortems: PendingPostMortem[] = [];

  // Persist the running USD total into RunState before each save so
  // `vp-dev status` (issue #131) can render the live cost-burn signal
  // off-disk without re-attaching to this process. The tracker's
  // `total()` is monotonic; a missing tracker leaves the field
  // undefined (matches the no-budget run shape).
  const persistCost = (): void => {
    if (input.costTracker) {
      input.state.costAccumulatedUsd = input.costTracker.total();
    }
  };

  while (!isRunComplete(input.state) && input.state.tickCount < input.maxTicks) {
    input.state.tickCount += 1;
    input.state.lastTickAt = new Date().toISOString();
    persistCost();
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
        persistCost();
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
          resumeContext: input.resumeContextByIssue?.get(issue.id),
          autoPhaseFollowup: input.autoPhaseFollowup,
          pendingPostMortems,
        }).catch(async (err) => {
          input.logger.error("agent.uncaught", {
            agentId: agent.agentId,
            issueId: issue.id,
            err: (err as Error).message,
          });
          markFailed(input.state, agent.agentId, issue.id, (err as Error).message);
          persistCost();
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
      persistCost();
      await saveRunState(input.state);
      break;
    }
  }

  await Promise.allSettled(inFlight.values());
  persistCost();
  await saveRunState(input.state);

  // Issue #250: post-mortem fanout decision made AFTER every dispatched
  // issue has settled. Run in dry-run mode is a no-op (matches the
  // pre-#250 inline-post behavior — gh calls are intercepted in dry-run).
  if (!input.dryRun) {
    await flushPendingPostMortems({
      pendings: pendingPostMortems,
      targetRepo: input.state.targetRepo,
      runId: input.state.runId,
      logger: input.logger,
    });
  }
}

/**
 * Issue #250: drain the deferred post-mortem queue at end-of-run.
 *
 * If `detectUniformHarnessFailure` returns `suppress: true` (every
 * dispatched issue failed with the same SDK/orchestrator-boundary cause
 * before reaching issue content), log a single
 * `orchestrator.post_mortem_fanout_suppressed` event and skip every
 * per-issue comment — operators read the run-state JSON / `vp-dev status`
 * block to diagnose harness-side causes, not N near-identical comments
 * fanned out across N unrelated issues.
 *
 * Otherwise post each pending comment in queue order. Individual post
 * failures log `orchestrator.post_mortem_failed` and never abort the
 * flush — matches the pre-#250 best-effort inline post.
 */
async function flushPendingPostMortems(opts: {
  pendings: ReadonlyArray<PendingPostMortem>;
  targetRepo: string;
  runId: string;
  logger: Logger;
}): Promise<void> {
  if (opts.pendings.length === 0) return;
  const verdict = detectUniformHarnessFailure(opts.pendings);
  if (verdict.suppress) {
    opts.logger.warn("orchestrator.post_mortem_fanout_suppressed", {
      runId: opts.runId,
      count: verdict.count,
      sharedSubtype: verdict.sharedSubtype,
      reason: verdict.reason,
      issueIds: opts.pendings.map((p) => p.issueId),
    });
    process.stderr.write(
      `Skipped post-mortem fanout: ${verdict.count} issues failed with shared subtype \`${verdict.sharedSubtype}\` ` +
        `before reaching issue context — see logs/${opts.runId}.jsonl for the harness-side cause.\n`,
    );
    return;
  }
  for (const p of opts.pendings) {
    const body = composeFailurePostMortem(p.input);
    try {
      await postIssueComment(opts.targetRepo, p.issueId, body);
      opts.logger.info("orchestrator.post_mortem_posted", {
        agentId: p.input.agentId,
        issueId: p.issueId,
        runId: opts.runId,
      });
    } catch (err) {
      opts.logger.warn("orchestrator.post_mortem_failed", {
        agentId: p.input.agentId,
        issueId: p.issueId,
        runId: opts.runId,
        err: (err as Error).message,
      });
    }
  }
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
  resumeContext?: ResumeContext;
  autoPhaseFollowup?: boolean;
  /**
   * Issue #250: per-run accumulator of post-mortem inputs. The orchestrator
   * decides at end-of-run whether to fan out (post N comments) or suppress
   * (uniform-harness pattern). `runOneIssue` only pushes; never reads.
   */
  pendingPostMortems: PendingPostMortem[];
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
    resumeContext: opts.resumeContext,
    autoPhaseFollowup: opts.autoPhaseFollowup,
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
      // Issue #141 (Phase 1 of #134): pass the auto-filed Phase N+1 issue
      // URL through to the run-state entry when the agent emitted one.
      // Inert today (no caller renders the workflow prompt's Step N+1 yet);
      // Phase 2 wires the CLI flag that flips `autoPhaseFollowup` on and
      // makes this assignment observable.
      nextPhaseIssueUrl: env.nextPhaseIssueUrl,
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

  // Issue #100: a fail-fast post-mortem comment is queued on every
  // non-clean exit so the triage gate on the next `vp-dev run` skips
  // re-dispatch until a human resolves the blocker (or
  // `--include-non-ready` overrides).
  //
  // Issue #250: the queue is drained at end-of-run by
  // `flushPendingPostMortems`. If every dispatched issue failed at the
  // same SDK/orchestrator-boundary step before reaching issue content
  // (uniform-harness pattern), the entire fanout is suppressed and the
  // operator reads the run-state JSON / `vp-dev status` block instead of
  // having N issues spammed with environmental-hiccup comments.
  if (nonCleanExit) {
    opts.pendingPostMortems.push({
      issueId: opts.issue.id,
      input: {
        runId: opts.state.runId,
        agentId: opts.agent.agentId,
        errorSubtype: result.errorSubtype,
        errorReason: result.errorReason,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        partialBranchUrl: result.partialBranchUrl,
      },
    });
  }
}
