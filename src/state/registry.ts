import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteJson, STATE_DIR } from "./runState.js";
import { withFileLock } from "./locks.js";
import type { AgentRecord, AgentRegistryFile } from "../types.js";

export const REGISTRY_FILE = path.join(STATE_DIR, "agents-registry.json");

export async function loadRegistry(): Promise<AgentRegistryFile> {
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    return JSON.parse(raw) as AgentRegistryFile;
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
    };
    reg.agents.push(rec);
  }
  return rec;
}

export function createAgent(reg: AgentRegistryFile): AgentRecord {
  let id = newAgentId();
  while (reg.agents.some((a) => a.agentId === id)) id = newAgentId();
  return ensureAgent(reg, id);
}
