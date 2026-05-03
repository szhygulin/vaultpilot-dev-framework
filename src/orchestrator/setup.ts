import { createInterface } from "node:readline/promises";
import type { AgentRegistryFile, IssueSummary } from "../types.js";
import { pickAgents, type PickedAgent } from "./orchestrator.js";
import {
  detectOverload,
  readAgentClaudeMdBytes,
  type OverloadVerdict,
} from "../agent/split.js";

export interface TriageSkipped {
  issue: IssueSummary;
  reason: string;
}

export interface OpenPrSkipped {
  issue: IssueSummary;
  prNumber: number;
  prUrl: string;
}

export interface SetupPreview {
  targetRepo: string;
  targetRepoPath: string;
  rangeLabel: string;
  openIssues: IssueSummary[];
  closedSkipped: number[];
  parallelism: number;
  dryRun: boolean;
  resume: boolean;
  reusedAgents: PickedAgent[];
  newAgentsToMint: number;
  authorized: number;
  planned: number;
  specialistCount: number;
  generalCount: number;
  overloadWarnings: OverloadVerdict[];
  // Issues filtered out by pre-dispatch triage (haiku rubric). Surfaced in
  // the gate so the user can see what is being dropped before y/N. When
  // --include-non-ready is passed, triage is skipped and this is empty.
  triageSkipped: TriageSkipped[];
  // Issues filtered out because an open vp-dev PR already covers them.
  // Re-dispatching would race the stale-sweep + create-worktree path (issue
  // #62: branch collision -> error.agent.uncaught). The smallest fix is to
  // let the existing PR land before re-dispatch.
  openPrSkipped: OpenPrSkipped[];
}

export interface BuildPreviewInput {
  targetRepo: string;
  targetRepoPath: string;
  rangeLabel: string;
  openIssues: IssueSummary[];
  closedSkipped: number[];
  parallelism: number;
  dryRun: boolean;
  resume: boolean;
  registry: AgentRegistryFile;
  triageSkipped?: TriageSkipped[];
  openPrSkipped?: OpenPrSkipped[];
}

export async function buildSetupPreview(input: BuildPreviewInput): Promise<SetupPreview> {
  const pick = pickAgents({
    reg: input.registry,
    pendingIssues: input.openIssues,
    maxParallelism: input.parallelism,
  });
  // Surface overload warnings for any picked agent that has crossed the
  // split threshold. Cheap (one fs.readFile per picked agent) and runs
  // before the y/N gate, so the user can decide whether to split first.
  const overloadWarnings: OverloadVerdict[] = [];
  for (const r of pick.reusedAgents) {
    const { bytes } = await readAgentClaudeMdBytes(r.agent.agentId);
    const verdict = detectOverload(r.agent, bytes);
    if (verdict) overloadWarnings.push(verdict);
  }
  return {
    targetRepo: input.targetRepo,
    targetRepoPath: input.targetRepoPath,
    rangeLabel: input.rangeLabel,
    openIssues: input.openIssues,
    closedSkipped: input.closedSkipped,
    parallelism: input.parallelism,
    dryRun: input.dryRun,
    resume: input.resume,
    reusedAgents: pick.reusedAgents,
    newAgentsToMint: pick.newAgentsToMint,
    authorized: pick.authorized,
    planned: pick.planned,
    specialistCount: pick.specialistCount,
    generalCount: pick.generalCount,
    overloadWarnings,
    triageSkipped: input.triageSkipped ?? [],
    openPrSkipped: input.openPrSkipped ?? [],
  };
}

export function formatSetupPreview(p: SetupPreview): string {
  const lines: string[] = [];
  lines.push("Run setup");
  lines.push("=========");
  lines.push(`  Target repo:    ${p.targetRepo}`);
  lines.push(`  Local path:     ${p.targetRepoPath}`);
  lines.push(`  Issue range:    ${p.rangeLabel}`);
  lines.push(
    `  Open issues:    ${p.openIssues.length}` +
      (p.closedSkipped.length > 0 ? `  (closed skipped: ${p.closedSkipped.length})` : ""),
  );
  lines.push(`  Authorized:     ${p.authorized} (--agents)`);
  // The "planned" line is the single most informative cost-surface number
  // — it's what will actually consume API budget, vs. the headroom the user
  // authorized. Kept on its own line so eyes lock on it before y/N.
  const freshNote = p.newAgentsToMint > 0 ? ` + ${p.newAgentsToMint} fresh` : "";
  lines.push(
    `  Planned:        ${p.planned} (${p.specialistCount} specialist, ${p.generalCount} general${freshNote})`,
  );
  lines.push(`  Dry run:        ${p.dryRun ? "yes" : "no"}`);
  lines.push(`  Resume:         ${p.resume ? "yes" : "no"}`);
  lines.push("");

  lines.push("Agents to summon:");
  if (p.reusedAgents.length === 0) {
    lines.push("  (none from registry)");
  } else {
    for (const r of p.reusedAgents) {
      const tagStr = r.agent.tags.length > 0 ? r.agent.tags.join(",") : "general";
      const label = r.agent.name ? `${r.agent.name} (${r.agent.agentId})` : r.agent.agentId;
      lines.push(
        `  ${label}  rationale=${r.rationale}  tags=[${tagStr}]  issuesHandled=${r.agent.issuesHandled}  score=${r.score.toFixed(3)}`,
      );
    }
  }
  if (p.newAgentsToMint > 0) {
    lines.push(`  + ${p.newAgentsToMint} fresh general agent(s) to fill remaining slot(s)`);
  }
  lines.push("");

  if (p.overloadWarnings.length > 0) {
    lines.push("Overload warnings:");
    for (const w of p.overloadWarnings) {
      lines.push(`  WARNING: ${w.agentId} crossed split threshold — ${w.reasons.join(", ")}`);
      lines.push(`    Run \`vp-dev agents split ${w.agentId}\` to view a split proposal.`);
    }
    lines.push("");
  }

  if (p.triageSkipped.length > 0) {
    lines.push(`${p.triageSkipped.length} issue(s) skipped by triage:`);
    for (const s of p.triageSkipped) {
      lines.push(`  #${s.issue.id} — ${s.reason}`);
    }
    lines.push("  Override with --include-non-ready.");
    lines.push("");
  }

  if (p.openPrSkipped.length > 0) {
    lines.push(`${p.openPrSkipped.length} issue(s) skipped — open vp-dev PR already covers them:`);
    for (const s of p.openPrSkipped) {
      lines.push(`  #${s.issue.id} — PR #${s.prNumber}: ${s.prUrl}`);
    }
    lines.push("  Let the PR land (or close it) before re-dispatching.");
    lines.push("");
  }

  lines.push("Issues to address:");
  const ids = p.openIssues.map((i) => i.id);
  lines.push(`  ${formatIdList(ids)}`);
  return lines.join("\n");
}

function formatIdList(ids: number[]): string {
  if (ids.length <= 12) return ids.join(", ");
  const head = ids.slice(0, 6).join(", ");
  const tail = ids.slice(-3).join(", ");
  return `${head}, ..., ${tail}  (${ids.length} total)`;
}

export interface ApprovalInput {
  preview: SetupPreview;
  yes: boolean;
}

export async function approveSetup(input: ApprovalInput): Promise<boolean> {
  process.stdout.write(formatSetupPreview(input.preview));
  process.stdout.write("\n\n");

  if (input.yes) {
    process.stdout.write("Auto-approved (--yes).\n");
    return true;
  }
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "ERROR: stdin is not a TTY and --yes was not passed. Re-run with --yes to skip the approval gate.\n",
    );
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
