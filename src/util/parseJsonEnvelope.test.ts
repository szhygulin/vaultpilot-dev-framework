import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { parseJsonEnvelope } from "./parseJsonEnvelope.js";

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
