// Two-step approval token flow for `vp-dev agents prune-lessons --apply`.
//
// Mirrors `compactConfirm.ts` (#162's two-step gate for compact-claude-md)
// with a per-agent PruneProposal binding. The proposalHash is computed from
// the stable-IDs list + a sha256 of the file content at plan time; any drift
// between plan and confirm invalidates the token.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { PruneProposal } from "../agent/lessonPrune.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "lesson-prune-confirm-";

export interface LessonPruneConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(stableIdsSorted) + sha256(currentFileAtPlanTime)). */
  proposalHash: string;
  /** The proposal verbatim — re-used at confirm time without re-reading utility. */
  proposal: PruneProposal;
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

export async function writeLessonPruneConfirmToken(input: {
  token: string;
  agentId: string;
  proposal: PruneProposal;
  proposalHash: string;
}): Promise<LessonPruneConfirmRecord> {
  const now = new Date();
  const record: LessonPruneConfirmRecord = {
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
  | { ok: true; record: LessonPruneConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readLessonPruneConfirmToken(
  token: string,
): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No prune token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: LessonPruneConfirmRecord;
  try {
    record = JSON.parse(raw) as LessonPruneConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Prune token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteLessonPruneConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Prune token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteLessonPruneConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
