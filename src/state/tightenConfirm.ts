// Two-step approval token flow for `vp-dev agents tighten-claude-md --apply`.
//
// Copy-paste sibling of `compactConfirm.ts` (#162's two-step gate for
// compact-claude-md), changed only in: the file prefix (`tighten-confirm-`),
// the bound-hash field (`tightenHash` over the rewrite list), and the
// payload type (`TightenProposal`). Phase B0 (#173) keeps this fully
// implemented + tested — it is corpus-independent plumbing. The destructive
// `--apply`/`--confirm` CLI predicate stays gated behind `STUDY_PENDING` in
// `tightenClaudeMd.ts` until the bake-window corpus exists.
//
// (Intentionally NOT extracted into a generic shared token module — #173
// chose copy-paste; the three-way extraction across compact / lesson-prune /
// tighten is filed as a separate cleanup.)
//
// The tightenHash binds the token to BOTH the rewrite list AND the file
// content at plan time:
//   tightenHash = sha256(JSON.stringify(rewrites) + sha256(currentFile))
// At confirm time we recompute with the stored rewrites + the live file
// content; any drift in the file invalidates the token and forces the
// operator to re-run `--apply`. Binding to `rewrites` (not the whole
// proposal) keeps the hash stable against advisory-only fields (warnings,
// estimatedBytesSaved) that don't affect the splice.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type {
  SectionRewrite,
  TightenProposal,
} from "../agent/tightenClaudeMd.js";

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
 * Recipe per issue #173:
 *   tightenHash = sha256(JSON.stringify(rewrites) + sha256(currentFile))
 * Stable across plan/confirm so long as the rewrite list and file bytes
 * don't change. JSON.stringify of the rewrite array built by the same code
 * path is order-stable in V8; that's the same assumption #162 makes for the
 * compact proposalHash.
 */
export function computeTightenHash(
  rewrites: SectionRewrite[],
  currentFile: string,
): string {
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(rewrites))
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
