import { Command } from "commander";
import {
  clearCurrentRunId,
  downgradeInFlightToPending,
  isRunComplete,
  loadRunState,
  makeRunId,
  newRunState,
  readCurrentRunId,
  saveRunState,
  writeCurrentRunId,
} from "./state/runState.js";
import { createAgent, loadRegistry, mutateRegistry } from "./state/registry.js";
import { loadAllAgentStats, pollOutcomes } from "./state/outcomes.js";
import { parseRangeSpec, describeRange } from "./github/range.js";
import { getIssue, resolveRangeToIssues } from "./github/gh.js";
import { pickAgents, runOrchestrator } from "./orchestrator/orchestrator.js";
import { approveSetup, buildSetupPreview } from "./orchestrator/setup.js";
import { Logger } from "./log/logger.js";
import { fetchOriginMain, pruneStaleAgentBranches, pruneWorktrees, resolveTargetRepoPath } from "./git/worktree.js";
import { agentClaudeMdPath, forkClaudeMd } from "./agent/specialization.js";
import { promises as fs } from "node:fs";
import { runIssueCore } from "./agent/runIssueCore.js";
import {
  applySplit,
  detectOverload,
  formatProposal,
  proposeSplit,
  readAgentClaudeMdBytes,
} from "./agent/split.js";
import type { AgentRecord, IssueRangeSpec, IssueSummary } from "./types.js";

const DEFAULT_MAX_TICKS = 200;
const DEFAULT_STALLED_THRESHOLD_DAYS = 14;

export function buildCli(): Command {
  const program = new Command();
  program.name("vp-dev").description("LLM-driven development agent runner").version("0.1.0");

  program
    .command("run")
    .description("Run agents against a range of GitHub issues")
    .requiredOption("--agents <n>", "Number of parallel coding agents", parsePositive)
    .requiredOption("--target-repo <owner/repo>", "Target GitHub repo (e.g. octocat/hello-world)")
    .option("--issues <range>", "Issue range: 100-150, csv 100,103,108, or all-open")
    .option("--target-repo-path <path>", "Local clone path of the target repo (default: $HOME/dev/<repo-name>)")
    .option("--resume", "Resume the most recent unfinished run")
    .option("--dry-run", "Intercept comment / PR / push tools with synthetic responses")
    .option("--max-ticks <n>", "Safety cap on scheduling ticks", parsePositive, DEFAULT_MAX_TICKS)
    .option(
      "--stalled-threshold-days <n>",
      "Mark an open PR as stalled after N days of inactivity (default 14)",
      parsePositive,
      DEFAULT_STALLED_THRESHOLD_DAYS,
    )
    .option("--verbose", "Mirror a colorized subset of events to stderr")
    .option("--yes", "Auto-approve the setup preview (required for non-TTY environments)")
    .action(async (opts) => {
      await cmdRun(opts);
    });

  program
    .command("status")
    .description("Print summary of the current run + per-agent state")
    .action(async () => {
      await cmdStatus();
    });

  program
    .command("spawn")
    .description("Run one coding agent on one issue (chat-orchestrator primitive)")
    .requiredOption("--agent <id-or-new>", "Existing agent ID or 'new' to mint a fresh general")
    .requiredOption("--issue <n>", "Issue number to work on", parsePositive)
    .requiredOption("--target-repo <owner/repo>", "Target GitHub repo")
    .option("--target-repo-path <path>", "Local clone path of the target repo")
    .option("--dry-run", "Intercept comment / PR / push tools with synthetic responses")
    .option("--verbose", "Mirror a colorized event subset to stderr")
    .option("--skip-summary", "Skip summarizer + CLAUDE.md append")
    .option("--inspect-paths <csv>", "Comma-separated absolute paths the agent may inspect read-only (e.g. prior worktrees)")
    .action(async (opts) => {
      await cmdSpawn(opts);
    });

  const agentsCmd = new Command("agents")
    .description("Agent management")
    .addCommand(
      new Command("list")
        .description("List the agent roster + specializations")
        .action(async () => {
          await cmdAgentsList();
        }),
    )
    .addCommand(
      new Command("pick")
        .description("Score the registry against a set of pending issues; print picks (no mutation)")
        .requiredOption("--issues <csv>", "Issue numbers (comma-separated)")
        .requiredOption("--target-repo <owner/repo>", "Target GitHub repo")
        .requiredOption("--parallelism <n>", "Desired parallelism", parsePositive)
        .option("--target-repo-path <path>", "Local clone path of the target repo")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsPick(opts);
        }),
    )
    .addCommand(
      new Command("specialties")
        .description("Print per-agent specialties: counts, distinctive tags, summarizer-appended lessons from each agent's CLAUDE.md")
        .option("--top-tags <n>", "Number of distinctive tags to show per agent", parsePositive, 12)
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsSpecialties(opts);
        }),
    )
    .addCommand(
      new Command("stats")
        .description(
          "Per-agent outcome rollup: merge rate, median rework, $/merge — sourced from state/outcomes/<agent>.jsonl. Polls non-terminal PRs first.",
        )
        .option(
          "--stalled-threshold-days <n>",
          "Mark an open PR as stalled after N days of inactivity (default 14)",
          parsePositive,
          DEFAULT_STALLED_THRESHOLD_DAYS,
        )
        .option("--no-poll", "Skip the GitHub poll; report only what's already on disk")
        .option("--json", "Print machine-readable JSON")
        .action(async (opts) => {
          await cmdAgentsStats(opts);
        }),
    )
    .addCommand(
      new Command("split")
        .description("Detect overload + emit a proposed split into 2-3 sub-specialists. Pass --apply to mutate the registry.")
        .argument("<agentId>", "Agent to inspect (e.g. agent-d396)")
        .option("--json", "Print machine-readable JSON")
        .option("--force", "Run the proposal even if the agent has not crossed an overload threshold")
        .option("--apply", "Apply the proposal: mint child agents, partition CLAUDE.md sections, archive parent. ONE-WAY mutation.")
        .option("--yes", "Skip the apply confirmation prompt (required for non-TTY environments).")
        .action(async (agentId, opts) => {
          await cmdAgentsSplit(agentId, opts);
        }),
    );
  program.addCommand(agentsCmd);

  return program;
}

