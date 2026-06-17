// Two-step approval token flow for `vp-dev agents assess-claude-md --apply`.
//
// Mirrors `compactConfirm.ts` (#162's two-step gate for compact-claude-md)
// with a per-agent AssessProposal binding. The assessHash is computed from
// the serialized verdicts + a sha256 of the file content at plan time; any
// drift between plan and confirm invalidates the token.
//
// assessHash = sha256(JSON.stringify(verdicts) + sha256(currentFile))
//
// The token prefix is `assess-confirm-`. Per issue #181: copy-paste from
// compactConfirm/lessonPruneConfirm rather than extracting a shared module —
// three concrete usages needed before the abstraction tax pays off.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";
import type { AssessProposal } from "../agent/assessClaudeMd.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "assess-confirm-";

export interface AssessConfirmRecord {
  token: string;
  agentId: string;
  /** sha256(JSON.stringify(verdicts) + sha256(currentFileAtPlanTime)). */
  assessHash: string;
  /** The proposal verbatim — re-used at confirm time without re-running Phase 3. */
  proposal: AssessProposal;
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
 * Recipe per issue #181:
 *   assessHash = sha256(JSON.stringify(verdicts) + sha256(currentFile))
 * "verdicts" is the sorted list of {stableId, verdict} pairs derived from
 * the proposal sections so the hash is stable regardless of floating-point
 * formatting changes in other fields.
 */
export function computeAssessHash(
  proposal: AssessProposal,
  currentFile: string,
): string {
  const verdicts = proposal.sections
    .map((s) => ({ stableId: s.stableId, verdict: s.verdict }))
    .sort((a, b) => (a.stableId ?? "").localeCompare(b.stableId ?? ""));
  const fileHash = hashFile(currentFile);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(verdicts))
    .update(fileHash)
    .digest("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writeAssessConfirmToken(input: {
  token: string;
  agentId: string;
  proposal: AssessProposal;
  assessHash: string;
}): Promise<AssessConfirmRecord> {
  const now = new Date();
  const record: AssessConfirmRecord = {
    token: input.token,
    agentId: input.agentId,
    assessHash: input.assessHash,
    proposal: input.proposal,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  await atomicWriteJson(tokenFilePath(input.token), record);
  return record;
}

export type ReadResult =
  | { ok: true; record: AssessConfirmRecord }
  | { ok: false; reason: "missing" | "expired" | "malformed"; message: string };

export async function readAssessConfirmToken(token: string): Promise<ReadResult> {
  // Validate format before any I/O so the error propagates as a rejection
  // (the hex gate in tokenFilePath throws synchronously, which would otherwise
  // be silently swallowed by the missing-file catch block below).
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error("Invalid token format: must be hex.");
  }
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No assess token found for ${token}. Re-run with --apply to generate a fresh one.`,
    };
  }
  let record: AssessConfirmRecord;
  try {
    record = JSON.parse(raw) as AssessConfirmRecord;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Assess token ${token} is malformed. Re-run with --apply to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteAssessConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Assess token ${token} expired at ${record.expiresAt}. Re-run with --apply to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteAssessConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}
