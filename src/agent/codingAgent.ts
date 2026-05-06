import {
  query,
  type CanUseTool,
  type PermissionResult,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { buildAgentSystemPrompt } from "./prompt.js";
import { extractEnvelope } from "./parseResult.js";
import { reconcileFromState, type ReconcileState } from "./reconcile.js";
import { claudeBinPath } from "./sdkBinary.js";
import type { AgentRecord, ResultEnvelope, ResumeContext } from "../types.js";
import type { Logger } from "../log/logger.js";
import type { RunCostTracker } from "../util/costTracker.js";

export interface CodingAgentInput {
  agent: AgentRecord;
  issueId: number;
  targetRepo: string;
  targetRepoPath: string;
  worktreePath: string;
  branchName: string;
  dryRun: boolean;
  logger: Logger;
  abortController?: AbortController;
  inspectPaths?: string[];
  /**
   * Per-run cost accumulator (issue #85 Phase 1 — measurement only).
   * Optional so direct callers like `vp-dev spawn` (single-issue, no run
   * scope) can omit it; orchestrator-driven runs always pass one.
   */
  costTracker?: RunCostTracker;
  /**
   * Issue #119 Phase 2: per-issue resume context. Forwarded to
   * `buildAgentSystemPrompt` so the seed renders a "## Previous attempt
   * (resumed)" section pointing at the salvaged work the agent should
   * build on. Worktree-side rebase has already happened by the time we
   * get here (see `createWorktree(resumeFromBranch)`).
   */
  resumeContext?: ResumeContext;
  /**
   * Issue #142 (Phase 2 of #134): when `true`, the workflow prompt's
   * `autoPhaseFollowup` render switch fires and the agent's seed gets
   * the Step N+1 "Auto-file next phase" section. CLI-driven via
   * `vp-dev run --auto-phase-followup`. Default `false` — Step N+1 is
   * absent and no follow-up issue is filed.
   */
  autoPhaseFollowup?: boolean;
  /**
   * Issue #179 phase 3: when `true`, the workflow's Step 1 emits a
   * body-only variant — no comment fetch, "Issue Analysis" rule
   * explicitly suspended. Used by `vp-dev research curve-study` so
   * closed-issue dispatches don't read the resolution-PR link.
   */
  issueBodyOnly?: boolean;
  /**
   * Issue #179 phase 3: suppress the live target-repo CLAUDE.md prepend
   * in the system prompt. Forwarded to buildAgentSystemPrompt — keeps
   * effective context size equal to the per-agent CLAUDE.md size.
   */
  suppressTargetClaudeMd?: boolean;
}

export interface CodingAgentResult {
  envelope?: ResultEnvelope;
  finalText: string;
  parseError?: string;
  durationMs: number;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
  /**
   * SDK result subtype when the run ended in error — e.g. `error_max_turns`,
   * `error_max_budget_usd`, `error_during_execution`. Distinct from
   * `errorReason` (human-readable string) so callers can branch on the
   * machine-readable subtype without parsing the message text.
   */
  errorSubtype?: string;
  /** True when the recovery pass for `error_max_turns` was attempted. */
  recoveryAttempted?: boolean;
  toolUseTrace: { tool: string; input: string }[];
  /**
   * Set when extractEnvelope failed and the orchestrator queried git/gh state
   * to rebuild an envelope. Values:
   *  - "pr-found" — envelope was synthesized from an open PR; `parseError`
   *    stays populated as a soft warning.
   *  - "branch-only" — branch on remote without an open PR; `branchUrl` is
   *    available in run logs (`agent.reconcile_orphan_branch`); envelope
   *    stays undefined.
   *  - "no-state" / "error" — original parseError behavior preserved.
   */
  reconciled?: ReconcileState;
  /** Populated when reconciliation found a branch on remote. */
  branchUrl?: string;
}

const ALLOWED_NATIVE_TOOLS = ["Bash", "Read", "Edit", "Write", "Grep", "Glob"];

export async function runCodingAgent(input: CodingAgentInput): Promise<CodingAgentResult> {
  const start = Date.now();
  const systemPrompt = await buildAgentSystemPrompt({
    agent: input.agent,
    workflow: {
      issueId: input.issueId,
      targetRepo: input.targetRepo,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
      dryRun: input.dryRun,
      inspectPaths: input.inspectPaths,
      agentId: input.agent.agentId,
      agentName: input.agent.name,
      // Issue #129: surface the originating agent's identity to the
      // workflow prompt so a resumed run renders a co-signature line on
      // the PR body. Pass through only what the signature needs.
      resumeContext: input.resumeContext
        ? {
            agentId: input.resumeContext.agentId,
            agentName: input.resumeContext.agentName,
            runId: input.resumeContext.runId,
          }
        : undefined,
      // Issue #142 (Phase 2 of #134): forward the per-run flag into the
      // workflow renderer. When `true`, `renderWorkflow` adds the Step
      // N+1 section + the `nextPhaseIssueUrl` envelope-schema field.
      // Phase 1 (#141) shipped the renderer; this is the call site that
      // actually flips the switch.
      autoPhaseFollowup: input.autoPhaseFollowup,
      // Issue #179 phase 3: forward the calibration-study flag so the
      // workflow renders Step 1 without the comments fetch.
      issueBodyOnly: input.issueBodyOnly,
    },
    targetRepoPath: input.targetRepoPath,
    resumeContext: input.resumeContext,
    suppressTargetClaudeMd: input.suppressTargetClaudeMd,
  });

  const userPrompt = `Work on issue #${input.issueId} in ${input.targetRepo} per the workflow above. Emit the JSON envelope as your final message.`;

  const canUseTool = makeCanUseTool({
    branchName: input.branchName,
    targetRepo: input.targetRepo,
    dryRun: input.dryRun,
    issueId: input.issueId,
    logger: input.logger,
    agentId: input.agent.agentId,
    issueBodyOnly: input.issueBodyOnly,
  });

  const disallowedTools = [
    "Bash(git push origin main:*)",
    "Bash(git push origin HEAD:main:*)",
    "Bash(git push --force origin main:*)",
  ];

  const toolUseTrace: { tool: string; input: string }[] = [];

  // Pass 1 (main coding pass): no `maxTurns` — issue #98 retired the 50-turn
  // ceiling. The cap was an indirect proxy for cost; once `RunCostTracker`
  // landed (PR #93) and the SDK's `maxBudgetUsd` option became available we
  // can hard-stop on the dimension we actually want to bound. Past failure
  // mode: issue #34's 9-file plan twice hit `error_max_turns` mid-edit
  // despite making forward progress, burning ~$8.30 with no recovered work.
  // The remaining-budget computation reads the tracker AT DISPATCH TIME so
  // pass 1 sees the full budget; recovery passes (2a, 2b) see what's left
  // after pass 1's cost has been forwarded via `costTracker.add()`. When
  // no budget was configured (`--max-cost-usd` absent), `remainingBudget()`
  // returns `undefined` and the SDK runs uncapped — same behavior as the
  // pre-#98 main pass minus the turn ceiling.
  const pass1 = await runSdkPass({
    input,
    systemPrompt,
    userPrompt,
    canUseTool,
    disallowedTools,
    toolUseTrace,
    maxBudgetUsd: input.costTracker?.remainingBudget(),
  });

  // Forward to the per-run accumulator the moment the SDK reports the
  // pass cost — pre-recovery so even a recovery-pass crash leaves the
  // first pass accounted for. The tracker is defensive against
  // undefined/non-finite values.
  input.costTracker?.add(pass1.costUsd);

  let finalText = pass1.finalText;
  let isError = pass1.isError;
  let errorReason = pass1.errorReason;
  let errorSubtype = pass1.errorSubtype;
  let costUsd = pass1.costUsd;

  let parsed = extractEnvelope(finalText);
  let recoveryAttempted = false;

  // Truncation recovery: when the SDK truncated the run with
  // `error_max_turns` OR `error_max_budget_usd` and we have no parseable
  // envelope, run a two-pass recovery:
  //
  //   - Pass 2a (1 turn, no tools): envelope-only. Hard SDK-level guarantee
  //     that a structured terminal envelope is recorded before any tool work
  //     can consume the recovery budget. Issue #89: previously the single
  //     5-turn recovery pass burned all 5 turns on git status / build / test
  //     before reaching the envelope-write step, leaving the orchestrator
  //     with `parseOk: false, isError: true` and no recovered terminal state.
  //   - Pass 2b (4 turns, full tools): optional commit + push + richer
  //     envelope. Only runs when 2a produced a parseable envelope, so a
  //     flaky 2a doesn't poison the budget for a failing 2b. Best-effort
  //     upgrade from `decision: "error"` to `decision: "implement"` with
  //     prUrl when there's recoverable in-flight work.
  //
  // Issue #98: `error_max_budget_usd` is the cost-shaped twin of
  // `error_max_turns` — it fires when the SDK exhausts the per-query
  // `maxBudgetUsd` derived from the tracker's remaining budget. Same
  // recovery shape applies: drained budget on pass 1 means recovery passes
  // see `remainingBudget() === 0` and the SDK exits with the same subtype
  // before tools can fire, so pass 2a still gets its envelope-write budget
  // off the orchestrator's residual headroom (the run-level budget
  // continues to accumulate across passes).
  //
  // Skipped in dry-run because branch / push are intercepted into echoes,
  // leaving no real remote state for reconcile to find. See issue #76.
  if (
    (errorSubtype === "error_max_turns" || errorSubtype === "error_max_budget_usd") &&
    !parsed.ok &&
    !input.dryRun
  ) {
    recoveryAttempted = true;
    input.logger.info("agent.recovery_started", {
      agentId: input.agent.agentId,
      issueId: input.issueId,
      reason: errorSubtype,
    });

    const pass2a = await runSdkPass({
      input,
      systemPrompt,
      userPrompt: buildEnvelopeOnlyPrompt(),
      maxTurns: 1,
      // tools: [] disables ALL built-in tools per the SDK type comment
      // ("[] (empty array) - Disable all built-in tools"). The model has
      // no choice but to respond with text, so it cannot drift into git /
      // build / test calls before the envelope is written.
      tools: [],
      canUseTool,
      disallowedTools,
      toolUseTrace,
      // Recovery passes share the run-level cost ceiling. Re-read the
      // tracker after pass 1 so pass 2a sees the residual budget, not the
      // pre-pass-1 budget. When pass 1 itself triggered the recovery via
      // `error_max_budget_usd`, the residual is 0 — pass 2a then runs
      // under tight enforcement (the SDK exits with the same subtype as
      // soon as a cost reading is reported), gracefully degrading rather
      // than being blocked entirely. The 1-turn `maxTurns` cap is the
      // primary bound on this pass; budget is the secondary.
      maxBudgetUsd: input.costTracker?.remainingBudget(),
    });
    if (pass2a.finalText) finalText = pass2a.finalText;
    if (typeof pass2a.costUsd === "number") {
      costUsd = (costUsd ?? 0) + pass2a.costUsd;
    }
    input.costTracker?.add(pass2a.costUsd);
    let parsed2a = extractEnvelope(finalText);

    if (parsed2a.ok) {
      const pass2b = await runSdkPass({
        input,
        systemPrompt,
        userPrompt: buildRecoveryPrompt({ branchName: input.branchName }),
        maxTurns: 4,
        canUseTool,
        disallowedTools,
        toolUseTrace,
        // Re-read remaining budget after pass 2a was forwarded so pass 2b
        // sees what's left for the work-salvage tool calls.
        maxBudgetUsd: input.costTracker?.remainingBudget(),
      });
      if (typeof pass2b.costUsd === "number") {
        costUsd = (costUsd ?? 0) + pass2b.costUsd;
      }
      input.costTracker?.add(pass2b.costUsd);
      // Only adopt 2b's text when it contains a parseable envelope —
      // otherwise we'd overwrite 2a's salvage envelope with 2b's
      // mid-verification chatter and lose the recovery entirely.
      const parsed2b = extractEnvelope(pass2b.finalText);
      if (parsed2b.ok) {
        finalText = pass2b.finalText;
      }
      if (!pass2b.isError) {
        isError = false;
        errorReason = undefined;
        errorSubtype = undefined;
      } else if (pass2b.errorReason) {
        errorReason = `${errorReason ?? ""}; recovery2b: ${pass2b.errorReason}`.replace(/^; /, "");
        errorSubtype = pass2b.errorSubtype ?? errorSubtype;
      }
    } else if (!pass2a.isError) {
      // 2a SDK-succeeded but produced unparseable text; the original
      // error_max_turns is what surfaces. Keep isError set so the
      // orchestrator still treats the run as failed, but record the 2a
      // failure mode for diagnostics.
      errorReason = `${errorReason ?? ""}; recovery2a: envelope unparseable`.replace(/^; /, "");
    } else if (pass2a.errorReason) {
      errorReason = `${errorReason ?? ""}; recovery2a: ${pass2a.errorReason}`.replace(/^; /, "");
      errorSubtype = pass2a.errorSubtype ?? errorSubtype;
    }

    parsed = extractEnvelope(finalText);
    input.logger.info("agent.recovery_completed", {
      agentId: input.agent.agentId,
      issueId: input.issueId,
      parseOk: parsed.ok,
      pass2aOk: parsed2a.ok,
      pass2aIsError: pass2a.isError,
      pass2bRan: parsed2a.ok,
      costUsd: pass2a.costUsd ?? null,
    });
  }

  const durationMs = Date.now() - start;

  let envelope = parsed.envelope;
  const parseError = parsed.ok ? undefined : parsed.error;
  let reconciled: ReconcileState | undefined;
  let branchUrl: string | undefined;

  // Reconciliation pass — when extractEnvelope fails, rebuild from git/gh
  // state so a successful PR / orphan branch isn't lost behind a parse error.
  // Skipped in dry-run: branch and PR creation are intercepted (rewritten to
  // `printf`), so no real state exists to reconcile against.
  if (!parsed.ok && !input.dryRun) {
    const r = await reconcileFromState({
      agentId: input.agent.agentId,
      issueId: input.issueId,
      targetRepo: input.targetRepo,
      targetRepoPath: input.targetRepoPath,
      branchName: input.branchName,
      parseError: parseError ?? "unknown",
      logger: input.logger,
    });
    reconciled = r.state;
    branchUrl = r.branchUrl;
    if (r.reconciledEnvelope) {
      envelope = r.reconciledEnvelope;
      // parseError intentionally retained: the bug stays visible in logs and
      // CodingAgentResult; reconciliation just stops it from corrupting status.
    }
  }

  const result: CodingAgentResult = {
    envelope,
    finalText,
    parseError,
    durationMs,
    costUsd,
    isError,
    errorReason,
    errorSubtype,
    recoveryAttempted: recoveryAttempted || undefined,
    toolUseTrace,
    reconciled,
    branchUrl,
  };

  input.logger.info("agent.completed", {
    agentId: input.agent.agentId,
    issueId: input.issueId,
    decision: envelope?.decision ?? null,
    prUrl: envelope?.prUrl ?? null,
    durationMs,
    costUsd: costUsd ?? null,
    isError,
    errorSubtype: errorSubtype ?? null,
    recoveryAttempted: recoveryAttempted || undefined,
    parseError: result.parseError ?? null,
    reconciled: result.reconciled ?? null,
    branchUrl: result.branchUrl ?? null,
    // When parsing failed, capture the raw finalText (truncated) so future
    // failures are debuggable without re-running the agent at $2-3 each.
    // Omitted on the happy path to avoid log bloat. See issue #52.
    finalText: result.parseError ? truncate(finalText, 4096) : undefined,
  });
  return result;
}

interface SdkPassOpts {
  input: CodingAgentInput;
  systemPrompt: string;
  userPrompt: string;
  /**
   * Optional turn ceiling. Issue #98 dropped the cap for the main coding
   * pass — cost is the real constraint and the turn cap was an indirect
   * proxy that fired at a less-meaningful boundary. Recovery passes (2a,
   * 2b) and single-decision LLM calls keep `maxTurns` because they're
   * decision-bounded by design.
   */
  maxTurns?: number;
  canUseTool: CanUseTool;
  disallowedTools: string[];
  toolUseTrace: { tool: string; input: string }[];
  /**
   * Override the default `ALLOWED_NATIVE_TOOLS` list. Pass `[]` to disable
   * all built-in tools (envelope-only recovery pass; see issue #89).
   */
  tools?: string[];
  /**
   * Per-query cost ceiling forwarded to the SDK's `maxBudgetUsd` option.
   * The SDK exits with `error_max_budget_usd` once the query crosses this
   * threshold. Computed at dispatch time as `costTracker.remainingBudget()`
   * so each pass sees the budget that's actually left after prior passes
   * forwarded their cost via `costTracker.add()`. Undefined when no
   * run-level budget was configured — the SDK then runs uncapped on cost.
   */
  maxBudgetUsd?: number;
}

interface SdkPassResult {
  finalText: string;
  isError: boolean;
  errorReason?: string;
  errorSubtype?: string;
  costUsd?: number;
}

// CRITICAL: canUseTool is delivered via stdio control messages and only
// works when the prompt is an AsyncIterable (streaming input mode). With
// a plain string prompt, the SDK closes stdin after sending the user
// message, so the bridge can never deliver permission requests back to
// the callback — the dry-run interception and push-to-main blocks
// silently miss every tool call. Two real comments hit issue #612 during
// "dry runs" before this was diagnosed.
async function runSdkPass(opts: SdkPassOpts): Promise<SdkPassResult> {
  const { input } = opts;
  let finalText = "";
  let isError = false;
  let errorReason: string | undefined;
  let errorSubtype: string | undefined;
  let costUsd: number | undefined;

  let closeInputStream: () => void = () => {};
  const inputClosed = new Promise<void>((resolve) => {
    closeInputStream = resolve;
  });
  async function* makeUserStream(): AsyncIterable<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: opts.userPrompt },
      parent_tool_use_id: null,
    };
    await inputClosed;
  }

  try {
    const stream = query({
      prompt: makeUserStream(),
      options: {
        model: "claude-opus-4-7",
        cwd: input.worktreePath,
        additionalDirectories: input.inspectPaths,
        systemPrompt: opts.systemPrompt,
        tools: opts.tools ?? ALLOWED_NATIVE_TOOLS,
        permissionMode: "default",
        canUseTool: opts.canUseTool,
        disallowedTools: opts.disallowedTools,
        env: process.env,
        abortController: input.abortController,
        maxTurns: opts.maxTurns,
        maxBudgetUsd: opts.maxBudgetUsd,
        settingSources: [],
        persistSession: false,
        pathToClaudeCodeExecutable: claudeBinPath(),
      },
    });

    for await (const msg of stream) {
      onMessage(msg, input, opts.toolUseTrace);
      if (msg.type === "assistant") {
        const text = extractText(msg.message.content);
        if (text) finalText = text;
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          finalText = msg.result || finalText;
          costUsd = msg.total_cost_usd;
        } else {
          isError = true;
          errorSubtype = msg.subtype;
          const errs = (msg as { errors?: string[] }).errors;
          errorReason = errs && errs.length > 0 ? errs.join("; ") : msg.subtype;
          costUsd = msg.total_cost_usd;
        }
        closeInputStream();
      }
    }
  } catch (err) {
    isError = true;
    errorReason = (err as Error).message;
  } finally {
    closeInputStream();
  }

  return { finalText, isError, errorReason, errorSubtype, costUsd };
}

