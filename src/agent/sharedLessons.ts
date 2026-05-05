// Cross-agent shared-lessons pool — read-only at agent runtime, write-only
// via curated promotion (`vp-dev lessons review`). See feature plan in
// `feature-plans/issue-33-shared-lessons-pool.md`.
//
// Two tiers (#101):
//   - "target": `agents/.shared/lessons/<domain>.md` — local to the per-target
//     working tree. Same gitignored `agents/` root as per-agent CLAUDE.md, so
//     pool files never leak into the target repo.
//   - "global": `$XDG_CONFIG_HOME/vaultpilot/shared-lessons/<domain>.md`
//     (fallback `~/.vaultpilot/shared-lessons/`) — survives across target
//     repos. Domain knowledge that's portable (Solana RPC quirks, ERC-4626
//     semantics, ethers v5/v6 drift) belongs here; rules unique to one
//     target repo's runtime stay on the target tier.
//
// Domain == any tag the agent fingerprint exposes (lowercase, dash-separated,
// e.g. `solana`, `eip-712`).
//
// Boundary preservation: appendLessonToPool is invoked exclusively by the
// orchestrator-side review CLI. The coding-agent workflow (`renderWorkflow`
// in `workflow.ts`) carries an explicit "never write to agents/.shared/"
// guard, and the agent's worktree CWD is outside both tier paths anyway.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, withFileLock } from "../state/locks.js";
import { AGENTS_ROOT } from "./specialization.js";
import {
  isValidDomain,
  validateEntry,
  type ValidationResult,
} from "../util/promotionMarkers.js";

export type LessonTier = "target" | "global";

const PER_TARGET_DIR = path.join(AGENTS_ROOT, ".shared", "lessons");

/**
 * Resolve the directory backing a tier. Lazy on `XDG_CONFIG_HOME` /
 * `os.homedir()` so test harnesses can override `process.env.HOME` /
 * `XDG_CONFIG_HOME` without monkey-patching the module.
 */
export function sharedLessonsDir(tier: LessonTier): string {
  if (tier === "target") return PER_TARGET_DIR;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return path.join(xdg, "vaultpilot", "shared-lessons");
  }
  return path.join(os.homedir(), ".vaultpilot", "shared-lessons");
}

/**
 * Pool-file size cap. Once exceeded, append refuses with a "trim first"
 * outcome so prompt seeding stays bounded for every agent that loads this
 * domain.
 */
export const MAX_POOL_LINES = 200;

export function sharedLessonsPath(tier: LessonTier, domain: string): string {
  if (!isValidDomain(domain)) {
    throw new Error(`Invalid domain '${domain}': expected lowercase dash-separated tag.`);
  }
  return path.join(sharedLessonsDir(tier), `${domain}.md`);
}

export interface PoolSummary {
  tier: LessonTier;
  domain: string;
  filePath: string;
  totalLines: number;
  bytes: number;
}

export async function listSharedLessonDomains(tier: LessonTier): Promise<PoolSummary[]> {
  const dir = sharedLessonsDir(tier);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: PoolSummary[] = [];
  for (const e of entries.sort()) {
    if (!e.endsWith(".md")) continue;
    const domain = e.slice(0, -3);
    if (!isValidDomain(domain)) continue;
    const filePath = path.join(dir, e);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      out.push({
        tier,
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
  tier: LessonTier;
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
  tier: LessonTier,
  domains: string[],
): Promise<DomainContent[]> {
  const out: DomainContent[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    if (!isValidDomain(domain) || seen.has(domain)) continue;
    seen.add(domain);
    try {
      const content = await fs.readFile(sharedLessonsPath(tier, domain), "utf-8");
      if (content.trim().length > 0) {
        out.push({ tier, domain, content });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return out;
}

export interface AppendLessonInput {
  tier: LessonTier;
  domain: string;
  body: string;
  sourceAgentId: string;
  issueId: number;
  ts?: string;
}

export type AppendLessonOutcome =
  | { kind: "appended"; tier: LessonTier; totalLines: number; filePath: string }
  | { kind: "rejected-pool-full"; tier: LessonTier; totalLines: number; filePath: string }
  | { kind: "rejected-validation"; validation: ValidationResult };

export async function appendLessonToPool(
  input: AppendLessonInput,
): Promise<AppendLessonOutcome> {
  const validation = validateEntry(input.body);
  if (!validation.ok) {
    return { kind: "rejected-validation", validation };
  }
  const ts = input.ts ?? new Date().toISOString();
  const dir = sharedLessonsDir(input.tier);
  const filePath = sharedLessonsPath(input.tier, input.domain);
  return withFileLock(filePath, async () => {
    await ensureDir(dir);
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (current.length === 0) {
      current = poolHeader(input.tier, input.domain);
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
      return { kind: "rejected-pool-full", tier: input.tier, totalLines, filePath };
    }
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
    return { kind: "appended", tier: input.tier, totalLines, filePath };
  });
}

function poolHeader(tier: LessonTier, domain: string): string {
  const tierBlurb =
    tier === "global"
      ? "Portable across target repos — promoted via `vp-dev lessons review --global`."
      : "Local to this target repo's working tree — promoted via `vp-dev lessons review`.";
  return [
    `# Shared lessons: ${domain} (${tier})`,
    "",
    `Curated cross-agent lessons for the \`${domain}\` domain. Read-only at`,
    "agent runtime; entries promoted after the human reviewer accepts a",
    "`<!-- promote-candidate -->` block from a sibling agent's CLAUDE.md.",
    tierBlurb,
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
