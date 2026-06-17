// Phase B0 (issue #173) tests for the tighten-claude-md two-step confirm
// token. Mirrors `runConfirm.test.ts` / the compact token's coverage:
// mint/redeem happy path, tightenHash drift rejection (file changed between
// apply and confirm), TTL expiry, and token-not-found. The token store is
// corpus-independent plumbing — fully tested here regardless of the
// STUDY_PENDING gate at the CLI layer.
//
// STATE_DIR resolves to `<cwd>/state` (captured at module load, gitignored),
// so tests write real token files keyed by a random hex token and clean up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  computeTightenHash,
  deleteTightenConfirmToken,
  hashFile,
  mintToken,
  readTightenConfirmToken,
  writeTightenConfirmToken,
} from "./tightenConfirm.js";
import { STATE_DIR } from "./runState.js";
import {
  DEFAULT_MAX_SAVINGS_PCT,
  type SectionRewrite,
  type TightenProposal,
} from "../agent/tightenClaudeMd.js";

async function ensureStateDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

function fakeRewrites(): SectionRewrite[] {
  return [
    {
      sectionId: "s0",
      rewrittenBody: "Tightened body, #162, 30KB, 2026-05-05.",
      estimatedBytesSaved: 120,
    },
  ];
}

function fakeProposal(rewrites: SectionRewrite[]): TightenProposal {
  return {
    agentId: "agent-test",
    rewrites,
    unchangedSectionIds: [],
    estimatedBytesSaved: rewrites.reduce((a, r) => a + r.estimatedBytesSaved, 0),
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
}

const PLAN_FILE = "<!-- run:r issue:#1 outcome:implement ts:2026-05-05T00:00:00.000Z -->\n## H\n\nVerbose body #162 30KB 2026-05-05.\n";

test("tightenConfirm: mint/redeem happy path round-trips the proposal + hash", async () => {
  await ensureStateDir();
  const token = mintToken();
  const rewrites = fakeRewrites();
  const tightenHash = computeTightenHash(rewrites, PLAN_FILE);
  await writeTightenConfirmToken({
    token,
    agentId: "agent-test",
    proposal: fakeProposal(rewrites),
    tightenHash,
  });
  try {
    const r = await readTightenConfirmToken(token);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.record.agentId, "agent-test");
    assert.equal(r.record.tightenHash, tightenHash);
    assert.equal(r.record.proposal.rewrites.length, 1);
    assert.equal(r.record.proposal.rewrites[0].sectionId, "s0");
    // The recomputed hash against the same (unchanged) file matches —
    // this is what the confirm path checks before applying.
    assert.equal(
      computeTightenHash(r.record.proposal.rewrites, PLAN_FILE),
      tightenHash,
    );
  } finally {
    await deleteTightenConfirmToken(token);
  }
});

test("tightenConfirm: tightenHash drifts when the file changes between apply and confirm", async () => {
  const rewrites = fakeRewrites();
  const planHash = computeTightenHash(rewrites, PLAN_FILE);
  // Operator (or summarizer) edits the file after planning. The drift check
  // recomputes the hash against the new bytes and gets a different value.
  const driftedFile = PLAN_FILE + "\n<!-- run:r2 issue:#2 outcome:implement ts:2026-05-06T00:00:00.000Z -->\n## H2\n\nNew section.\n";
  const driftHash = computeTightenHash(rewrites, driftedFile);
  assert.notEqual(planHash, driftHash);
  // Sanity: the file-hash component itself changed.
  assert.notEqual(hashFile(PLAN_FILE), hashFile(driftedFile));
});

test("tightenConfirm: hash is stable against advisory-only proposal fields", async () => {
  // The hash binds to `rewrites`, not the whole proposal — so warnings /
  // estimatedBytesSaved differences must NOT change it.
  const rewrites = fakeRewrites();
  const h1 = computeTightenHash(rewrites, PLAN_FILE);
  const sameRewrites = fakeRewrites();
  const h2 = computeTightenHash(sameRewrites, PLAN_FILE);
  assert.equal(h1, h2);
});

test("tightenConfirm: expired token is rejected and reaped", async () => {
  await ensureStateDir();
  const token = mintToken();
  const rewrites = fakeRewrites();
  await writeTightenConfirmToken({
    token,
    agentId: "agent-test",
    proposal: fakeProposal(rewrites),
    tightenHash: computeTightenHash(rewrites, PLAN_FILE),
  });
  // Backdate expiresAt to force expiry.
  const tokenPath = path.join(STATE_DIR, `tighten-confirm-${token}.json`);
  const raw = JSON.parse(await fs.readFile(tokenPath, "utf-8"));
  raw.expiresAt = new Date(Date.now() - 1000).toISOString();
  await fs.writeFile(tokenPath, JSON.stringify(raw));
  try {
    const r = await readTightenConfirmToken(token);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "expired");
    // Reaped on expiry read.
    await assert.rejects(() => fs.readFile(tokenPath, "utf-8"));
  } finally {
    await deleteTightenConfirmToken(token);
  }
});

test("tightenConfirm: token-not-found returns a missing result", async () => {
  await ensureStateDir();
  const token = mintToken(); // never written
  const r = await readTightenConfirmToken(token);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "missing");
  assert.match(r.message, /Re-run with --apply/);
});

test("tightenConfirm: non-hex token is treated as missing (path-layer guard caught)", async () => {
  // The path layer throws on a non-hex token; readTightenConfirmToken's try
  // block catches it and surfaces a `missing` result (mirrors compactConfirm
  // verbatim — the hex guard prevents traversal regardless).
  const r = await readTightenConfirmToken("../etc/passwd");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "missing");
});
