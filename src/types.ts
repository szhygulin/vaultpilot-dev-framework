import { z } from "zod";

export type IssueRangeSpec =
  | { kind: "range"; from: number; to: number }
  | { kind: "csv"; ids: number[] }
  | { kind: "all-open" };

export type AgentStatus = "idle" | "in-flight";

export type IssueStatus = "pending" | "in-flight" | "done" | "failed";

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
  error?: string;
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
