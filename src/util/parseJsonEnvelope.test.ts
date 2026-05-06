import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  parseJsonEnvelope,
  stripBareApostropheEscapes,
} from "./parseJsonEnvelope.js";

const EnvelopeSchema = z.object({
  decision: z.enum(["implement", "pushback", "error"]),
  reason: z.string(),
});

test("bare json object only", () => {
  const r = parseJsonEnvelope(
    `{"decision":"implement","reason":"ok"}`,
    EnvelopeSchema,
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { decision: "implement", reason: "ok" });
});

test("fenced json with tag", () => {
  const msg =
    "Here you go:\n```json\n{\"decision\":\"implement\",\"reason\":\"ok\"}\n```\n";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.decision, "implement");
});

test("fenced no tag", () => {
  const msg =
    "Result:\n```\n{\"decision\":\"pushback\",\"reason\":\"x\"}\n```";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.decision, "pushback");
});

test("prose with stray { before envelope", () => {
  const msg =
    "I edited the {foo} placeholder. Final answer:\n```json\n{\"decision\":\"implement\",\"reason\":\"ok\"}\n```";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.decision, "implement");
});

test("nested object", () => {
  const NestedSchema = z.object({
    decision: z.string(),
    memoryUpdate: z.object({ addTags: z.array(z.string()) }),
  });
  const msg = `{"decision":"implement","memoryUpdate":{"addTags":["a","b"]}}`;
  const r = parseJsonEnvelope(msg, NestedSchema);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value?.memoryUpdate.addTags, ["a", "b"]);
});

test("multiple fenced blocks — pick last valid", () => {
  const msg =
    "First try:\n" +
    "```json\n{\"decision\":\"unknown\",\"reason\":\"first\"}\n```\n" +
    "Actually:\n" +
    "```json\n{\"decision\":\"implement\",\"reason\":\"second\"}\n```";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.reason, "second");
});

test("no envelope at all", () => {
  const r = parseJsonEnvelope(
    "just some prose with no JSON whatsoever",
    EnvelopeSchema,
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /No JSON envelope/);
});

test("malformed envelope reports schema validation failure", () => {
  const msg = `{"decision":"unknown","reason":42}`;
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /Schema validation failed/);
});

test("malformed JSON inside fences reports JSON parse failure", () => {
  const msg = "```json\n{not valid json}\n```";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /JSON parse failed/);
});

test("envelope after long prose with stray }", () => {
  const msg =
    "I had to edit foo} which broke the build.\n" +
    "Final:\n" +
    "```json\n{\"decision\":\"implement\",\"reason\":\"ok\"}\n```";
  const r = parseJsonEnvelope(msg, EnvelopeSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.decision, "implement");
});

test("z.unknown() returns parsed value without schema check", () => {
  const r = parseJsonEnvelope(`{"foo":1,"bar":["a"]}`, z.unknown());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { foo: 1, bar: ["a"] });
});

test("z.unknown() with prose-wrapped JSON still extracts", () => {
  const msg =
    'Output: ```json\n{"skip":false,"heading":"H","body":"B"}\n```';
  const r = parseJsonEnvelope(msg, z.unknown());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { skip: false, heading: "H", body: "B" });
});

// -----------------------------------------------------------------------
// Apostrophe-escape salvage (PR #194 follow-up).
//
// LLMs frequently emit `\'` inside JSON strings — adapting from JS/Python
// habits — and the resulting payload is rejected by JSON.parse even though
// the intent is clear. The parser tries the original raw first, then
// falls back to a sanitized version with `\'` → `'`. The success path for
// already-valid JSON is unchanged.
// -----------------------------------------------------------------------

test("stripBareApostropheEscapes: bare \\' becomes '", () => {
  const raw = String.raw`{"reason": "predecessor\'s output"}`;
  const out = stripBareApostropheEscapes(raw);
  assert.equal(out, `{"reason": "predecessor's output"}`);
});

test("stripBareApostropheEscapes: leaves \\\\' alone (literal backslash + apostrophe)", () => {
  // \\' in source = two-char run of backslashes followed by apostrophe.
  // The backslashes form an escape PAIR (\\ = one literal \ in JSON);
  // the apostrophe is a bare character. Salvage must not touch this.
  const raw = String.raw`{"path": "C:\\'temp"}`;
  const out = stripBareApostropheEscapes(raw);
  assert.equal(out, raw);
});

test("stripBareApostropheEscapes: leaves valid escapes untouched", () => {
  const raw = String.raw`{"a": "line\nbreak", "b": "tab\there", "c": "quote\""}`;
  const out = stripBareApostropheEscapes(raw);
  assert.equal(out, raw);
});

test("stripBareApostropheEscapes: handles multiple bare apostrophes in one string", () => {
  const raw = String.raw`{"reason": "agent\'s pushback on operator\'s decision"}`;
  const out = stripBareApostropheEscapes(raw);
  assert.equal(out, `{"reason": "agent's pushback on operator's decision"}`);
});

test("stripBareApostropheEscapes: empty input is a no-op", () => {
  assert.equal(stripBareApostropheEscapes(""), "");
});

test("stripBareApostropheEscapes: trailing backslash without apostrophe is preserved", () => {
  const raw = String.raw`{"a": "trailing\\"}`;
  const out = stripBareApostropheEscapes(raw);
  assert.equal(out, raw);
});

test("parseJsonEnvelope: salvages \\' in summarizer-shaped output", () => {
  const Schema = z.object({
    skip: z.boolean(),
    heading: z.string(),
    body: z.string(),
  });
  // Mirror the real summarizer payload from the 2026-05-06 dry-run that
  // emitted predecessor\'s and tripped JSON.parse.
  const raw = String.raw`{"skip": false, "heading": "Phase-B deferral", "body": "predecessor\'s corpus"}`;
  const r = parseJsonEnvelope(raw, Schema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.body, "predecessor's corpus");
});

test("parseJsonEnvelope: still reports parse error when salvage doesn't help", () => {
  const Schema = z.object({ a: z.string() });
  // Genuinely broken JSON, no apostrophe to salvage.
  const r = parseJsonEnvelope(`{"a": unquoted}`, Schema);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /JSON parse failed/);
});

test("parseJsonEnvelope: doesn't double-process already-valid JSON (no salvage path)", () => {
  // If the original parses cleanly, the salvage branch must NOT run.
  // Smoke this by giving valid JSON that contains a literal backslash
  // sequence the salvager would otherwise mangle in the wrong context.
  const Schema = z.object({ msg: z.string() });
  const r = parseJsonEnvelope(`{"msg": "hello"}`, Schema);
  assert.equal(r.ok, true);
  assert.equal(r.value?.msg, "hello");
});

test("parseJsonEnvelope: salvage produces sanitized raw in the outcome", () => {
  const Schema = z.object({ body: z.string() });
  const raw = String.raw`{"body": "a\'b"}`;
  const r = parseJsonEnvelope(raw, Schema);
  assert.equal(r.ok, true);
  // The outcome's `raw` field should reflect the sanitized text we parsed,
  // so consumers logging it see the salvaged form rather than the broken one.
  assert.equal(r.raw, `{"body": "a'b"}`);
});