/**
 * Recovery pass 2a (issue #89). Run with `maxTurns: 1, tools: []` so the
 * model has no choice but to respond with text — guaranteeing a structured
 * envelope is captured before the optional verification pass can consume
 * the recovery budget on tool calls.
 *
 * Emits a fallback `decision: "error"` envelope; pass 2b can supersede it
 * with a richer `decision: "implement"` (with prUrl) if recoverable work
 * gets pushed.
 */
export function buildEnvelopeOnlyPrompt(): string {
  return [
    `Recovery turn 1 of 2 — your previous session was truncated by the turn ceiling.`,
    ``,
    `This turn has NO tools available. Your ENTIRE response must be the JSON envelope, nothing else.`,
    ``,
    `Emit exactly this envelope (no preamble, no explanation, no fenced code block — bare JSON):`,
    ``,
    `{"decision":"error","reason":"Truncated by turn ceiling — original task incomplete; recovery pass 2 will attempt to salvage uncommitted work.","memoryUpdate":{"addTags":[]}}`,
    ``,
    `A second recovery pass with full tools follows this one and may supersede this envelope. Do not attempt to verify state, summarize work, or vary the JSON shape — emit it verbatim.`,
  ].join("\n");
}

/**
 * Recovery pass 2b (issue #89). Runs only when pass 2a (envelope-only)
 * succeeded, so the orchestrator already has a fallback envelope on record.
 * This pass attempts to commit + push uncommitted in-flight work and emit
 * a richer envelope (`decision: "implement"` with prUrl when a PR opens).
 *
 * Budget is 4 turns. If the budget runs out before this pass emits its
 * own envelope, the fallback envelope from pass 2a is preserved.
 */
