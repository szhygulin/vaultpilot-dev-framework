import { z } from "zod";

export type IssueRangeSpec =
  | { kind: "range"; from: number; to: number }
  | { kind: "csv"; ids: number[] }
  | { kind: "all-open" };

export type AgentStatus = "idle" | "in-flight";

// `aborted-budget` is a terminal state distinct from `failed`: not a coding-agent
// error, an operator policy decision. Set by the orchestrator when the run's
// accumulated spend crosses `--max-cost-usd` BEFORE the issue was dispatched.
// In-flight issues complete naturally; only `pending` issues at the moment of
// the budget-exceeded check are marked `aborted-budget`. The summarizer does
// NOT write a lesson for these issues (incomplete signal, no run happened).
export type IssueStatus =
  | "pending"
  | "in-flight"
  | "done"
  | "failed"
  | "aborted-budget";

export type AgentDecision = "implement" | "pushback" | "error";

export interface AgentRecord {
  agentId: string;
  createdAt: string;
  tags: string[];
  issuesHandled: number;
  implementCount: number;
  pushbackCount: number;
  errorCount: number;
  lastActiveAt: string;
  // Optional display label, lazy-filled by registry helpers when first
  // touched. Display-only — agentId remains the canonical handle in branch
  // names, agent dir paths, log events, lock keys, and the agent's own
  // prompt header.
  name?: string;
  // Set true once an agent has been split into children. Routing skips
  // archived agents but their history survives in the registry. Optional
  // for back-compat with pre-split records.
  archived?: boolean;
  // ISO-8601 timestamp recorded when `archived` flips true. Lets the
  // registry alone answer "when was this agent archived?" without
  // cross-referencing run logs. Optional for back-compat.
  archivedAt?: string;
  // The child agentIds minted from this parent at split time. Forward
  // pointer for the audit trail — given a parent record, you can find
  // the children that inherited its sections without scanning every
  // other record. Optional for back-compat.
  splitInto?: string[];
  // Parent agentId, populated on a child minted by `vp-dev agents split`.
  // Optional for back-compat.
  parentAgentId?: string;
  // Set on the absorbed agent when `vp-dev agents prune --apply` merges two
  // overlapping specialists. Points at the surviving agent. Optional for
  // back-compat with pre-prune records.
  mergedInto?: string;
}

export interface AgentRegistryFile {
  agents: AgentRecord[];
}

export interface RunAgentEntry {
  agentId: string;
  status: AgentStatus;
}

export interface RunIssueEntry {
  status: IssueStatus;
  agentId?: string;
  outcome?: AgentDecision;
  prUrl?: string;
  commentUrl?: string;
  // Primary error string. Prefers the SDK `errorSubtype` (e.g.
  // `error_max_turns`, `error_during_execution`) when the agent crashed
  // before emitting an envelope, then falls back to `errorReason`, then to
  // `parseError`. This keeps two distinct failure classes (genuine envelope
  // parser bug vs. simply ran out of turns) from collapsing into one
  // indistinguishable string in run-state files. See issue #87.
  error?: string;
  // Set when the orchestrator's safety-net pushed in-flight worktree edits
  // to a labeled `<branch>-incomplete-<runId>` ref after a non-clean exit
  // (today: `error_max_turns`). The agent's primary branch may also have
  // been deleted by the post-run cleanup; this URL preserves the partial
  // work for human inspection. See issue #88.
  partialBranchUrl?: string;
  // SDK result subtype when the run ended in error (`error_max_turns`,
  // `error_max_budget_usd`, `error_during_execution`, ...). Optional; absent
  // for legacy entries and for envelope-decision-error / uncaught-throw
  // paths where no SDK subtype is available.
  errorSubtype?: string;
  // Envelope parse error preserved as a secondary diagnostic so a genuine
  // parser bug stays visible even when `error` carries the SDK subtype.
  // Optional; only populated on no-envelope failure paths where
  // extractEnvelope failed.
  parseError?: string;
}

// A `vp-dev/agent-*/issue-*` branch the stale-branch sweep determined was
// dead (no open PR) but could not delete because the branch is still
// attached to a worktree. Surfaced into RunState so the user can grep
// `state/<runId>.json` for accumulated cleanup-needed entries — see issue
// #63 for the rationale (single dim warning per run was too easy to miss).
export interface UnprunableStaleBranch {
  branch: string;
  agentId: string;
  issueId: number;
  // Worktree path parsed out of the `git branch -D` error message
  // (`used by worktree at '<path>'`). Optional in case the error format
  // changes in a future git release — fall back to `reason` then.
  worktreePath?: string;
  reason: string;
}

export interface RunState {
  runId: string;
  targetRepo: string;
  issueRange: IssueRangeSpec;
  parallelism: number;
  agents: RunAgentEntry[];
  issues: Record<string, RunIssueEntry>;
  tickCount: number;
  lastTickAt: string;
  startedAt: string;
  dryRun: boolean;
  // Populated by the stale-branch sweep at run start. Optional for
  // back-compat with run states written before #63.
  unprunableStaleBranches?: UnprunableStaleBranch[];
  // Per-run cost ceiling in USD, snapshotted at run start so `vp-dev run
  // --resume` can re-apply the same budget without the operator memorizing
  // the flag. Optional for back-compat with runs minted before #86.
  maxCostUsd?: number;
}

export const ResultEnvelopeSchema = z.object({
  decision: z.enum(["implement", "pushback", "error"]),
  reason: z.string().min(1),
  prUrl: z.string().optional(),
  commentUrl: z.string().optional(),
  scopeNotes: z.string().optional(),
  memoryUpdate: z.object({
    addTags: z.array(z.string()).default([]),
    removeTags: z.array(z.string()).optional(),
  }),
});

export type ResultEnvelope = z.infer<typeof ResultEnvelopeSchema>;

export const TickAssignmentSchema = z.object({
  agentId: z.string().min(1),
  issueId: z.number().int().positive(),
});

export const TickProposalSchema = z.object({
  assignments: z.array(TickAssignmentSchema),
});

export type TickAssignment = z.infer<typeof TickAssignmentSchema>;
export type TickProposal = z.infer<typeof TickProposalSchema>;

export interface IssueSummary {
  id: number;
  title: string;
  labels: string[];
  state: "open" | "closed";
}