interface RunOpts {
  agents: number;
  targetRepo: string;
  targetRepoPath?: string;
  issues?: string;
  resume?: boolean;
  dryRun?: boolean;
  maxTicks: number;
  stalledThresholdDays: number;
  verbose?: boolean;
  yes?: boolean;
}

async function cmdRun(opts: RunOpts): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "INFO: ANTHROPIC_API_KEY is not set; falling back to Claude Code OAuth credentials at ~/.claude/credentials.json.\n",
    );
  }

  if (opts.resume) {
    await runResume(opts);
    return;
  }

  if (!opts.issues) {
    console.error("ERROR: --issues is required (or pass --resume).");
    process.exit(2);
  }

  const existing = await readCurrentRunId();
  if (existing) {
    try {
      const state = await loadRunState(existing);
      if (!isRunComplete(state)) {
        console.error(
          `ERROR: unfinished run ${existing} exists. Pass --resume to continue, or wait for it to complete.`,
        );
        process.exit(2);
      }
    } catch {
      await clearCurrentRunId();
    }
  }

  const range: IssueRangeSpec = parseRangeSpec(opts.issues);
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);

  const { open, skippedClosed } = await resolveRangeToIssues(opts.targetRepo, range);
  if (open.length === 0) {
    console.error("ERROR: no open issues in range.");
    process.exit(2);
  }

  await pollOutcomesQuietly({ staleThresholdDays: opts.stalledThresholdDays });

  const registry = await loadRegistry();
  const preview = await buildSetupPreview({
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(range),
    openIssues: open,
    closedSkipped: skippedClosed,
    parallelism: opts.agents,
    dryRun: !!opts.dryRun,
    resume: false,
    registry,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const runId = makeRunId();
  const state = newRunState({
    runId,
    targetRepo: opts.targetRepo,
    issueRange: range,
    parallelism: opts.agents,
    issueIds: open.map((i) => i.id),
    dryRun: !!opts.dryRun,
  });
  await saveRunState(state);
  await writeCurrentRunId(runId);

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.started", {
    runId,
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    parallelism: opts.agents,
    range: opts.issues,
    issueCount: open.length,
    dryRun: !!opts.dryRun,
  });

  try {
    await pruneWorktrees(repoPath);
    await pruneStaleAgentBranches(repoPath, opts.targetRepo, logger);
    await runOrchestrator({
      state,
      issues: open,
      parallelism: opts.agents,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: !!opts.dryRun,
      targetRepoPath: repoPath,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: open.length,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
  process.stdout.write(`Run ${runId} log: logs/${runId}.jsonl\n`);
}

async function runResume(opts: RunOpts): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    console.error("ERROR: no current run to resume.");
    process.exit(2);
  }
  const state = await loadRunState(runId);
  downgradeInFlightToPending(state);
  await saveRunState(state);

  const repoPath = await resolveTargetRepoPath(state.targetRepo, opts.targetRepoPath);
  await pruneWorktrees(repoPath);

  const { open, skippedClosed } = await resolveRangeToIssues(state.targetRepo, state.issueRange);
  const tracked = new Set(Object.keys(state.issues).map(Number));
  const issues = open.filter((i) => tracked.has(i.id));

  await pollOutcomesQuietly({ staleThresholdDays: opts.stalledThresholdDays });

  const registry = await loadRegistry();
  const preview = await buildSetupPreview({
    targetRepo: state.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(state.issueRange),
    openIssues: issues,
    closedSkipped: skippedClosed,
    parallelism: state.parallelism,
    dryRun: state.dryRun,
    resume: true,
    registry,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.resumed", {
    runId,
    parallelism: state.parallelism,
    issueCount: issues.length,
  });
  try {
    await pruneStaleAgentBranches(repoPath, state.targetRepo, logger);
    await runOrchestrator({
      state,
      issues,
      parallelism: state.parallelism,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: state.dryRun,
      targetRepoPath: repoPath,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: issues.length,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
}

async function cmdStatus(): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    process.stdout.write("No active run.\n");
    return;
  }
  const state = await loadRunState(runId);
  const total = Object.keys(state.issues).length;
  const counts = { pending: 0, "in-flight": 0, done: 0, failed: 0 };
  for (const e of Object.values(state.issues)) counts[e.status] += 1;
  process.stdout.write(`Run ${runId} on ${state.targetRepo}\n`);
  process.stdout.write(
    `  total=${total} pending=${counts.pending} in-flight=${counts["in-flight"]} done=${counts.done} failed=${counts.failed}\n`,
  );
  process.stdout.write(`  ticks=${state.tickCount} parallelism=${state.parallelism} dryRun=${state.dryRun}\n`);
  // Resolve names from registry (best-effort — keep status read-only).
  const reg = await loadRegistry();
  const nameOf = new Map(reg.agents.map((a) => [a.agentId, a.name]));
  for (const a of state.agents) {
    const label = nameOf.get(a.agentId) ? `${nameOf.get(a.agentId)} (${a.agentId})` : a.agentId;
    process.stdout.write(`  agent ${label}: ${a.status}\n`);
  }
}

interface AgentsSpecialtiesOpts {
  topTags: number;
  json?: boolean;
}

async function cmdAgentsSpecialties(opts: AgentsSpecialtiesOpts): Promise<void> {
  const reg = await loadRegistry();
  if (reg.agents.length === 0) {
    process.stdout.write("No agents in registry yet.\n");
    return;
  }

  // Tag distinctiveness: count how many agents in the fleet carry each tag.
  // A tag is "distinctive" to an agent if it appears in at most ~1/3 of the
  // fleet — rarer tags carry more signal about what makes this agent unique.
  const tagFleetFreq = new Map<string, number>();
  for (const a of reg.agents) for (const t of a.tags) tagFleetFreq.set(t, (tagFleetFreq.get(t) ?? 0) + 1);
  const distinctiveCutoff = Math.max(2, Math.ceil(reg.agents.length / 3));

  type Profile = {
    agentId: string;
    name?: string;
    issuesHandled: number;
    implementCount: number;
    pushbackCount: number;
    errorCount: number;
    lastActiveAt: string;
    distinctiveTags: string[];
    novelLessons: string[];
  };

  const profiles: Profile[] = [];
  for (const a of reg.agents) {
    let agentMd = "";
    try {
      agentMd = await fs.readFile(agentClaudeMdPath(a.agentId), "utf-8");
    } catch {
      // Per-agent CLAUDE.md not yet forked or removed — no summarizer history.
    }
    const distinctiveTags = a.tags
      .filter((t) => (tagFleetFreq.get(t) ?? 0) <= distinctiveCutoff)
      .slice(0, opts.topTags);
    profiles.push({
      agentId: a.agentId,
      name: a.name,
      issuesHandled: a.issuesHandled,
      implementCount: a.implementCount,
      pushbackCount: a.pushbackCount,
      errorCount: a.errorCount,
      lastActiveAt: a.lastActiveAt,
      distinctiveTags,
      novelLessons: extractSummarizerLessons(agentMd),
    });
  }

  // Order: most-active first.
  profiles.sort((x, y) => y.issuesHandled - x.issuesHandled);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ profiles }, null, 2) + "\n");
    return;
  }

  for (const p of profiles) {
    const label = p.name ? `${p.name} (${p.agentId})` : p.agentId;
    process.stdout.write(
      `\n=== ${label}  handled=${p.issuesHandled}  impl=${p.implementCount}  pb=${p.pushbackCount}  err=${p.errorCount}  lastActive=${p.lastActiveAt}\n`,
    );
    process.stdout.write(
      `Distinctive tags (in ≤${distinctiveCutoff}/${reg.agents.length} agents): ${p.distinctiveTags.length > 0 ? p.distinctiveTags.join(", ") : "(none — all tags are widely shared)"}\n`,
    );
    if (p.novelLessons.length === 0) {
      process.stdout.write(`Summarizer-appended lessons: (none — agent hasn't accumulated specialization yet)\n`);
    } else {
      process.stdout.write(`Summarizer-appended lessons (${p.novelLessons.length}):\n`);
      for (const h of p.novelLessons) process.stdout.write(`  - ${h}\n`);
    }
  }
}

