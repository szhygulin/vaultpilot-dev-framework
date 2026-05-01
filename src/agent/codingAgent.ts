import {
  query,
  type CanUseTool,
  type PermissionResult,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
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

  // CRITICAL: canUseTool is delivered via stdio control messages and only
  // works when the prompt is an AsyncIterable (streaming input mode). With
  // a plain string prompt, the SDK closes stdin after sending the user
  // message, so the bridge can never deliver permission requests back to
  // the callback — the dry-run interception and push-to-main blocks
  // silently miss every tool call. Two real comments hit issue #612 during
  // "dry runs" before this was diagnosed.
  let closeInputStream: () => void = () => {};
  const inputClosed = new Promise<void>((resolve) => {
    closeInputStream = resolve;
  });
  async function* makeUserStream(): AsyncIterable<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: userPrompt },
      parent_tool_use_id: null,
    };
    // Keep stdin open so the bridge can deliver canUseTool requests until
    // the result message arrives and we close it from the consumer side.
    await inputClosed;
  }

  try {
    const stream = query({
      prompt: makeUserStream(),
      options: {
        model: "claude-opus-4-7",
        cwd: input.worktreePath,
        additionalDirectories: input.inspectPaths,
        systemPrompt,
        tools: ALLOWED_NATIVE_TOOLS,
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
        // Result arrived — let the input iterator drain so the SDK can
        // close cleanly without hanging on `await inputClosed`.
        closeInputStream();
      }
    }
  } catch (err) {
    isError = true;
    errorReason = (err as Error).message;
  } finally {
    closeInputStream();
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
