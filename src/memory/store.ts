import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir } from "../state/locks.js";

export const AGENTS_ROOT = path.resolve(process.cwd(), "agents");

export function agentDir(agentId: string): string {
  return path.join(AGENTS_ROOT, agentId);
}

export function findingsDir(agentId: string): string {
  return path.join(agentDir(agentId), "findings");
}

export function specializationPath(agentId: string): string {
  return path.join(agentDir(agentId), "specialization.md");
}

export function memoryIndexPath(agentId: string): string {
  return path.join(agentDir(agentId), "MEMORY.md");
}

export async function ensureAgentDir(agentId: string): Promise<void> {
  await ensureDir(findingsDir(agentId));
}

export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, filePath);
}

export async function listFindings(agentId: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(findingsDir(agentId));
    return entries.filter((e) => e.endsWith(".md")).map((e) => path.join(findingsDir(agentId), e));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80) || "finding";
}