// Summarizer prepends each appended section with a provenance comment of the
// form `<!-- run:... issue:#N outcome:... ts:... -->` before the `## heading`
// (see appendBlock in src/agent/specialization.ts). Inherited / hand-written
// sections have no such marker, so this regex isolates exactly what the
// summarizer added across runs — robust against the target-repo seed
// changing shape after agents were forked.
const SUMMARIZER_LESSON_RE = /<!--\s*run:[^>]*?-->\s*\n## (.+)/g;

function extractSummarizerLessons(md: string): string[] {
  if (!md) return [];
  const out: string[] = [];
  for (const m of md.matchAll(SUMMARIZER_LESSON_RE)) out.push(m[1].trim());
  return out;
}

interface AgentsSplitOpts {
  json?: boolean;
  force?: boolean;
  apply?: boolean;
  yes?: boolean;
}

async function cmdAgentsSplit(agentId: string, opts: AgentsSplitOpts): Promise<void> {
  const reg = await loadRegistry();
  const agent = reg.agents.find((a) => a.agentId === agentId);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${agentId}' not found in registry.\n`);
    process.exit(2);
  }
  if (agent.archived) {
    process.stderr.write(`ERROR: agent '${agentId}' is already archived (already split).\n`);
    process.exit(2);
  }
  const { md, bytes } = await readAgentClaudeMdBytes(agentId);
  const verdict = detectOverload(agent, bytes);
  if (!verdict && !opts.force) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ agentId, overloaded: false, claudeMdBytes: bytes }, null, 2) + "\n");
      return;
    }
    process.stdout.write(
      `${agentId} has not crossed the overload threshold (issuesHandled=${agent.issuesHandled}, tags=${agent.tags.length}, CLAUDE.md=${(bytes / 1024).toFixed(1)}KB). Pass --force to propose a split anyway.\n`,
    );
    return;
  }

  process.stdout.write(`Generating split proposal for ${agentId}...\n`);
  const proposal = await proposeSplit({ agent, claudeMd: md });

  if (!opts.apply) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            agentId,
            overloaded: !!verdict,
            overloadReasons: verdict?.reasons ?? [],
            proposal,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }
    if (verdict) {
      process.stdout.write(`\nOverload verdict: ${verdict.reasons.join(", ")}\n\n`);
    }
    process.stdout.write(formatProposal(proposal) + "\n");
    return;
  }

  // --apply path: confirm with user, then mutate.
  if (proposal.clusters.length < 2) {
    process.stderr.write(
      `ERROR: cannot apply — proposal has ${proposal.clusters.length} cluster(s), need >= 2.\n${proposal.notes ?? ""}\n`,
    );
    process.exit(2);
  }
  process.stdout.write(formatProposal(proposal) + "\n\n");
  const confirmed = await confirmApply({
    agentId,
    childCount: proposal.clusters.length,
    yes: !!opts.yes,
  });
  if (!confirmed) {
    process.stdout.write("Aborted — no mutation.\n");
    return;
  }

  const result = await applySplit({ proposal, parentClaudeMd: md });
  if (opts.json) {
    process.stdout.write(JSON.stringify({ agentId, applied: true, ...result }, null, 2) + "\n");
    return;
  }
  process.stdout.write(
    `Applied. Created ${result.childIds.length} children from ${result.parentAgentId}: ${result.childIds.join(", ")}\nParent archived.\n`,
  );
}