export function buildRecoveryPrompt(opts: { branchName: string }): string {
  return [
    `Recovery turn 2 of 2 — verification + work salvage.`,
    ``,
    `Pass 1 already recorded a fallback "error" envelope. This pass has 4 turns and full tool access; use them to upgrade the recorded outcome if possible.`,
    ``,
    `DO NOT attempt new feature work. Recover what's already in the worktree:`,
    ``,
    `1. Run \`git status\` to inspect uncommitted changes.`,
    `2. If anything is uncommitted, stage and commit on branch \`${opts.branchName}\` with a brief message describing what was in flight.`,
    `3. Push: \`git push -u origin ${opts.branchName}\`.`,
    `4. Emit a refined JSON envelope as your final message per the workflow. If a PR was opened, use \`decision: "implement"\` with the prUrl. Otherwise use \`decision: "pushback"\` with a brief reason.`,
    ``,
    `If you run low on budget, skip directly to step 4 with whatever envelope best fits the state you've observed. If the worktree is clean and you never opened a PR, emit \`{"decision":"pushback","reason":"Truncated by turn ceiling; no recoverable artifact in worktree.","memoryUpdate":{"addTags":[]}}\`.`,
  ].join("\n");
}

function onMessage(
  msg: SDKMessage,
  input: CodingAgentInput,
  trace: { tool: string; input: string }[],
): void {
  if (msg.type === "assistant") {
    for (const block of msg.message.content as ContentBlock[]) {
      if (block.type === "tool_use") {
        const inputStr = JSON.stringify(block.input ?? {});
        const truncated = inputStr.length > 500 ? inputStr.slice(0, 497) + "..." : inputStr;
        trace.push({ tool: block.name ?? "unknown", input: truncated });
        input.logger.info("agent.tool_use", {
          agentId: input.agent.agentId,
          issueId: input.issueId,
          tool: block.name,
          input: truncated,
        });
      } else if (block.type === "text") {
        const preview = (block.text || "").slice(0, 200).replace(/\s+/g, " ").trim();
        if (preview.length > 0) {
          input.logger.info("agent.message", {
            agentId: input.agent.agentId,
            issueId: input.issueId,
            preview,
          });
        }
      }
    }
  }
}

