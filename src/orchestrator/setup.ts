import { createInterface } from "node:readline/promises";
import type { AgentRegistryFile, IssueSummary } from "../types.js";
import { pickAgents, type PickedAgent } from "./orchestrator.js";
import {
  detectOverload,
  readAgentClaudeMdBytes,
  type OverloadVerdict,
} from "../agent/split.js";
import type { BudgetExceededSkipped } from "./costEstimator.js";

export interface TriageSkipped {
  issue: IssueSummary;
  reason: string;
}

// Per-issue cost estimate surfaced in the gate. One entry per dispatched
// issue plus one per skipped-over-budget issue (issue #99). Read by the
// renderer to show the user which issues fit the cost ceiling and which
// don't, before y/N approval.
export interface IssueCostForecastEntry {
  issueId: number;
  estimateUsd: number;
  source: "plan" | "fallback";
  fileCount?: number;
  planFile?: string;
}

// Issues filtered out because an open vp-dev PR already covers them. See
// issue #62: re-dispatching the same (agent, issue) pair throws on
// `git worktree add -b` because the branch from the prior run still
// exists. Skipping is the safe default — let the open PR land first.
export interface OpenPrSkipped {
  issue: IssueSummary;
  agentId: string;
  branch: string;
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
  // Always enforced — there is no override flag (close the PR first, or
  // use `vp-dev spawn` against a one-off agent if you really need parallel
  // attempts).
  openPrSkipped: OpenPrSkipped[];
  // Total $ already spent by pre-dispatch triage (haiku rubric) for this
  // run. `undefined` when triage was bypassed (--include-non-ready) — the
  // gate omits the line entirely in that case rather than showing $0,
  // since "no triage" and "triage was free" are different signals (per
  // issue #55 acceptance: "the line is omitted, not zero-valued").
  triageCostUsd?: number;
  // Per-issue cost forecasts in dispatch order. Includes both dispatched
  // and skipped-over-budget issues, so the gate text can show every
  // estimate the user is being asked to approve.
  costForecast: IssueCostForecastEntry[];
  // Issues whose individual estimate exceeded the remaining budget at the
  // moment of evaluation. Same skip-and-surface pattern as `triageSkipped`
  // and `openPrSkipped`. Empty when no `--max-cost-usd` was set.
  budgetExceededSkipped: BudgetExceededSkipped[];
  // Run-level cost ceiling (USD) — `undefined` means no ceiling. Surfaces
  // alongside the triage line and as the anchor for "remaining budget"
  // arithmetic in the per-issue forecast block.
  budgetUsd?: number;
  /**
   * Issue #84: per-run agent override echoed into the preview so a)
   * `formatSetupPreview` can annotate the matching rationale line with
   * `(preferred via --prefer-agent)`, and b) the previewHash that gates
   * the `--plan`/`--confirm` flow is bound to the override that was
   * active at plan time.
   */
  preferAgentId?: string;
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
  triageCostUsd?: number;
  costForecast?: IssueCostForecastEntry[];
  budgetExceededSkipped?: BudgetExceededSkipped[];
  budgetUsd?: number;
  /** Issue #84: per-run agent override. When set, the preview's
   *  rationale line for the matching agent gets a `(preferred via
   *  --prefer-agent)` annotation so the user sees the override took
   *  effect. The string is also incorporated into the previewHash, so a
   *  `--plan` token is bound to the override that was active at plan
   *  time. */
  preferAgentId?: string;
}

export async function buildSetupPreview(input: BuildPreviewInput): Promise<SetupPreview> {
  const pick = pickAgents({
    reg: input.registry,
    pendingIssues: input.openIssues,
    maxParallelism: input.parallelism,
    preferAgentId: input.preferAgentId,
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
    triageCostUsd: input.triageCostUsd,
    costForecast: input.costForecast ?? [],
    budgetExceededSkipped: input.budgetExceededSkipped ?? [],
    budgetUsd: input.budgetUsd,
    preferAgentId: input.preferAgentId,
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
  // Triage cost is "already incurred" — it ran before the gate and is
  // shown so the user sees the small haiku-call cost the run already paid
  // (and will pay again if they re-run). Omitted entirely when triage was
  // bypassed via --include-non-ready (per issue #55: not zero-valued).
  if (p.triageCostUsd !== undefined) {
    lines.push(`  Triage cost:    ~$${p.triageCostUsd.toFixed(4)} (already incurred)`);
  }
  // Cost ceiling — the anchor for the per-issue forecast block below.
  // Shown only when the user passed --max-cost-usd / VP_DEV_MAX_COST_USD;
  // a "no ceiling" run still gets the per-issue forecast (so the user can
  // see what they're authorizing) but no skip partition.
  if (p.budgetUsd !== undefined) {
    lines.push(`  Cost ceiling:   $${p.budgetUsd.toFixed(2)} (--max-cost-usd)`);
  }
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
      // Issue #84: surface --prefer-agent overrides on the rationale line
      // so the user sees the override took effect before y/N. The
      // annotation is bound into the previewHash so a `--plan` token
      // can't silently outlive a flag change.
      const preferTag = r.preferred ? "  (preferred via --prefer-agent)" : "";
      lines.push(
        `  ${label}  rationale=${r.rationale}  tags=[${tagStr}]  issuesHandled=${r.agent.issuesHandled}  score=${r.score.toFixed(3)}${preferTag}`,
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
      lines.push(`  #${s.issue.id} — ${s.prUrl} (branch ${s.branch})`);
    }
    lines.push(
      "  The PR from the prior run is the in-flight work. Let it land (or close it) before re-dispatching.",
    );
    lines.push("");
  }

  // Per-issue cost forecast (#99). Always shown when there are dispatch
  // candidates — the forecast itself is the value-add, independent of
  // whether a budget ceiling is set. The "remaining budget" line + the
  // skip block below only fire when --max-cost-usd is set.
  if (p.costForecast.length > 0) {
    lines.push("Per-issue cost forecast:");
    for (const f of p.costForecast) {
      lines.push(`  #${f.issueId}  ~$${f.estimateUsd.toFixed(2)}  ${describeForecastSource(f)}`);
    }
    const total = p.costForecast.reduce((sum, f) => sum + f.estimateUsd, 0);
    if (p.budgetUsd !== undefined) {
      const triageSpent = p.triageCostUsd ?? 0;
      const remaining = p.budgetUsd - triageSpent;
      const fitsMark = total <= remaining ? "✓ fits" : "✗ exceeds";
      lines.push(
        `  TOTAL: ~$${total.toFixed(2)} forecast against $${remaining.toFixed(2)} remaining budget — ${fitsMark}`,
      );
    } else {
      lines.push(`  TOTAL: ~$${total.toFixed(2)} forecast (no --max-cost-usd set)`);
    }
    lines.push("");
  }

  if (p.budgetExceededSkipped.length > 0) {
    lines.push(`${p.budgetExceededSkipped.length} issue(s) skipped — exceeds remaining budget:`);
    for (const s of p.budgetExceededSkipped) {
      lines.push(
        `  #${s.issue.id}  ~$${s.estimateUsd.toFixed(2)} forecast — exceeds $${s.remainingBudgetUsd.toFixed(2)} remaining at issue-time`,
      );
    }
    lines.push(
      `  Override: raise --max-cost-usd, or split the issue per CLAUDE.md "Pre-dispatch scope-fit check" rule.`,
    );
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

function describeForecastSource(f: IssueCostForecastEntry): string {
  if (f.source === "fallback") return "(no plan; fallback estimate)";
  return `(${f.fileCount ?? 0}-file plan)`;
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
