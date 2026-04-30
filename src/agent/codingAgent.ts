import { query, type CanUseTool, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildAgentSystemPrompt } from "./prompt.js";
import { extractEnvelope } from "./parseResult.js";
import type { AgentRecord, ResultEnvelope } from "../types.js";
import type { Logger } from "../log/logger.js";

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
}

export interface CodingAgentResult {
  envelope?: ResultEnvelope;
  finalText: string;
  parseError?: string;
  durationMs: number;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
  toolUseTrace: { tool: string; input: string }[];
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
    },
    targetRepoPath: input.targetRepoPath,
  });

  const userPrompt = `Work on issue #${input.issueId} in ${input.targetRepo} per the workflow above. Emit the JSON envelope as your final message.`;

  const canUseTool = makeCanUseTool({
    branchName: input.branchName,
    targetRepo: input.targetRepo,
    dryRun: input.dryRun,
    issueId: input.issueId,
    logger: input.logger,
    agentId: input.agent.agentId,
  });

  const disallowedTools = [
    "Bash(git push origin main:*)",
    "Bash(git push origin HEAD:main:*)",
    "Bash(git push --force origin main:*)",
  ];

  let finalText = "";
  let isError = false;
  let errorReason: string | undefined;
  let costUsd: number | undefined;
  const toolUseTrace: { tool: string; input: string }[] = [];

  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        model: "claude-opus-4-7",
        cwd: input.worktreePath,
        additionalDirectories: input.inspectPaths,
        systemPrompt,
        tools: ALLOWED_NATIVE_TOOLS,
        // CRITICAL: do NOT use 'bypassPermissions' — that mode skips canUseTool
        // entirely, so the dry-run interception and push-to-main blocks would
        // never fire. 'default' + canUseTool routes every tool call through
        // the callback. Bypass mode shipped a real comment to GitHub during
        // a "dry run" before this was caught (#612 comment 4350831250).
        permissionMode: "default",
        canUseTool,
        disallowedTools,
        env: process.env,
        abortController: input.abortController,
        maxTurns: 50,
        settingSources: [],
        persistSession: false,
      },
    });

    for await (const msg of stream) {
      onMessage(msg, input, toolUseTrace);
      if (msg.type === "assistant") {
        const text = extractText(msg.message.content);
        if (text) finalText = text;
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          finalText = msg.result || finalText;
          costUsd = msg.total_cost_usd;
        } else {
          isError = true;
          errorReason = (msg as { errors?: string[] }).errors?.join("; ") ?? msg.subtype;
          costUsd = msg.total_cost_usd;
        }
      }
    }
  } catch (err) {
    isError = true;
    errorReason = (err as Error).message;
  }

  const durationMs = Date.now() - start;
  const parsed = extractEnvelope(finalText);
  const result: CodingAgentResult = {
    envelope: parsed.envelope,
    finalText,
    parseError: parsed.ok ? undefined : parsed.error,
    durationMs,
    costUsd,
    isError,
    errorReason,
    toolUseTrace,
  };

  input.logger.info("agent.completed", {
    agentId: input.agent.agentId,
    issueId: input.issueId,
    decision: parsed.envelope?.decision ?? null,
    prUrl: parsed.envelope?.prUrl ?? null,
    durationMs,
    costUsd: costUsd ?? null,
    isError,
    parseError: result.parseError ?? null,
  });
  return result;
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
}

function makeCanUseTool(opts: CanUseOpts): CanUseTool {
  return async (toolName, toolInput) => evaluate(toolName, toolInput, opts);
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

  if (opts.dryRun) {
    const intercept = dryRunIntercept(cmd, opts);
    if (intercept) return intercept;
  }

  if (isAllowedBash(cmd, opts.branchName)) {
    return { behavior: "allow", updatedInput: toolInput };
  }
  return { behavior: "deny", message: `Bash command not in allowlist: ${truncate(cmd, 160)}` };
}

const PUSH_TO_MAIN_RE = /\bgit\s+push\b[^\n]*\bmain\b/;
const PLAIN_FORCE_PUSH_RE = /\bgit\s+push\b[^\n]*--force(?!\s*-with-lease)/;
const NO_VERIFY_RE = /(--no-verify\b|--no-gpg-sign\b)/;

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
  /^npx\s+tsc(\s|$)/,
  /^npm\s+(install|i|run|test|ci)(\s|$)/,

  // git read-only / safe
  /^git\s+(status|diff|log|show|fetch|rebase|branch|checkout|add|commit|stash)(\s|$)/,
  /^git\s+config\s+--get(\s|$)/,
  /^git\s+rev-parse(\s|$)/,
  /^git\s+restore(\s|$)/,

  // gh — issue read + comment, PR create/view/checks, api comments fetch
  /^gh\s+issue\s+view(\s|$)/,
  /^gh\s+issue\s+list(\s|$)/,
  /^gh\s+issue\s+comment(\s|$)/,
  /^gh\s+pr\s+(create|view|checks|list|diff)(\s|$)/,
  /^gh\s+api\s+repos\/[^\s]+\/issues\/\d+\/comments(\s|$)/,
  /^gh\s+api\s+repos\/[^\s]+\/(issues|pulls)\/\d+\/comments(\s|$)/,
  /^gh\s+repo\s+view(\s|$)/,
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
    opts.logger.info("dry_run.intercepted", {
      agentId: opts.agentId,
      issueId: opts.issueId,
      cmd: truncate(cmd, 160),
      synthetic: "no-op",
    });
    return rewriteAsEcho("dry-run: git push no-op");
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