interface ContentBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

interface CanUseOpts {
  branchName: string;
  targetRepo: string;
  dryRun: boolean;
  issueId: number;
  logger: Logger;
  agentId: string;
  /**
   * Issue #179 phase 3: when set, the gate refuses any Bash that fetches
   * issue comments (`gh api .../comments`, `gh issue view ... --comments`).
   * Defense in depth on top of the workflow-prompt instruction — if the
   * agent ignores Step 1's guidance, the gate still blocks the leak.
   */
  issueBodyOnly?: boolean;
}

function makeCanUseTool(opts: CanUseOpts): CanUseTool {
  return async (toolName, toolInput) => {
    const result = evaluate(toolName, toolInput, opts);
    opts.logger.info("permission.evaluated", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      tool: toolName,
      behavior: result.behavior,
    });
    return result;
  };
}

function evaluate(
  toolName: string,
  toolInput: Record<string, unknown>,
  opts: CanUseOpts,
): PermissionResult {
  if (toolName === "Read" || toolName === "Edit" || toolName === "Write" || toolName === "Grep" || toolName === "Glob") {
    return { behavior: "allow", updatedInput: toolInput };
  }
  if (toolName !== "Bash") {
    return { behavior: "deny", message: `Tool ${toolName} not in allowlist for vp-dev coding agents.` };
  }

  const cmdRaw = typeof toolInput.command === "string" ? toolInput.command : "";
  const cmd = cmdRaw.trim();

  // Hard deny: any push to main on the target repo.
  if (PUSH_TO_MAIN_RE.test(cmd)) {
    return { behavior: "deny", message: "Refusing: push to main is forbidden in vp-dev." };
  }

  // Block force pushes that aren't --force-with-lease.
  if (PLAIN_FORCE_PUSH_RE.test(cmd)) {
    return { behavior: "deny", message: "Refusing: plain --force push not allowed; use --force-with-lease on feature branches only." };
  }

  // Block --no-verify and --no-gpg-sign-style hook bypasses.
  if (NO_VERIFY_RE.test(cmd)) {
    return { behavior: "deny", message: "Refusing: --no-verify / --no-gpg-sign bypass not allowed." };
  }

  // Issue #179 phase 3: when issueBodyOnly is set, refuse comment fetches.
  // Defense in depth on top of the workflow-prompt instruction.
  if (opts.issueBodyOnly && ISSUE_COMMENTS_FETCH_RE.test(cmd)) {
    return {
      behavior: "deny",
      message:
        "Refusing: --issue-body-only is set; do not fetch issue comments. Read the issue body via `gh issue view <N> --json body` only.",
    };
  }

  if (opts.dryRun) {
    const compoundDeny = denyCompoundDryRun(cmd);
    if (compoundDeny) return compoundDeny;
    const intercept = dryRunIntercept(cmd, opts);
    if (intercept) return intercept;
  }

  if (isAllowedBash(cmd, opts.branchName)) {
    return { behavior: "allow", updatedInput: toolInput };
  }
  return { behavior: "deny", message: `Bash command not in allowlist: ${truncate(cmd, 160)}` };
}

