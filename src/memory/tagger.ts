import path from "node:path";
import {
  ensureAgentDir,
  findingsDir,
  memoryIndexPath,
  readIfExists,
  slugify,
  specializationPath,
  writeFileAtomic,
} from "./store.js";
import type { AgentRecord, ResultEnvelope } from "../types.js";

const MAX_INDEX_LINES = 20;

export interface ApplyOpts {
  agent: AgentRecord;
  envelope: ResultEnvelope;
  issueId: number;
}

export async function applyMemoryUpdate(opts: ApplyOpts): Promise<void> {
  await ensureAgentDir(opts.agent.agentId);
  await updateTags(opts.agent, opts.envelope);
  await writeSpecialization(opts.agent);
  if (opts.envelope.memoryUpdate.findingTitle && opts.envelope.memoryUpdate.findingBody) {
    await writeFinding(opts.agent.agentId, {
      title: opts.envelope.memoryUpdate.findingTitle,
      body: opts.envelope.memoryUpdate.findingBody,
      issueId: opts.issueId,
    });
  }
  await appendMemoryIndex(opts.agent.agentId, {
    issueId: opts.issueId,
    decision: opts.envelope.decision,
    reason: opts.envelope.reason,
    findingTitle: opts.envelope.memoryUpdate.findingTitle,
  });
}

async function updateTags(agent: AgentRecord, env: ResultEnvelope): Promise<void> {
  const tags = new Set(agent.tags);
  for (const t of env.memoryUpdate.addTags) tags.add(t.toLowerCase());
  for (const t of env.memoryUpdate.removeTags ?? []) tags.delete(t.toLowerCase());
  if (tags.size === 0) tags.add("general");
  agent.tags = [...tags].sort();
  agent.lastActiveAt = new Date().toISOString();
}

async function writeSpecialization(agent: AgentRecord): Promise<void> {
  const frontmatter = [
    "---",
    `agentId: ${agent.agentId}`,
    `issuesHandled: ${agent.issuesHandled}`,
    `tags: [${agent.tags.join(", ")}]`,
    `updatedAt: ${agent.lastActiveAt}`,
    "---",
    "",
  ].join("\n");

  const existing = (await readIfExists(specializationPath(agent.agentId))) ?? "";
  const prose = stripFrontmatter(existing).trim();
  const truncatedProse = prose.length > 500 ? prose.slice(0, 500) : prose;
  const body = truncatedProse.length > 0 ? truncatedProse : autoProse(agent);
  await writeFileAtomic(specializationPath(agent.agentId), `${frontmatter}${body}\n`);
}

function autoProse(agent: AgentRecord): string {
  if (agent.tags.length === 1 && agent.tags[0] === "general") {
    return "General-purpose agent. No specialization yet.";
  }
  return `Specializes in: ${agent.tags.filter((t) => t !== "general").join(", ")}.`;
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end < 0) return content;
  return content.slice(end + 4).replace(/^\n+/, "");
}

async function writeFinding(
  agentId: string,
  f: { title: string; body: string; issueId: number },
): Promise<void> {
  const slug = slugify(f.title);
  const filePath = path.join(findingsDir(agentId), `${slug}.md`);
  const now = new Date().toISOString();
  const content = [
    "---",
    `title: ${escapeYaml(f.title)}`,
    `issueId: ${f.issueId}`,
    `createdAt: ${now}`,
    "---",
    "",
    f.body,
    "",
  ].join("\n");
  await writeFileAtomic(filePath, content);
}

function escapeYaml(s: string): string {
  if (/[:#\n"']/.test(s)) return JSON.stringify(s);
  return s;
}

interface IndexEntry {
  issueId: number;
  decision: string;
  reason: string;
  findingTitle?: string;
}

async function appendMemoryIndex(agentId: string, entry: IndexEntry): Promise<void> {
  const existing = (await readIfExists(memoryIndexPath(agentId))) ?? "";
  const lines = existing.split("\n").filter((l) => l.trim().length > 0);
  const newLine = `- #${entry.issueId} [${entry.decision}] — ${truncateLine(entry.reason)}${
    entry.findingTitle ? ` (finding: ${entry.findingTitle})` : ""
  }`;
  lines.unshift(newLine);
  const trimmed = lines.slice(0, MAX_INDEX_LINES);
  await writeFileAtomic(memoryIndexPath(agentId), trimmed.join("\n") + "\n");
}

function truncateLine(s: string): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? oneLine.slice(0, 197) + "..." : oneLine;
}