async function confirmApply(input: {
  agentId: string;
  childCount: number;
  yes: boolean;
}): Promise<boolean> {
  if (input.yes) {
    process.stdout.write("Auto-confirmed (--yes).\n");
    return true;
  }
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to skip confirmation.\n",
    );
    return false;
  }
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `Apply split: archive ${input.agentId} and create ${input.childCount} children? [y/N] `,
      )
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function cmdAgentsList(): Promise<void> {
  const reg = await loadRegistry();
  if (reg.agents.length === 0) {
    process.stdout.write("No agents in registry yet.\n");
    return;
  }
  const headers = ["name", "agentId", "tags", "issuesHandled", "implement", "pushback", "error", "lastActive"];
  const rows = reg.agents.map((a) => [
    a.name ?? "",
    a.agentId,
    a.tags.join(","),
    String(a.issuesHandled),
    String(a.implementCount),
    String(a.pushbackCount),
    String(a.errorCount),
    a.lastActiveAt,
  ]);
  printTable(headers, rows);
}

interface SpawnOpts {
  agent: string;
  issue: number;
  targetRepo: string;
  targetRepoPath?: string;
  dryRun?: boolean;
  verbose?: boolean;
  skipSummary?: boolean;
  inspectPaths?: string;
}

async function cmdSpawn(opts: SpawnOpts): Promise<void> {
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);
  const issue = await getIssue(opts.targetRepo, opts.issue);
  if (!issue) {
    process.stderr.write(`ERROR: issue #${opts.issue} not found in ${opts.targetRepo}.\n`);
    process.exit(2);
  }
  if (issue.state === "closed") {
    process.stderr.write(`ERROR: issue #${opts.issue} is closed.\n`);
    process.exit(2);
  }

  const agent = await resolveOrMintAgent(opts.agent, repoPath);
  if (!agent) {
    process.stderr.write(`ERROR: agent '${opts.agent}' not found in registry. Pass --agent new to mint a fresh general.\n`);
    process.exit(2);
  }

  const runId = `spawn-${new Date().toISOString().replace(/[:.]/g, "-")}-issue-${opts.issue}`;
  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("spawn.started", {
    runId,
    agentId: agent.agentId,
    issueId: opts.issue,
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    dryRun: !!opts.dryRun,
    skipSummary: !!opts.skipSummary,
  });

  try {
    await fetchOriginMain(repoPath);
    await pruneWorktrees(repoPath);
    await pruneStaleAgentBranches(repoPath, opts.targetRepo, logger);

    const inspectPaths = opts.inspectPaths
      ? opts.inspectPaths.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;

    const result = await runIssueCore({
      agent,
      issue,
      targetRepo: opts.targetRepo,
      targetRepoPath: repoPath,
      runId,
      dryRun: !!opts.dryRun,
      logger,
      skipSummary: !!opts.skipSummary,
      inspectPaths,
    });

    const out = {
      runId,
      agentId: agent.agentId,
      agentTags: agent.tags,
      issueId: opts.issue,
      envelope: result.envelope ?? null,
      isError: result.isError,
      errorReason: result.errorReason ?? null,
      parseError: result.parseError ?? null,
      durationMs: result.durationMs,
      costUsd: result.costUsd ?? null,
      appendOutcome: result.appendOutcome ?? null,
      summarySkipReason: result.summarySkipReason ?? null,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } finally {
    await logger.close();
  }
}

