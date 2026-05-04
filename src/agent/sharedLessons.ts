// Cross-agent shared-lessons pool — read-only at agent runtime, write-only
// via curated promotion (`vp-dev lessons review`). See feature plan in
// `feature-plans/issue-33-shared-lessons-pool.md`.
//
// Layout: `agents/.shared/lessons/<domain>.md`. Domain == any tag the
// agent fingerprint exposes (lowercase, dash-separated, e.g. `solana`,
// `eip-712`). The directory lives under the same `agents/` tree that is
// already gitignored, so pool files never leak into the target repo.
//
// Boundary preservation: appendLessonToPool is invoked exclusively by the
// orchestrator-side review CLI. The coding-agent workflow (`renderWorkflow`
// in `workflow.ts`) carries an explicit "never write to agents/.shared/"
// guard, and the agent's worktree CWD is outside this path anyway.

import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";
import { AGENTS_ROOT } from "./specialization.js";
import {
  isValidDomain,
  validateEntry,
  type ValidationResult,
} from "../util/promotionMarkers.js";

export const SHARED_LESSONS_DIR = path.join(AGENTS_ROOT, ".shared", "lessons");

/**
 * Pool-file size cap. Once exceeded, append refuses with a "trim first"
 * outcome so prompt seeding stays bounded for every agent that loads this
 * domain.
 */
export const MAX_POOL_LINES = 200;

export function sharedLessonsPath(domain: string): string {
  if (!isValidDomain(domain)) {
    throw new Error(`Invalid domain '${domain}': expected lowercase dash-separated tag.`);
  }
  return path.join(SHARED_LESSONS_DIR, `${domain}.md`);
}

export interface PoolSummary {
  domain: string;
  filePath: string;
  totalLines: number;
  bytes: number;
}

export async function listSharedLessonDomains(): Promise<PoolSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(SHARED_LESSONS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: PoolSummary[] = [];
  for (const e of entries.sort()) {
    if (!e.endsWith(".md")) continue;
    const domain = e.slice(0, -3);
    if (!isValidDomain(domain)) continue;
    const filePath = path.join(SHARED_LESSONS_DIR, e);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      out.push({
        domain,
        filePath,
        totalLines: content.split("\n").length,
        bytes: Buffer.byteLength(content, "utf-8"),
      });
    } catch {
      // skip unreadable
    }
  }
  return out;
}

export interface DomainContent {
  domain: string;
  content: string;
}

/**
 * Load every pool whose domain matches a tag in `domains`. Missing files
 * are skipped silently (a domain may simply not have an accumulated pool
 * yet). Returns in caller-provided domain order so prompt seeding is
 * deterministic.
 */
export async function readSharedLessonsForDomains(
  domains: string[],
): Promise<DomainContent[]> {
  const out: DomainContent[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    if (!isValidDomain(domain) || seen.has(domain)) continue;
    seen.add(domain);
    try {
      const content = await fs.readFile(sharedLessonsPath(domain), "utf-8");
      if (content.trim().length > 0) {
        out.push({ domain, content });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return out;
}

export interface AppendLessonInput {
  domain: string;
  body: string;
  sourceAgentId: string;
  issueId: number;
  ts?: string;
}

export type AppendLessonOutcome =
  | { kind: "appended"; totalLines: number; filePath: string }
  | { kind: "rejected-pool-full"; totalLines: number; filePath: string }
  | { kind: "rejected-validation"; validation: ValidationResult };

export async function appendLessonToPool(
  input: AppendLessonInput,
): Promise<AppendLessonOutcome> {
  const validation = validateEntry(input.body);
  if (!validation.ok) {
    return { kind: "rejected-validation", validation };
  }
  const ts = input.ts ?? new Date().toISOString();
  const filePath = sharedLessonsPath(input.domain);
  return withFileLock(filePath, async () => {
    await ensureDir(SHARED_LESSONS_DIR);
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (current.length === 0) {
      current = poolHeader(input.domain);
    }
    const entry = formatEntryBlock({
      sourceAgentId: input.sourceAgentId,
      issueId: input.issueId,
      ts,
      body: input.body,
    });
    const next = current.endsWith("\n") ? current + entry : current + "\n" + entry;
    const totalLines = next.split("\n").length;
    if (totalLines > MAX_POOL_LINES) {
      return { kind: "rejected-pool-full", totalLines, filePath };
    }
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
    return { kind: "appended", totalLines, filePath };
  });
}

function poolHeader(domain: string): string {
  return [
    `# Shared lessons: ${domain}`,
    "",
    `Curated cross-agent lessons for the \`${domain}\` domain. Read-only at`,
    "agent runtime; entries promoted via `vp-dev lessons review` after the",
    "human reviewer accepts a `<!-- promote-candidate -->` block from a",
    "sibling agent's CLAUDE.md.",
    "",
    "",
  ].join("\n");
}

function formatEntryBlock(input: {
  sourceAgentId: string;
  issueId: number;
  ts: string;
  body: string;
}): string {
  return [
    `<!-- entry source:${input.sourceAgentId} issue:#${input.issueId} ts:${input.ts} -->`,
    input.body.trim(),
    "",
  ].join("\n");
}
