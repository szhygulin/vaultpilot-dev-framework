import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  hashPreview,
  mintToken,
  readRunConfirmToken,
  writeRunConfirmToken,
  deleteRunConfirmToken,
  type RunConfirmParams,
} from "./runConfirm.js";
import { STATE_DIR } from "./runState.js";

// Issue #142 (Phase 2 of #134): the `autoPhaseFollowup` opt-in must
// survive a `--plan` → `--confirm` round-trip via the on-disk token
// file. Without this guarantee, an operator who passes the flag at
// `--plan` time would silently see the run launch without it on
// `--confirm`, with no error surface — the most expensive failure mode
// for a feature whose only behavior change is opt-in.
//
// The previewHash binds the field too (a flag toggle between plan and
// confirm rebuilds the preview text and trips the drift diff), but
// hash-binding alone doesn't prove the value persists; the test below
// pins the persistence-layer invariant the previewHash check depends
// on.

const baseParams: RunConfirmParams = {
  agents: 2,
  targetRepo: "owner/repo",
  issues: "100-105",
  dryRun: false,
  maxTicks: 50,
  stalledThresholdDays: 30,
  includeNonReady: false,
  verbose: false,
};

async function ensureStateDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

test("runConfirm token round-trip: autoPhaseFollowup === true persists", async () => {
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-1"),
    params: { ...baseParams, autoPhaseFollowup: true },
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.autoPhaseFollowup, true);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

test("runConfirm token round-trip: autoPhaseFollowup === false persists distinctly", async () => {
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-2"),
    params: { ...baseParams, autoPhaseFollowup: false },
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.autoPhaseFollowup, false);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

test("runConfirm token round-trip: omitted autoPhaseFollowup stays undefined (back-compat)", async () => {
  // Tokens written before #142 (or by a CLI invocation that didn't pass
  // `--auto-phase-followup`) carry no `autoPhaseFollowup` field. The
  // read path must surface that as `undefined`, not coerce to a boolean
  // — `cmdRun` treats undefined as "off" via `!!opts.autoPhaseFollowup`,
  // which is the correct default-off behavior.
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-3"),
    params: { ...baseParams }, // no autoPhaseFollowup at all
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.autoPhaseFollowup, undefined);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

// Issue #148 (Phase 2b of #133): both --apply-dedup and --skip-dedup
// must round-trip the token so a `--plan` token written under one mode
// cannot be silently confirmed under the other. The previewHash check
// catches preview-text drift; these tests pin the persistence-layer
// invariant the hash check depends on.

test("runConfirm token round-trip: applyDedup === true persists", async () => {
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-applyDedup-1"),
    params: { ...baseParams, applyDedup: true },
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.applyDedup, true);
      assert.equal(r.record.params.skipDedup, undefined);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

test("runConfirm token round-trip: skipDedup === true persists", async () => {
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-skipDedup-1"),
    params: { ...baseParams, skipDedup: true },
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.skipDedup, true);
      assert.equal(r.record.params.applyDedup, undefined);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

test("runConfirm token round-trip: omitted applyDedup/skipDedup stay undefined (back-compat)", async () => {
  // Tokens written before #148 carry neither field. The read path must
  // surface both as `undefined`, not coerce to false — `cmdRun`'s
  // mutex check uses `if (opts.applyDedup && opts.skipDedup)`, which
  // tolerates undefined naturally; tokens written under the new
  // schema without either flag should match the same default-off shape.
  await ensureStateDir();
  const token = mintToken();
  await writeRunConfirmToken({
    token,
    previewHash: hashPreview("preview-default-dedup"),
    params: { ...baseParams }, // no applyDedup, no skipDedup
  });
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.applyDedup, undefined);
      assert.equal(r.record.params.skipDedup, undefined);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});

test("runConfirm token round-trip: pre-#142 token shape (no autoPhaseFollowup field on disk) reads cleanly", async () => {
  // Hand-write a token file shaped like a pre-#142 plan: no
  // `autoPhaseFollowup` key at all, no `resumeIncomplete` either —
  // the on-disk JSON predates both. The read path must not throw and
  // must return undefined for the missing field.
  await ensureStateDir();
  const token = mintToken();
  const tokenPath = path.join(STATE_DIR, `run-confirm-${token}.json`);
  const legacyRecord = {
    token,
    previewHash: hashPreview("legacy-preview"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    params: {
      agents: 1,
      targetRepo: "owner/repo",
      issues: "1",
      dryRun: false,
      maxTicks: 10,
      stalledThresholdDays: 30,
      includeNonReady: false,
      verbose: false,
      // Note: no autoPhaseFollowup, no resumeIncomplete
    },
  };
  await fs.writeFile(tokenPath, JSON.stringify(legacyRecord), "utf-8");
  try {
    const r = await readRunConfirmToken(token);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.record.params.autoPhaseFollowup, undefined);
      assert.equal(r.record.params.resumeIncomplete, undefined);
    }
  } finally {
    await deleteRunConfirmToken(token);
  }
});