// PUSH_TO_MAIN_RE uses [\s\S]* to match across newlines (heredocs etc.)
// so a `git push origin main` smuggled inside a heredoc body or after a
// newline still gets caught.
const PUSH_TO_MAIN_RE = /\bgit\s+push\b[\s\S]*?\bmain\b/;
const PLAIN_FORCE_PUSH_RE = /\bgit\s+push\b[\s\S]*?--force(?!\s*-with-lease)/;
const NO_VERIFY_RE = /(--no-verify\b|--no-gpg-sign\b)/;
// Two ways to land at issue comments:
//   gh api repos/<owner>/<repo>/issues/<n>/comments
//   gh issue view <n> ... --json ... comments ... or --comments
//
// Exported for unit testing. The gate uses this regex when issueBodyOnly
// is set, so any change here needs to keep both fetch shapes denied.
export const ISSUE_COMMENTS_FETCH_RE =
  /\bgh\s+(?:api[\s\S]*?\/issues\/\d+\/comments\b|issue\s+view\b[\s\S]*?(?:--comments\b|comments\b))/;

// Dry-run-sensitive subcommands. We anchor the canonical intercept regexes
// at start-of-line in dryRunIntercept (so the rewrite-to-echo replaces
// exactly those leading commands). To prevent compound smuggling, we also
// scan for the same patterns ANYWHERE in the command and refuse the call
// when they appear in a non-leading position — the agent is expected to
// invoke them as separate top-level Bash calls so the intercept can act
// on each in isolation.
const DRY_RUN_SENSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bgh\s+issue\s+comment\b/, label: "gh issue comment" },
  { re: /\bgh\s+issue\s+create\b/, label: "gh issue create" },
  { re: /\bgh\s+pr\s+create\b/, label: "gh pr create" },
  { re: /\bgit\s+push\b/, label: "git push" },
];
const DRY_RUN_SENSITIVE_LEADING: RegExp[] = [
  /^gh\s+issue\s+comment\b/,
  /^gh\s+issue\s+create\b/,
  /^gh\s+pr\s+create\b/,
  /^git\s+push\b/,
];

