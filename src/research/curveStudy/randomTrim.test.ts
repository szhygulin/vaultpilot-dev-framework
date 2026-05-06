import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSections, planRandomTrims, randomTrim, slugify } from "./randomTrim.js";

const SAMPLE = `# Project rules

Some preamble text.

## First Rule

Body of first rule. Lorem ipsum dolor sit amet.

## Second Rule — with em dash

Body of second rule.
Multiple lines.

## Third Rule

Body of third.

### Sub-heading inside third
Sub body.

## Fourth Rule

Final body.
`;

test("parseSections: separates preamble + ## sections, sub-headings stay inside parent", () => {
  const r = parseSections(SAMPLE);
  assert.equal(r.sections.length, 4);
  assert.equal(r.sections[0].heading, "## First Rule");
  assert.equal(r.sections[2].heading, "## Third Rule");
  assert.ok(r.sections[2].body.includes("### Sub-heading"), "sub-heading should be inside parent");
  assert.ok(r.preamble.startsWith("# Project rules"));
  assert.ok(r.preamble.includes("Some preamble text"));
});

test("slugify: stable, alphanum-and-hyphen identifiers from headings", () => {
  assert.equal(slugify("## First Rule"), "first-rule");
  assert.equal(slugify("## Second Rule — with em dash"), "second-rule-with-em-dash");
  assert.equal(slugify("##  Trim Mixed Imperative + Rationale Prose"), "trim-mixed-imperative-rationale-prose");
});

test("randomTrim: deterministic — same seed yields byte-identical output", () => {
  const a = randomTrim({ parent: SAMPLE, targetBytes: 200, seed: 42 });
  const b = randomTrim({ parent: SAMPLE, targetBytes: 200, seed: 42 });
  assert.equal(a.trimmed, b.trimmed);
  assert.deepEqual(a.selectedIds, b.selectedIds);
});

test("randomTrim: different seeds yield different selections (larger parent)", () => {
  // Build a parent with 8 sections of varying sizes so the budget admits
  // multiple distinct subsets — random shuffling actually changes outcomes.
  const sections = Array.from({ length: 8 }, (_, i) => {
    const body = "x".repeat(50 + i * 30);
    return `## Rule ${i}\n${body}\n`;
  });
  const parent = "# Title\n\nPreamble.\n\n" + sections.join("\n");
  // Target ~half the total: forces random selection of which sections fit
  const total = parent.length;
  const target = Math.floor(total / 2);
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const sels = new Set(
    seeds.map((s) => randomTrim({ parent, targetBytes: target, seed: s }).selectedIds.join(",")),
  );
  assert.ok(sels.size > 1, `expected >1 distinct selections across 10 seeds; got ${sels.size}`);
});

test("randomTrim: trimmed bytes do not exceed target (greedy fill never overshoots)", () => {
  for (const seed of [1, 17, 100, 1234, 99999]) {
    const r = randomTrim({ parent: SAMPLE, targetBytes: 150, seed });
    assert.ok(r.actualBytes <= 150, `seed=${seed}: actual=${r.actualBytes} > 150`);
  }
});

test("randomTrim: preserve list keeps named sections in every trim", () => {
  const ids = ["first-rule", "third-rule"];
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = randomTrim({ parent: SAMPLE, preserve: ids, targetBytes: 200, seed });
    for (const id of ids) {
      assert.ok(r.selectedIds.includes(id), `seed=${seed}: preserved ${id} dropped`);
    }
  }
});

test("randomTrim: selected sections appear in parent-file order, not shuffle order", () => {
  // With this small parent, "all 4 sections fit" — selectedIds should match the parent order
  const r = randomTrim({ parent: SAMPLE, targetBytes: 1000, seed: 999 });
  assert.deepEqual(r.selectedIds, ["first-rule", "second-rule-with-em-dash", "third-rule", "fourth-rule"]);
});

test("randomTrim: tiny budget keeps only preamble + whatever fits", () => {
  const r = randomTrim({ parent: SAMPLE, targetBytes: 50, seed: 42 });
  // At 50 bytes budget, after preamble (~30B) probably no section fits — selectedIds should be empty or 1
  assert.ok(r.selectedIds.length <= 1, `expected ≤1 section, got ${r.selectedIds.length}`);
  assert.ok(r.actualBytes <= 50);
});

test("planRandomTrims: produces sizes × replicates plans", () => {
  const plans = planRandomTrims({
    parent: SAMPLE,
    sizes: [100, 200, 400],
    replicates: 3,
    seedBase: 100,
  });
  assert.equal(plans.length, 9);
  // Each plan is unique by (size, seed)
  const keys = new Set(plans.map((p) => `${p.size}:${p.seed}`));
  assert.equal(keys.size, 9);
});

test("planRandomTrims: replicates at the same size produce different selections", () => {
  const plans = planRandomTrims({
    parent: SAMPLE,
    sizes: [150],
    replicates: 5,
    seedBase: 0,
  });
  const sels = new Set(plans.map((p) => p.result.selectedIds.join(",")));
  assert.ok(sels.size >= 2, "5 replicates at the same size should produce ≥2 distinct selections");
});

test("planRandomTrims: rejects non-positive replicates", () => {
  assert.throws(() =>
    planRandomTrims({ parent: SAMPLE, sizes: [100], replicates: 0, seedBase: 0 }),
  );
});
