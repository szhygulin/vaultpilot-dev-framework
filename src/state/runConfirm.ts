import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { STATE_DIR, atomicWriteJson } from "./runState.js";

// Two-step approval token flow for `vp-dev run`.
//
// Why this exists: the y/N approval gate is the human-in-the-loop checkpoint
// for multi-agent runs. When the orchestrator is invoked from a non-TTY parent
// (e.g. Claude Code's Bash tool), the y/N prompt can't fire, but `--yes` would
// commit the launch BEFORE the cost preview reaches the human. The two-step
// flow expresses the same gate as: (1) `--plan` prints the preview + writes a
// short-lived token, (2) the human reviews the preview, (3) `--confirm <token>`
// launches the run with the planned params. The previewHash binds the token
// to a specific preview, so if registry / open-issue state drifts between plan
// and confirm, the confirm rejects and forces a fresh plan.

const TOKEN_TTL_MS = 15 * 60 * 1000;
const TOKEN_FILE_PREFIX = "run-confirm-";

export interface RunConfirmParams {
  agents: number;
  targetRepo: string;
  targetRepoPath?: string;
  issues: string;
  dryRun: boolean;
  maxTicks: number;
  stalledThresholdDays: number;
  includeNonReady: boolean;
  verbose: boolean;
  // Per-run cost ceiling carried over from --plan to --confirm so the budget
  // that gated the partition at plan-time is the same one that gates dispatch
  // at confirm-time. Snapshotted by #86's enforcement; consumed by #99's
  // pre-dispatch partition. Optional: undefined = no ceiling.
  maxCostUsd?: string;
  // Issue #84: per-run override that forces the named agent to lead
  // dispatch regardless of natural Jaccard fit. Persisted in the token so
  // a `--plan` → `--confirm` two-step keeps the override; the previewHash
  // already binds the rationale-line annotation, so dropping or changing
  // the field invalidates the token.
  preferAgentId?: string;
  // Issue #118 Phase 1: persisted intent flag for resuming from a
  // salvageable `*-incomplete-<runId>` branch. Phase 1 only records and
  // logs; Phase 2 (separate issue) is responsible for the actual
  // worktree-creation lifecycle change. Carrying the flag through
  // `--plan` → `--confirm` is necessary even before Phase 2 ships so
  // that the two-step approval flow surfaces the same intent at confirm
  // time as at plan time.
  resumeIncomplete?: boolean;
}

export interface RunConfirmToken {
  token: string;
  previewHash: string;
  // Issue #137: persist the rendered preview text alongside the hash so a
  // confirm-time mismatch can surface a unified diff instead of generic
  // prose blame ("Registry, open-issue set, or triage outcome changed").
  // Optional for forward-compat: tokens written by pre-#137 versions still
  // load and exit with the legacy prose error path. Token files live under
  // `state/` (gitignored) and expire after 15 min, so persisting a few KB
  // of preview text is safe.
  previewText?: string;
  createdAt: string;
  expiresAt: string;
  params: RunConfirmParams;
}

export function mintToken(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function hashPreview(formatted: string): string {
  return crypto.createHash("sha256").update(formatted).digest("hex");
}

function tokenFilePath(token: string): string {
  if (!/^[a-f0-9]+$/i.test(token)) {
    throw new Error(`Invalid token format: must be hex.`);
  }
  return path.join(STATE_DIR, `${TOKEN_FILE_PREFIX}${token}.json`);
}

export async function writeRunConfirmToken(input: {
  token: string;
  previewHash: string;
  previewText?: string;
  params: RunConfirmParams;
}): Promise<RunConfirmToken> {
  const now = new Date();
  const record: RunConfirmToken = {
    token: input.token,
    previewHash: input.previewHash,
    previewText: input.previewText,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    params: input.params,
  };
  await atomicWriteJson(tokenFilePath(input.token), record);
  return record;
}

export interface ReadResult {
  ok: true;
  record: RunConfirmToken;
}

export interface ReadFailure {
  ok: false;
  reason: "missing" | "expired" | "malformed";
  message: string;
}

export async function readRunConfirmToken(token: string): Promise<ReadResult | ReadFailure> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenFilePath(token), "utf-8");
  } catch {
    return {
      ok: false,
      reason: "missing",
      message: `No plan token found for ${token}. Re-run with --plan to generate a fresh one.`,
    };
  }
  let record: RunConfirmToken;
  try {
    record = JSON.parse(raw) as RunConfirmToken;
  } catch {
    return {
      ok: false,
      reason: "malformed",
      message: `Plan token ${token} is malformed. Re-run with --plan to generate a fresh one.`,
    };
  }
  if (Date.now() > Date.parse(record.expiresAt)) {
    await deleteRunConfirmToken(token).catch(() => {});
    return {
      ok: false,
      reason: "expired",
      message: `Plan token ${token} expired at ${record.expiresAt}. Re-run with --plan to generate a fresh one.`,
    };
  }
  return { ok: true, record };
}

export async function deleteRunConfirmToken(token: string): Promise<void> {
  try {
    await fs.unlink(tokenFilePath(token));
  } catch {
    // already gone — fine
  }
}

export async function pruneExpiredTokens(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(STATE_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    if (!name.startsWith(TOKEN_FILE_PREFIX) || !name.endsWith(".json")) continue;
    const fp = path.join(STATE_DIR, name);
    try {
      const raw = await fs.readFile(fp, "utf-8");
      const rec = JSON.parse(raw) as RunConfirmToken;
      if (now > Date.parse(rec.expiresAt)) {
        await fs.unlink(fp).catch(() => {});
      }
    } catch {
      // skip unreadable / non-token files
    }
  }
}
