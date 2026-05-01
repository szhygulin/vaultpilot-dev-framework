import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteJson, STATE_DIR } from "./runState.js";
import { withFileLock } from "./locks.js";
import { pickName } from "./names.js";
import type { AgentRecord, AgentRegistryFile } from "../types.js";

export const REGISTRY_FILE = path.join(STATE_DIR, "agents-registry.json");

export async function loadRegistry(): Promise<AgentRegistryFile> {
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AgentRegistryFile;
    // Lazy fill: pre-name records inherited from before this field existed.
    // The JSON on disk only mutates on the next `mutateRegistry` write —
    // safe to no-op into a read-only display path.
    return { ...parsed, agents: fillNames(parsed) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { agents: [] };
    throw err;
  }
}

export async function saveRegistry(reg: AgentRegistryFile): Promise<void> {
  await withFileLock(REGISTRY_FILE, async () => {
    await atomicWriteJson(REGISTRY_FILE, reg);
  });
}

export async function mutateRegistry<T>(
  fn: (reg: AgentRegistryFile) => T | Promise<T>,
): Promise<T> {
  return withFileLock(REGISTRY_FILE, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") raw = '{"agents":[]}';
      else throw err;
    }
    const reg = JSON.parse(raw) as AgentRegistryFile;
    // Lazy migration: populate `name` on any pre-existing record before the
    // mutation runs, so the persisted JSON accrues names without a one-shot
    // migration script. The fn may add or rename agents; ensureAgent /
    // createAgent themselves call pickName, so additions land with a name.
    reg.agents = fillNames(reg);
    const result = await fn(reg);
    await atomicWriteJson(REGISTRY_FILE, reg);
    return result;
  });
}

export function newAgentId(): string {
  const suffix = crypto.randomBytes(2).toString("hex");
  return `agent-${suffix}`;
}

export function ensureAgent(reg: AgentRegistryFile, agentId: string): AgentRecord {
  let rec = reg.agents.find((a) => a.agentId === agentId);
  if (!rec) {
    const now = new Date().toISOString();
    rec = {
      agentId,
      createdAt: now,
      tags: ["general"],
      issuesHandled: 0,
      implementCount: 0,
      pushbackCount: 0,
      errorCount: 0,
      lastActiveAt: now,
      name: pickName(agentId, takenNames(reg)),
    };
    reg.agents.push(rec);
  } else if (!rec.name) {
    // Lazy migration for pre-existing records: fill on next touch. The
    // mutated record persists at the next `mutateRegistry` write.
    rec.name = pickName(rec.agentId, takenNames(reg, rec.agentId));
  }
  return rec;
}

/**
 * Lazy-fill names for every record currently lacking one. Called by callers
 * that read the registry purely for display (e.g. `agents list`, setup
 * preview) and don't want to mutate it. Returns a new array — does NOT
 * persist. Pre-existing names are preserved.
 */
export function fillNames(reg: AgentRegistryFile): AgentRecord[] {
  const taken = new Set(reg.agents.map((a) => a.name).filter((n): n is string => !!n));
  const out: AgentRecord[] = [];
  for (const a of reg.agents) {
    if (a.name) {
      out.push(a);
      continue;
    }
    const name = pickName(a.agentId, taken);
    taken.add(name);
    out.push({ ...a, name });
  }
  return out;
}

function takenNames(reg: AgentRegistryFile, exceptAgentId?: string): string[] {
  const out: string[] = [];
  for (const a of reg.agents) {
    if (a.agentId === exceptAgentId) continue;
    if (a.name) out.push(a.name);
  }
  return out;
}

export function createAgent(reg: AgentRegistryFile): AgentRecord {
  let id = newAgentId();
  while (reg.agents.some((a) => a.agentId === id)) id = newAgentId();
  return ensureAgent(reg, id);
}
