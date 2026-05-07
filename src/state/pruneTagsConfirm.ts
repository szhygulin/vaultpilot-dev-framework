// Two-step approval token flow for `vp-dev agents prune-tags --apply`.
//
// Mirrors `lessonPruneConfirm.ts` (#179's prune-lessons two-step) and
// `compactConfirm.ts` (#162). The proposalHash binds the proposal to both
// the agent's current registry tag list AND CLAUDE.md content at plan time;
// any drift between plan and confirm invalidates the token.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { PruneTagsProposal } from "../agent/pruneTags.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "prune-tags-confirm-";

export interface PruneTagsConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(proposalCore) + sha256(currentTags) + sha256(currentClaudeMd)). */
  proposalHash: string;
  /** The proposal verbatim — re-used at confirm time without re-running the LLM. */
  proposal: PruneTagsProposal;
  createdAt: string;
  expiresAt: string;
}

export function mintToken(): string {
  return crypto.randomBytes(8).toString("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writePruneTagsConfirmToken(input: {
  token: string;
  agentId: string;
  proposal: PruneTagsProposal;
  proposalHash: string;
}): Promise<PruneTagsConfirmRecord> {
  const now = new Date();
  const record: PruneTagsConfirmRecord = {
    token: input.token,
    agentId: input.agentId,
    proposalHash: input.proposalHash,
    proposal: input.proposal,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  await atomicWriteJson(tokenFilePath(input.token), record);
  return record;
}

export type ReadResult =
  | { ok: true; record: PruneTagsConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readPruneTagsConfirmToken(
  token: string,
): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No prune-tags token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: PruneTagsConfirmRecord;
  try {
    record = JSON.parse(raw) as PruneTagsConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Prune-tags token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deletePruneTagsConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Prune-tags token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deletePruneTagsConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
