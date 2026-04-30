import { promises as fs } from "node:fs";
import {
  listFindings,
  memoryIndexPath,
  readIfExists,
  specializationPath,
} from "./store.js";
import type { AgentRecord } from "../types.js";

const MAX_TOTAL_BYTES = 8 * 1024;
const MAX_INDEX_BYTES = 2 * 1024;
const MAX_FINDINGS = 3;

export async function buildMemoryFragment(agent: AgentRecord): Promise<string> {
  const parts: string[] = [];

  const spec = await readIfExists(specializationPath(agent.agentId));
  parts.push(`# Agent ${agent.agentId} — specialization\n\n${spec ?? defaultSpecialization(agent)}`);

  const indexRaw = (await readIfExists(memoryIndexPath(agent.agentId))) ?? "";
  const index = truncateBytes(indexRaw, MAX_INDEX_BYTES);
  if (index.trim().length > 0) {
    parts.push(`## MEMORY index\n\n${index}`);
  }

  const findingPaths = await listFindings(agent.agentId);
  const stat = await Promise.all(
    findingPaths.map(async (p) => ({ path: p, mtime: (await fs.stat(p)).mtimeMs })),
  );
  stat.sort((a, b) => b.mtime - a.mtime);
  const recent = stat.slice(0, MAX_FINDINGS);

  for (const f of recent) {
    const body = await readIfExists(f.path);
    if (!body) continue;
    parts.push(`## Recent finding (${pathBasename(f.path)})\n\n${body}`);
  }

  return truncateBytes(parts.join("\n\n---\n\n"), MAX_TOTAL_BYTES);
}

function defaultSpecialization(agent: AgentRecord): string {
  return `---
agentId: ${agent.agentId}
issuesHandled: 0
tags: [general]
updatedAt: ${agent.createdAt}
---

New agent. No prior issues handled. Tags: general.
`;
}

function truncateBytes(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, "utf-8");
  if (buf.length <= maxBytes) return input;
  return buf.subarray(0, maxBytes).toString("utf-8") + "\n...[truncated]";
}

function pathBasename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}
