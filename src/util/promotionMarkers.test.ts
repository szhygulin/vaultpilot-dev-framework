import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_CLAUDE_DOMAIN,
  MAX_ENTRY_CHARS,
  MAX_ENTRY_LINES,
  findPromoteCandidates,
  formatNotPromotedSentinel,
  formatPromotedSentinel,
  isLocalClaudeCandidate,
  isValidDomain,
  rewriteCandidateWrapping,
  validateEntry,
} from "./promotionMarkers.js";

test("isValidDomain: accepts lowercase dash-separated tags", () => {
  assert.equal(isValidDomain("solana"), true);
  assert.equal(isValidDomain("eip-712"), true);
  assert.equal(isValidDomain("ledger-firmware"), true);
});

test("isValidDomain: rejects uppercase, spaces, leading digit, empty", () => {
  assert.equal(isValidDomain("Solana"), false);
  assert.equal(isValidDomain("ledger firmware"), false);
  assert.equal(isValidDomain("712-eip"), false);
  assert.equal(isValidDomain(""), false);
  assert.equal(isValidDomain("foo_bar"), false);
});

test("findPromoteCandidates: single block", () => {
  const md = [
    "## Heading",
    "",
    "Body line.",
    "",
    "<!-- promote-candidate:solana -->",
    "Solana RPC X behaves like Y.",
    "Confirm with `getRecentBlockhash`.",
    "<!-- /promote-candidate -->",
    "",
    "Trailing line.",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "solana");
  assert.equal(found[0].startLine, 4);
  assert.equal(found[0].endLine, 7);
  assert.equal(
    found[0].body,
    "Solana RPC X behaves like Y.\nConfirm with `getRecentBlockhash`.",
  );
});

test("findPromoteCandidates: multiple blocks across the file", () => {
  const md = [
    "<!-- promote-candidate:aave -->",
    "Aave fact.",
    "<!-- /promote-candidate -->",
    "intermezzo",
    "<!-- promote-candidate:eip-712 -->",
    "EIP-712 fact.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 2);
  assert.equal(found[0].domain, "aave");
  assert.equal(found[1].domain, "eip-712");
});

test("findPromoteCandidates: orphan open marker is skipped", () => {
  const md = [
    "<!-- promote-candidate:lonely -->",
    "no close.",
    "more text.",
  ].join("\n");
  assert.deepEqual(findPromoteCandidates(md), []);
});

test("findPromoteCandidates: nested open invalidates outer; inner is matched", () => {
  const md = [
    "<!-- promote-candidate:outer -->",
    "outer body",
    "<!-- promote-candidate:inner -->",
    "inner body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  // Outer is malformed (encounters another open before its close) and is
  // skipped. The single close terminates the inner, which IS a valid block.
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "inner");
});

test("findPromoteCandidates: kind-agnostic — finds markers inside outcome:failure-lesson blocks", () => {
  // Failure-derived blocks share the same body shape as success-derived
  // ones; the only difference is the sentinel header above the heading.
  // This guards the contract that `vp-dev lessons review` surfaces both
  // kinds via the same marker walk.
  const md = [
    "<!-- run:run-A issue:#1 outcome:implement ts:2026-05-05T00:00:00.000Z tags:solana -->",
    "## Success-derived rule",
    "",
    "Body of a success rule.",
    "<!-- promote-candidate:solana -->",
    "Solana RPC X drops txs above N compute units.",
    "<!-- /promote-candidate -->",
    "",
    "<!-- run:run-B issue:#2 outcome:failure-lesson ts:2026-05-05T00:01:00.000Z tags:eip-712 -->",
    "## Failure-derived rule",
    "",
    "Body of a failure rule.",
    "<!-- promote-candidate:eip-712 -->",
    "EIP-712 typed-data digests do not authenticate the tree itself.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 2);
  assert.equal(found[0].domain, "solana");
  assert.equal(found[1].domain, "eip-712");
  assert.equal(
    found[1].body,
    "EIP-712 typed-data digests do not authenticate the tree itself.",
  );
});

test("findPromoteCandidates: ignores blocks with invalid domain shape", () => {
  const md = [
    "<!-- promote-candidate:Bad-Domain -->",
    "body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  assert.deepEqual(findPromoteCandidates(md), []);
});

test("validateEntry: empty body fails", () => {
  const r = validateEntry("   \n  \n");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("empty")));
});

test("validateEntry: oversize line count fails", () => {
  const body = Array.from({ length: MAX_ENTRY_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
  const r = validateEntry(body);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("MAX_ENTRY_LINES")));
});

test("validateEntry: oversize char count fails", () => {
  const body = "x".repeat(MAX_ENTRY_CHARS + 100);
  const r = validateEntry(body);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("MAX_ENTRY_CHARS")));
});

