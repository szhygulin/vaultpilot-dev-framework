// Two-step approval token flow for `vp-dev agents audit-lessons --apply`.
//
// Mirrors `lessonPruneConfirm.ts` (the prune-lessons two-step gate) with a
// per-agent AuditProposal binding. The auditHash is computed from the scores
// array + a sha256 of the file content at plan time; any drift in the file
// or the scores invalidates the token and forces the operator to re-run
// `--apply`.
//
//   auditHash = sha256(JSON.stringify(scores) + sha256(currentFile))
//
// At confirm time we recompute with the stored scores + the live file
// content; mismatch → reject + require a fresh `--apply`. Same recipe as
// `compactConfirm.computeProposalHash` and `lessonPruneConfirm.ts`.
//
// Issue #197 (Phase B of audit-lessons).

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { AuditScore } from "../agent/auditLessons.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "audit-confirm-";

export interface AuditConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(scores) + sha256(currentFileAtPlanTime)). */
  auditHash: string;
  /** The scores verbatim — re-used at confirm time without a fresh LLM call. */
  scores: AuditScore[];
  /** The drop-threshold used when the token was minted. */
  dropThreshold: number;
  createdAt: string;
  expiresAt: string;
}

export function mintToken(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function hashFile(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * auditHash = sha256(JSON.stringify(scores) + sha256(currentFile))
 * Stable across plan/confirm so long as the scores array and the file bytes
 * don't change. Same shape as compactConfirm.computeProposalHash.
 */
export function computeAuditHash(scores: AuditScore[], currentFile: string): string {
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(scores))
    .update(fileHash)
    .digest("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writeAuditConfirmToken(input: {
  token: string;
  agentId: string;
  scores: AuditScore[];
  auditHash: string;
  dropThreshold: number;
}): Promise<AuditConfirmRecord> {
  const now = new Date();
  const record: AuditConfirmRecord = {
    token: input.token,
    agentId: input.agentId,
    auditHash: input.auditHash,
    scores: input.scores,
    dropThreshold: input.dropThreshold,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  await atomicWriteJson(tokenFilePath(input.token), record);
  return record;
}

export type ReadResult =
  | { ok: true; record: AuditConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readAuditConfirmToken(token: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No audit token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: AuditConfirmRecord;
  try {
    record = JSON.parse(raw) as AuditConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Audit token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteAuditConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Audit token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteAuditConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
