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