test("validateEntry: imperative phrasing produces warning, not error", () => {
  const r = validateEntry("You must always re-verify the nonce before broadcast.");
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.toLowerCase().includes("imperative")));
});

test("validateEntry: descriptive observation passes clean", () => {
  const r = validateEntry(
    "ERC-4626 vaults round share calculations DOWN on deposit and UP on withdraw — small-balance edge cases hit the rounding ledge.",
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
});

test("rewriteCandidateWrapping: replaces wrapping, preserves body", () => {
  const md = [
    "header",
    "<!-- promote-candidate:solana -->",
    "Solana fact.",
    "Another line.",
    "<!-- /promote-candidate -->",
    "footer",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  const out = rewriteCandidateWrapping(md, found[0], "<!-- promoted:solana:T -->");
  const expected = [
    "header",
    "<!-- promoted:solana:T -->",
    "Solana fact.",
    "Another line.",
    "footer",
  ].join("\n");
  assert.equal(out, expected);
});

test("rewriteCandidateWrapping: re-running findPromoteCandidates on rewritten content yields none", () => {
  const md = [
    "<!-- promote-candidate:aave -->",
    "Aave fact.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const [c] = findPromoteCandidates(md);
  const rewritten = rewriteCandidateWrapping(md, c, formatPromotedSentinel("aave", "T"));
  assert.deepEqual(findPromoteCandidates(rewritten), []);
});

test("formatPromotedSentinel and formatNotPromotedSentinel produce stable shapes", () => {
  assert.equal(
    formatPromotedSentinel("solana", "2026-05-04T00:00:00.000Z"),
    "<!-- promoted:solana:2026-05-04T00:00:00.000Z -->",
  );
  assert.equal(
    formatNotPromotedSentinel("imperative phrasing", "2026-05-04T00:00:00.000Z"),
    "<!-- not-promoted:imperative phrasing:2026-05-04T00:00:00.000Z -->",
  );
});

// ---------------------------------------------------------------------
// #179 Phase 2 follow-up: @local-claude domain + utility=N.M parsing
// ---------------------------------------------------------------------

test("LOCAL_CLAUDE_DOMAIN is the literal @local-claude string", () => {
  assert.equal(LOCAL_CLAUDE_DOMAIN, "@local-claude");
});

test("isValidDomain: accepts @local-claude", () => {
  assert.equal(isValidDomain("@local-claude"), true);
});

test("isValidDomain: rejects other @-prefixed domains", () => {
  assert.equal(isValidDomain("@solana"), false);
  assert.equal(isValidDomain("@local"), false);
  assert.equal(isValidDomain("@"), false);
});

test("isLocalClaudeCandidate: matches only @local-claude", () => {
  assert.equal(isLocalClaudeCandidate("@local-claude"), true);
  assert.equal(isLocalClaudeCandidate("solana"), false);
  assert.equal(isLocalClaudeCandidate("@solana"), false);
});

test("findPromoteCandidates: parses @local-claude with utility=0.85", () => {
  const md = [
    "<!-- promote-candidate:@local-claude utility=0.85 -->",
    "Project-wide rule body.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "@local-claude");
  assert.equal(found[0].utility, 0.85);
});

test("findPromoteCandidates: @local-claude without utility parses with utility undefined", () => {
  const md = [
    "<!-- promote-candidate:@local-claude -->",
    "body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "@local-claude");
  assert.equal(found[0].utility, undefined);
});

test("findPromoteCandidates: utility=0 and utility=1 are accepted boundary values", () => {
  const md = [
    "<!-- promote-candidate:@local-claude utility=0 -->",
    "low-utility body",
    "<!-- /promote-candidate -->",
    "intermezzo",
    "<!-- promote-candidate:@local-claude utility=1 -->",
    "high-utility body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 2);
  assert.equal(found[0].utility, 0);
  assert.equal(found[1].utility, 1);
});

test("findPromoteCandidates: regular domain with utility= is also parsed (back-compat)", () => {
  // The marker grammar allows utility on any domain; the L2 gate only
  // applies it for @local-claude. Regular domains carrying utility just
  // ignore the field. Accept-and-ignore is more forgiving than reject.
  const md = [
    "<!-- promote-candidate:solana utility=0.5 -->",
    "body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const found = findPromoteCandidates(md);
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "solana");
  assert.equal(found[0].utility, 0.5);
});

test("rewriteCandidateWrapping: still works for @local-claude", () => {
  const md = [
    "<!-- promote-candidate:@local-claude utility=0.7 -->",
    "rule body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  const [c] = findPromoteCandidates(md);
  const rewritten = rewriteCandidateWrapping(
    md,
    c,
    formatPromotedSentinel("@local-claude", "T"),
  );
  assert.match(rewritten, /<!-- promoted:@local-claude:T -->/);
  assert.deepEqual(findPromoteCandidates(rewritten), []);
});
