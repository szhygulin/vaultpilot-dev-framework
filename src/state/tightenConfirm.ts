// Two-step approval token flow for `vp-dev agents tighten-claude-md --apply`.
//
// Mirrors `compactConfirm.ts` (#162's two-step gate for compact-claude-md)
// with a per-agent TightenProposal binding. The tightenHash is computed from
// the rewrites list + a sha256 of the file content at plan time; any drift
// between plan and confirm invalidates the token.
//
// tightenHash = sha256(JSON.stringify(rewrites) + sha256(currentFileAtPlanTime))
//
// At confirm time, we recompute with the stored rewrites + the live file
// content; any drift in the file invalidates the token and forces the operator
// to re-run `--apply`. This is the same safety story compact's two-step gate
// (#162) and prune-lessons (#190) rely on.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { TightenProposal } from "../agent/tightenClaudeMd.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "tighten-confirm-";

export interface TightenConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(rewrites) + sha256(currentFileAtPlanTime)). */
  tightenHash: string;
  /** The proposal verbatim — re-used at confirm time without a fresh LLM call. */
  proposal: TightenProposal;
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
 * tightenHash = sha256(JSON.stringify(rewrites) + sha256(currentFile))
 *
 * Binds the token to BOTH the rewrites list AND the file content at plan time.
 * Any drift in either (rewrite list mutated, file changed) invalidates the
 * token and forces a fresh `--apply`.
 */
export function computeTightenHash(
  proposal: TightenProposal,
  currentFile: string,
): string {
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(proposal.rewrites))
    .update(fileHash)
    .digest("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writeTightenConfirmToken(input: {
  token: string;
  agentId: string;
  proposal: TightenProposal;
  tightenHash: string;
}): Promise<TightenConfirmRecord> {
  const now = new Date();
  const record: TightenConfirmRecord = {
    token: input.token,
    agentId: input.agentId,
    tightenHash: input.tightenHash,
    proposal: input.proposal,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  await atomicWriteJson(tokenFilePath(input.token), record);
  return record;
}

export type ReadResult =
  | { ok: true; record: TightenConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readTightenConfirmToken(token: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No tighten token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: TightenConfirmRecord;
  try {
    record = JSON.parse(raw) as TightenConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Tighten token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteTightenConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Tighten token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteTightenConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