// Pure file-write heredoc as the WHOLE command: `cat > FILE << DELIM\n…body…\nDELIM`
// with nothing trailing. The body is data being redirected to disk — it cannot
// shell-execute, so sensitive substrings inside it (agents writing pushback
// prose that mentions `gh issue comment`) shouldn't trip the compound-deny scan.
// Anchored to end-of-string: any trailing compound (`&& gh issue comment`,
// `; git push`, `| bash`) fails the match and falls through to the normal scan.
// Push-to-main / force-push / --no-verify denials run BEFORE this exemption
// (PUSH_TO_MAIN_RE etc. on lines above) and use [\s\S]* to catch heredoc
// bodies, so this does not weaken push-protection.
const HEREDOC_FILE_WRITE_RE =
  /^\s*cat\s*>>?\s*\S+\s*<<-?\s*['"]?(\w+)['"]?\s*\n[\s\S]*?\n\s*\1\s*$/;

function denyCompoundDryRun(cmd: string): PermissionResult | null {
  if (HEREDOC_FILE_WRITE_RE.test(cmd)) return null;
  for (let i = 0; i < DRY_RUN_SENSITIVE_PATTERNS.length; i++) {
    const { re, label } = DRY_RUN_SENSITIVE_PATTERNS[i];
    const leading = DRY_RUN_SENSITIVE_LEADING[i];
    if (re.test(cmd) && !leading.test(cmd)) {
      return {
        behavior: "deny",
        message: `Refusing: dry-run requires \`${label}\` to be a standalone top-level Bash call so the interception can rewrite it cleanly. Compound (\`&&\`, \`||\`, \`;\`, heredoc-chained, etc.) commands smuggle the call past the gate. Re-issue \`${label}\` as its own Bash invocation.`,
      };
    }
  }
  return null;
}

const ALLOW_PATTERNS: RegExp[] = [
  /^pwd\b/,
  /^ls(\s|$)/,
  /^cat(\s|$)/,
  /^head(\s|$)/,
  /^tail(\s|$)/,
  /^wc(\s|$)/,
  /^which(\s|$)/,
  /^find(\s|$)/,
  /^echo(\s|$)/,
  /^mkdir(\s|$)/,
  /^rm\s+(-?[rRfv]+\s+)?[^\/\s]/,
  /^cp(\s|$)/,
  /^mv(\s|$)/,
  /^node(\s|$)/,
  /^npx\s+(tsc|vitest|tsx)(\s|$)/,
  /^npm\s+(install|i|run|test|ci|view|show|pack|ls|list)(\s|$)/,

  // git read-only / safe
  /^git\s+(status|diff|log|show|fetch|rebase|branch|checkout|add|commit|stash)(\s|$)/,
  /^git\s+config\s+--get(\s|$)/,
  /^git\s+rev-parse(\s|$)/,
  /^git\s+restore(\s|$)/,

  // gh — issue read + comment + create, PR create/view/checks, api issue/PR fetch
  /^gh\s+issue\s+view(\s|$)/,
  /^gh\s+issue\s+list(\s|$)/,
  /^gh\s+issue\s+comment(\s|$)/,
  // `gh issue create` is the canonical cross-repo-scope-split workflow:
  // an MCP-side fix needs to file the skill-side half as a tracked issue
  // in vaultpilot-security-skill. Allowlisted here; dry-run synthesizes a
  // fake issue URL via dryRunIntercept (same pattern as `gh issue comment`).
  /^gh\s+issue\s+create(\s|$)/,
  /^gh\s+pr\s+(create|view|checks|list|diff)(\s|$)/,
  // Cross-issue/PR triage: search by keyword, dedup detection.
  /^gh\s+search\s+(issues|prs)(\s|$)/,
  // Cross-org issue/PR reads: agents need to verify upstream tracker state
  // (e.g. "is mrgnlabs/mrgn-ts#1139 still open?") for tracking-issue triage.
  // Bare `/issues/N` and `/pulls/N` cover the issue/PR body; the optional
  // `/comments` suffix covers the comment thread. Both are read-only.
  /^gh\s+api\s+repos\/[^\s]+\/(issues|pulls)\/\d+(\/comments)?(\s|$)/,
  // List endpoint with optional query (state, labels, per_page, etc.) —
  // agents enumerate by filter to find related issues without GET-by-N.
  /^gh\s+api\s+repos\/[^\s]+\/(issues|pulls)(\?[^\s]*)?(\s|$)/,
  /^gh\s+api\s+\/?advisories\//,
  /^gh\s+repo\s+view(\s|$)/,

  // curl — read-only registry / public-API fetches. Limited to known safe
  // hosts to avoid arbitrary network egress. `--method`/`-X` flags that
  // would mutate state on these hosts are still blocked because the agent
  // cannot smuggle a state-changing call past dryRunIntercept here (these
  // hosts don't accept GitHub-style mutation through curl auth flows).
  /^curl\s+(-[a-zA-Z]+\s+)*https:\/\/registry\.npmjs\.org\//,
  /^curl\s+(-[a-zA-Z]+\s+)*https:\/\/api\.github\.com\//,
];

function isAllowedBash(cmd: string, branchName: string): boolean {
  for (const re of ALLOW_PATTERNS) {
    if (re.test(cmd)) return true;
  }
  // Push to a non-main branch. Accept "git push [-u] [--force-with-lease] origin <branch>".
  if (/^git\s+push\b/.test(cmd)) {
    const m = /\bgit\s+push\b(?:\s+(?:-u|--force-with-lease))*\s+origin\s+(\S+)/.exec(cmd);
    if (m) {
      const target = m[1].replace(/^HEAD:/, "");
      void branchName;
      return target !== "main";
    }
  }
  return false;
}

function dryRunIntercept(cmd: string, opts: CanUseOpts): PermissionResult | null {
  if (/^gh\s+issue\s+comment\b/.test(cmd)) {
    const synthetic = `https://dry-run/issue-comment/${opts.targetRepo}/${opts.issueId}`;
    opts.logger.info("dry_run.intercepted", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      cmd: truncate(cmd, 160),
      synthetic,
    });
    return rewriteAsEcho(synthetic);
  }
  if (/^gh\s+issue\s+create\b/.test(cmd)) {
    // The new issue is in whatever repo the agent named with --repo (often a
    // cross-repo skill-issue file). Extract it for the synthetic URL; fall
    // back to opts.targetRepo if --repo isn't present.
    const repoMatch = /--repo\s+(\S+)/.exec(cmd);
    const targetForUrl = repoMatch ? repoMatch[1] : opts.targetRepo;
    const synthetic = `https://dry-run/issue-create/${targetForUrl}/new`;
    opts.logger.info("dry_run.intercepted", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      cmd: truncate(cmd, 160),
      synthetic,
    });
    return rewriteAsEcho(synthetic);
  }
  if (/^gh\s+pr\s+create\b/.test(cmd)) {
    const synthetic = `https://dry-run/pr/${opts.targetRepo}/issue-${opts.issueId}`;
    opts.logger.info("dry_run.intercepted", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      cmd: truncate(cmd, 160),
      synthetic,
    });
    return rewriteAsEcho(synthetic);
  }
  if (/^git\s+push\b/.test(cmd)) {
    const synthetic = `https://dry-run/git-push/${opts.targetRepo}/issue-${opts.issueId}`;
    opts.logger.info("dry_run.intercepted", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      cmd: truncate(cmd, 160),
      synthetic,
    });
    return rewriteAsEcho(synthetic);
  }
  return null;
}

function rewriteAsEcho(message: string): PermissionResult {
  return {
    behavior: "allow",
    updatedInput: { command: `printf %s ${shellQuote(message)}` },
  };
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}
