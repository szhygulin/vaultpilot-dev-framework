import { isTwoPhaseRoutingEnabled, SPECIALIST_THRESHOLD } from "./routing.js";
import {
  readAgentClaudeMd,
  readSeedClaudeMd,
} from "../agent/specialization.js";
import { stripOverlappingSections } from "../agent/prompt.js";
import type { AgentRecord, IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";

export interface TickPromptInput {
  pendingIssues: IssueSummary[];
  idleAgents: AgentRecord[];
  cap: number;
  errorsFromPrior?: string[];
  /** Issue #84: per-run agent override. When the preferred agent is in
   *  the idle set, the prompt instructs the LLM to assign it first; the
   *  validator enforces this and the deterministic fallback honors it on
   *  failure. */
  preferAgentId?: string;
  /**
   * Path to the target repo's checkout. Used to read the project CLAUDE.md
   * once and dedupe each per-agent CLAUDE.md against it (same logic
   * `buildAgentSystemPrompt` uses for live-load). Without this, every
   * agent block would re-ship the target-repo seed.
   */
  targetRepoPath: string;
  /**
   * Optional logger. When set, the prompt builder warn-logs which agents
   * had their CLAUDE.md prose dropped under the byte-budget guard so
   * post-hoc audits can see what the LLM actually saw.
   */
  logger?: Logger;
  /**
   * Test-only override of the soft byte budget. Production callers leave
   * this unset; tests use a small value to exercise the truncation path.
   */
  byteBudgetOverride?: number;
}

/**
 * Issue #268: split prompt into a cache-stable prefix and a volatile
 * suffix. The prefix carries the routing rule + per-agent CLAUDE.md prose
 * (changes only when the summarizer fires after a successful run); the
 * suffix carries pending issues, cap, prior-attempt errors, and the
 * --prefer-agent override. Wiring this through `query({ systemPrompt:
 * [prefix, SYSTEM_PROMPT_DYNAMIC_BOUNDARY], prompt: suffix, ... })` makes
 * the prefix eligible for Anthropic prompt-cache hits across:
 *
 *  - Validation-retry within a single dispatch (errors-only delta).
 *  - Cross-tick within a run when the idle agent set is unchanged.
 *
 * The 5-min cache TTL means the typical sub-minute tick spacing wins
 * back ~90% of cache-stable input cost on hit.
 */
export interface TickPromptParts {
  /**
   * The cache-stable prefix. Identical between consecutive calls when
   * idle agents and cap are stable, even if pending issues / errors /
   * prefer-agent change.
   */
  cacheStablePrefix: string;
  /**
   * The volatile suffix. Always rebuilt; carries pending-issue list,
   * --prefer-agent override, prior-attempt error block, and the
   * JSON-shape directive.
   */
  volatileSuffix: string;
}

/**
 * Soft cap on assembled prompt byte size. ~2.5 MB ≈ 700K tokens at the
 * ~3.5 chars/token rule of thumb — comfortably under Opus 4.7's 1M-context
 * window even after orchestrator-side framing overhead. When the assembled
 * prose exceeds this, agents are dropped (full prose → tags-only fallback)
 * in least-recently-active order until the rest fits. The dropped agents
 * remain dispatchable; they just give the LLM less prose to reason from.
 * The deterministic fallback in `routing.ts` still works against the full
 * set if the LLM under-dispatches.
 */
export const PROMPT_BYTE_BUDGET = 2_500_000;

/**
 * Per-issue body cap. Mirrors `truncate(detail.body, 6000)` at
 * `src/orchestrator/triage.ts:280` — that's the load-bearing shape for
 * issue bodies elsewhere in the orchestrator and the routing signal
 * almost always lives in the first 6000 characters (issue title + first
 * paragraph + scope notes).
 */
const ISSUE_BODY_MAX_CHARS = 6000;

export async function buildTickPrompt(input: TickPromptInput): Promise<TickPromptParts> {
  const seed = await readSeedClaudeMd(input.targetRepoPath);
  const fullProseBlocks = await Promise.all(
    input.idleAgents.map((agent) => renderAgentBlock(agent, input.targetRepoPath, seed)),
  );

  const issueBlocks = input.pendingIssues.map((issue) => renderIssueBlock(issue));

  const budget = input.byteBudgetOverride ?? PROMPT_BYTE_BUDGET;
  const issueBytes = issueBlocks.reduce((n, s) => n + s.length, 0);
  // Reserve ~50 KB for routing-rule prose, error block, JSON shape, headings.
  const agentBudget = Math.max(0, budget - issueBytes - 50_000);

  // Most-recently-active agents win full prose; oldest get a tags-only
  // fallback. Keeps the most-current specialization visible to the LLM
  // when many agents compete for limited budget.
  const orderedByActive = input.idleAgents
    .map((agent, idx) => ({ agent, idx, fullBlock: fullProseBlocks[idx] }))
    .sort((a, b) => Date.parse(b.agent.lastActiveAt) - Date.parse(a.agent.lastActiveAt));

  let used = 0;
  const droppedAgentIds: string[] = [];
  const renderedBlocks: string[] = new Array(input.idleAgents.length);
  for (const entry of orderedByActive) {
    if (used + entry.fullBlock.length <= agentBudget) {
      renderedBlocks[entry.idx] = entry.fullBlock;
      used += entry.fullBlock.length;
    } else {
      const fallback = renderAgentTagFallback(entry.agent);
      renderedBlocks[entry.idx] = fallback;
      used += fallback.length;
      droppedAgentIds.push(entry.agent.agentId);
    }
  }
  if (droppedAgentIds.length > 0) {
    input.logger?.warn("dispatcher.prompt_budget", {
      droppedFullProseAgentIds: droppedAgentIds,
      assembledAgentBytes: used,
      agentBudget,
    });
  }

  const errorBlock = input.errorsFromPrior?.length
    ? `\n\nYour PRIOR proposal failed validation. Fix these and re-emit:\n${input.errorsFromPrior.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  // Hard override: if the preferred agent is currently idle, the proposal
  // MUST include it. The validator enforces the same; surfacing it here
  // shortcuts the retry round-trip.
  const preferredIsIdle =
    input.preferAgentId !== undefined &&
    input.idleAgents.some((a) => a.agentId === input.preferAgentId);
  const preferBlock = preferredIsIdle
    ? `\n\nOVERRIDE: the run was launched with --prefer-agent ${input.preferAgentId}. Assign that agent to one of the pending issues — natural fit does not matter. Picking any other assignment for ${input.preferAgentId} when it is idle will fail validation.`
    : "";

  // Issue #268: routing rule rewritten to be cap-agnostic (cap appears
  // only in the volatile suffix). Cap text moved to the suffix means the
  // prefix stays byte-identical across ticks even when cap shrinks (e.g.
  // an agent goes busy mid-run), which preserves cross-tick cache hits.
  const routingRule = isTwoPhaseRoutingEnabled()
    ? `Routing rule (two-phase, prose-aware):
- Phase A — specialists first. For each issue, read each agent's CLAUDE.md sections and pick the agent whose past lessons, past-incident citations, and accumulated domain coverage best match the issue body. Tags (Jaccard >= ${SPECIALIST_THRESHOLD}) are a sanity check; PROSE BEATS TAGS — an agent whose CLAUDE.md describes "glibc-vs-musl SDK loader" is a stronger fit for a glibc preflight issue than one merely tagged \`linux\`.
- Phase B — fall back to a general agent (tags include "general", <=3 tags total, OR whose CLAUDE.md is mostly the seed with little accumulated specialization). Generals pick up issues with no clear specialist match.
- Each agent gets at most ONE issue per tick. Each issue is assigned to at most ONE agent.
- The cap on assignments per tick is provided in the pending-issues block below. Leaving slots empty is acceptable when no specialist OR general agent fits. If a specialist OR general agent IS available for an unmatched issue, you must assign it.`
    : `Routing rule (prose-aware):
- For each issue, read each agent's CLAUDE.md sections and pick the agent whose past lessons, past-incident citations, and accumulated domain coverage best match the issue body. Tags are a sanity check; PROSE BEATS TAGS.
- Brand-new general agents (mostly the seed CLAUDE.md, few accumulated sections) should pick up issues with no obvious specialist match.
- Each agent gets at most ONE issue per tick. Each issue is assigned to at most ONE agent.
- The cap on assignments per tick is provided in the pending-issues block below. Aim to fill the cap — empty slots waste parallelism. If the prose match is weak, still assign — even a weak prose match beats waiting another tick.`;

  // Cache-stable prefix: preamble + routing rule + idle-agent prose.
  // Identical across the validation-retry round-trip and across ticks
  // when the idle agent set is unchanged.
  const cacheStablePrefix = `You are the dispatcher for vp-dev. You assign idle agents to pending issues for ONE scheduling tick. Decide based on the prose below — each agent's accumulated CLAUDE.md sections reveal real expertise far more accurately than a tag list.

${routingRule}

# Idle agents (${input.idleAgents.length})

${renderedBlocks.join("\n\n")}`;

  // Volatile suffix: pending issues, cap, prefer-agent override, prior
  // errors, output format directive. Rebuilt every call.
  const capDirective = isTwoPhaseRoutingEnabled()
    ? `Emit AT MOST ${input.cap} assignment${input.cap === 1 ? "" : "s"}.`
    : `Emit EXACTLY ${input.cap} assignment${input.cap === 1 ? "" : "s"}.`;

  const volatileSuffix = `# Pending issues (${input.pendingIssues.length}, cap=${input.cap})

${issueBlocks.join("\n\n")}

${capDirective}${preferBlock}${errorBlock}

Output ONLY valid JSON in this exact shape, no prose, no markdown:
{"assignments":[{"agentId":"<id>","issueId":<number>}, ...]}`;

  return { cacheStablePrefix, volatileSuffix };
}

async function renderAgentBlock(
  agent: AgentRecord,
  targetRepoPath: string,
  seed: string,
): Promise<string> {
  const rawClaudeMd = await readAgentClaudeMd(agent.agentId, targetRepoPath);
  const deduped = stripOverlappingSections(rawClaudeMd, seed).trim();
  const label = agent.name ? `${agent.name} [${agent.agentId}]` : agent.agentId;
  const meta = [
    `Tags: ${agent.tags.length === 0 ? "(none)" : agent.tags.join(", ")}`,
    `Issues handled: ${agent.issuesHandled}`,
    `Last active: ${agent.lastActiveAt}`,
  ].join("\n");
  const prose =
    deduped.length > 0
      ? deduped
      : "(no agent-specific sections beyond the target-repo seed — generalist)";
  return `## Agent ${label}\n${meta}\n\n${prose}`;
}

function renderAgentTagFallback(agent: AgentRecord): string {
  const label = agent.name ? `${agent.name} [${agent.agentId}]` : agent.agentId;
  const tags = agent.tags.length === 0 ? "(none)" : agent.tags.join(", ");
  return `## Agent ${label}\nTags: ${tags}\nIssues handled: ${agent.issuesHandled}\nLast active: ${agent.lastActiveAt}\n\n(CLAUDE.md prose omitted under prompt-byte-budget — fall back to tag-based judgment for this agent.)`;
}

function renderIssueBlock(issue: IssueSummary): string {
  const labels = issue.labels.length === 0 ? "(none)" : issue.labels.join(", ");
  const body = issue.body.trim();
  const truncatedBody =
    body.length === 0
      ? "(empty)"
      : body.length <= ISSUE_BODY_MAX_CHARS
        ? body
        : body.slice(0, ISSUE_BODY_MAX_CHARS - 3) + "...";
  return `## Issue #${issue.id}: ${issue.title}\nLabels: ${labels}\n\n${truncatedBody}`;
}
