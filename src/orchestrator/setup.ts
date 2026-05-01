import { createInterface } from "node:readline/promises";
import type { AgentRegistryFile, IssueSummary } from "../types.js";
import { pickAgents, type PickedAgent } from "./orchestrator.js";

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
}

export function buildSetupPreview(input: BuildPreviewInput): SetupPreview {
  const pick = pickAgents({
    reg: input.registry,
    pendingIssues: input.openIssues,
    desiredParallelism: input.parallelism,
  });
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
  lines.push(`  Parallelism:    ${p.parallelism}`);
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
        `  ${label}  tags=[${tagStr}]  issuesHandled=${r.agent.issuesHandled}  score=${r.score.toFixed(3)}`,
      );
    }
  }
  if (p.newAgentsToMint > 0) {
    lines.push(`  + ${p.newAgentsToMint} fresh general agent(s) to fill remaining slot(s)`);
  }
  lines.push("");

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