async function resolveOrMintAgent(spec: string, repoPath: string): Promise<AgentRecord | null> {
  if (spec === "new") {
    const fresh = await mutateRegistry((reg) => createAgent(reg));
    await forkClaudeMd(fresh.agentId, repoPath);
    return fresh;
  }
  const reg = await loadRegistry();
  const found = reg.agents.find((a) => a.agentId === spec);
  return found ?? null;
}

interface PickOpts {
  issues: string;
  targetRepo: string;
  parallelism: number;
  targetRepoPath?: string;
  json?: boolean;
}

async function cmdAgentsPick(opts: PickOpts): Promise<void> {
  const ids = opts.issues
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parsePositive(s));

  const issues: IssueSummary[] = [];
  const closed: number[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const issue = await getIssue(opts.targetRepo, id);
    if (!issue) missing.push(id);
    else if (issue.state === "closed") closed.push(id);
    else issues.push(issue);
  }

  const reg = await loadRegistry();
  const result = pickAgents({
    reg,
    pendingIssues: issues,
    maxParallelism: opts.parallelism,
  });

  if (opts.json) {
    const payload = {
      targetRepo: opts.targetRepo,
      parallelism: opts.parallelism,
      issues: issues.map((i) => ({ id: i.id, title: i.title, labels: i.labels })),
      missing,
      closed,
      reusedAgents: result.reusedAgents.map((p) => ({
        agentId: p.agent.agentId,
        name: p.agent.name,
        tags: p.agent.tags,
        issuesHandled: p.agent.issuesHandled,
        score: p.score,
      })),
      newAgentsToMint: result.newAgentsToMint,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  process.stdout.write(`Picks for ${opts.targetRepo} (parallelism=${opts.parallelism}):\n`);
  process.stdout.write(`  open issues:    ${issues.length}\n`);
  if (closed.length) process.stdout.write(`  closed skipped: ${closed.length} (${closed.join(",")})\n`);
  if (missing.length) process.stdout.write(`  not found:      ${missing.length} (${missing.join(",")})\n`);
  process.stdout.write("\n");

  if (result.reusedAgents.length === 0) {
    process.stdout.write("  (no agents in registry)\n");
  } else {
    for (const p of result.reusedAgents) {
      const tagStr = p.agent.tags.length > 0 ? p.agent.tags.join(",") : "general";
      const label = p.agent.name ? `${p.agent.name} (${p.agent.agentId})` : p.agent.agentId;
      process.stdout.write(
        `  ${label}  tags=[${tagStr}]  issuesHandled=${p.agent.issuesHandled}  score=${p.score.toFixed(3)}\n`,
      );
    }
  }
  if (result.newAgentsToMint > 0) {
    process.stdout.write(`  + ${result.newAgentsToMint} fresh general agent(s) needed\n`);
  }
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  process.stdout.write(fmt(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const r of rows) process.stdout.write(fmt(r) + "\n");
}

function parsePositive(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Expected positive integer, got "${value}"`);
  }
  return n;
}

async function pollOutcomesQuietly(opts: { staleThresholdDays: number }): Promise<void> {
  // Failures here must never block the run: outcome metrics are advisory.
  // The user sees a one-liner on stderr if anything was appended.
  try {
    const result = await pollOutcomes({ staleThresholdDays: opts.staleThresholdDays });
    if (result.appended.length > 0) {
      const merged = result.appended.filter((o) => o.terminalState === "merged").length;
      const closed = result.appended.filter((o) => o.terminalState === "closed-unmerged").length;
      const stalled = result.appended.filter((o) => o.terminalState === "stalled").length;
      process.stderr.write(
        `outcomes: appended ${result.appended.length} (merged=${merged} closed=${closed} stalled=${stalled})\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`outcomes: poll skipped (${(err as Error).message})\n`);
  }
}

