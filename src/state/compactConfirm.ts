// Two-step approval token flow for `vp-dev agents compact-claude-md --apply`.
//
// Mirrors `runConfirm.ts` (the `vp-dev run --plan/--confirm` flow) but with a
// per-agent CompactionProposal binding instead of a run-shape. Phase A's
// `--apply` step prints the proposal and writes a token under
// `state/compact-confirm-<token>.json` with a 15-min TTL; the operator
// reviews the proposal, then re-invokes `--confirm <token>` which re-reads
// the file, recomputes the proposal hash, and applies the rewrite under the
// same per-file lock used by `appendBlock` / `expireSentinels`.
//
// The proposalHash binds the token to BOTH the proposal text AND the file
// content at plan time:
//   proposalHash = sha256(JSON.stringify(proposal) + sha256(currentFile))
// At confirm time, we recompute with the stored proposal + the live file
// content; any drift in the file invalidates the token and forces the
// operator to re-run `--apply`. This is the safety story the destructive
// path inherits from #133's dedup `--plan/--confirm` and #142's
// `autoPhaseFollowup` round-trip.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { CompactionProposal } from "../agent/compactClaudeMd.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "compact-confirm-";

export interface CompactConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(proposal) + sha256(currentFileAtPlanTime)). */
  proposalHash: string;
  /** The proposal verbatim — re-used at confirm time without a fresh LLM call. */
  proposal: CompactionProposal;
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
 * Recipe per issue #162:
 *   proposalHash = sha256(JSON.stringify(proposal) + sha256(currentFile))
 * Stable across plan/confirm so long as the proposal object and file bytes
 * don't change. JSON.stringify of object literals built by the same code
 * path is order-stable in V8; that's the same assumption #142 makes.
 */
export function computeProposalHash(
  proposal: CompactionProposal,
  currentFile: string,
): string {
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(proposal))
    .update(fileHash)
    .digest("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writeCompactConfirmToken(input: {
  token: string;
  agentId: string;
  proposal: CompactionProposal;
  proposalHash: string;
}): Promise<CompactConfirmRecord> {
  const now = new Date();
  const record: CompactConfirmRecord = {
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
  | { ok: true; record: CompactConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readCompactConfirmToken(token: string): Promise<ReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No compact token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: CompactConfirmRecord;
  try {
    record = JSON.parse(raw) as CompactConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Compact token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteCompactConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Compact token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteCompactConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