interface AgentsStatsOpts {
  stalledThresholdDays: number;
  poll?: boolean;
  json?: boolean;
}

async function cmdAgentsStats(opts: AgentsStatsOpts): Promise<void> {
  if (opts.poll !== false) {
    await pollOutcomesQuietly({ staleThresholdDays: opts.stalledThresholdDays });
  }
  const stats = await loadAllAgentStats();
  const reg = await loadRegistry();
  const nameOf = new Map(reg.agents.map((a) => [a.agentId, a.name]));
  const tagsOf = new Map(reg.agents.map((a) => [a.agentId, a.tags]));

  const enriched = stats.map((s) => ({
    ...s,
    name: nameOf.get(s.agentId),
    tags: tagsOf.get(s.agentId) ?? [],
  }));
  // Sort by merge-rate desc; tiebreaker = runs desc.
  enriched.sort((x, y) => y.mergeRate - x.mergeRate || y.runs - x.runs);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ agents: enriched }, null, 2) + "\n");
    return;
  }

  if (enriched.length === 0) {
    process.stdout.write("No outcomes recorded yet. Run `vp-dev run` to accumulate signal.\n");
    return;
  }

  const headers = ["agent", "tags", "runs", "merge-rate", "median-rework", "$/merge"];
  const rows = enriched.map((s) => [
    s.name ? `${s.name} (${s.agentId})` : s.agentId,
    s.tags.length > 0 ? s.tags.join(",") : "general",
    String(s.runs),
    `${Math.round(s.mergeRate * 100)}%`,
    s.medianRework == null ? "-" : String(s.medianRework),
    s.costPerMerge == null ? "-" : `$${s.costPerMerge.toFixed(2)}`,
  ]);
  printTable(headers, rows);
}
