import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  migrateContent,
  stripLegacyTagsFromLine,
} from "./migrateTagsToSidecar.js";
import { deriveStableSectionId } from "../state/lessonUtility.js";

describe("stripLegacyTagsFromLine", () => {
  it("removes `tags:` from a legacy sentinel line", () => {
    assert.equal(
      stripLegacyTagsFromLine(
        "<!-- run:r1 issue:#42 outcome:implement ts:2026-05-01T00:00:00.000Z tags:auth,refactor -->",
      ),
      "<!-- run:r1 issue:#42 outcome:implement ts:2026-05-01T00:00:00.000Z -->",
    );
  });

  it("leaves tagless sentinels alone", () => {
    const line =
      "<!-- run:r1 issue:#42 outcome:implement ts:2026-05-01T00:00:00.000Z -->";
    assert.equal(stripLegacyTagsFromLine(line), line);
  });

  it("leaves non-sentinel lines alone", () => {
    assert.equal(stripLegacyTagsFromLine("## Heading"), "## Heading");
    assert.equal(stripLegacyTagsFromLine(""), "");
  });

  it("works with multi-issue (compacted) sentinels", () => {
    assert.equal(
      stripLegacyTagsFromLine(
        "<!-- run:r1 issue:#100+#101+#102 outcome:compacted ts:2026-05-07T00:00:00Z tags:zeta,eta -->",
      ),
      "<!-- run:r1 issue:#100+#101+#102 outcome:compacted ts:2026-05-07T00:00:00Z -->",
    );
  });
});

describe("migrateContent", () => {
  it("empty / sentinel-free content is a no-op", () => {
    const r1 = migrateContent("");
    assert.equal(r1.rewritten, "");
    assert.equal(r1.legacySentinelsFound, 0);
    assert.deepEqual(r1.sidecarEntries, {});

    const md = "# Heading\n\nSome body.\n";
    const r2 = migrateContent(md);
    assert.equal(r2.rewritten, md);
    assert.equal(r2.legacySentinelsFound, 0);
    assert.deepEqual(r2.sidecarEntries, {});
  });

  it("extracts tags + strips them from legacy sentinels", () => {
    const md = [
      "# Seed",
      "",
      "<!-- run:r1 issue:#100 outcome:implement ts:2026-05-07T00:00:00Z tags:alpha,beta -->",
      "## Lesson 100",
      "body",
      "",
      "<!-- run:r2 issue:#101 outcome:implement ts:2026-05-08T00:00:00Z tags:gamma -->",
      "## Lesson 101",
      "body",
      "",
    ].join("\n");

    const r = migrateContent(md);
    assert.equal(r.legacySentinelsFound, 2);

    const id100 = deriveStableSectionId("r1", [100]);
    const id101 = deriveStableSectionId("r2", [101]);
    assert.deepEqual(r.sidecarEntries[id100], ["alpha", "beta"]);
    assert.deepEqual(r.sidecarEntries[id101], ["gamma"]);

    assert.ok(!r.rewritten.includes("tags:"));
    assert.ok(r.rewritten.includes("<!-- run:r1 issue:#100 outcome:implement ts:2026-05-07T00:00:00Z -->"));
    assert.ok(r.rewritten.includes("<!-- run:r2 issue:#101 outcome:implement ts:2026-05-08T00:00:00Z -->"));
    assert.ok(r.rewritten.includes("## Lesson 100"));
    assert.ok(r.rewritten.includes("## Lesson 101"));
  });

  it("idempotent: re-running on already-migrated content is a no-op", () => {
    const md = [
      "# Seed",
      "",
      "<!-- run:r1 issue:#100 outcome:implement ts:2026-05-07T00:00:00Z tags:alpha,beta -->",
      "## Lesson 100",
      "body",
      "",
    ].join("\n");
    const first = migrateContent(md);
    const second = migrateContent(first.rewritten);
    assert.equal(second.legacySentinelsFound, 0);
    assert.deepEqual(second.sidecarEntries, {});
    assert.equal(second.rewritten, first.rewritten);
  });

  it("mixed file (some legacy, some already-migrated) extracts only the legacy", () => {
    const md = [
      "# Seed",
      "",
      "<!-- run:r1 issue:#100 outcome:implement ts:t1 tags:alpha -->",
      "## Lesson 100",
      "body",
      "",
      "<!-- run:r2 issue:#101 outcome:implement ts:t2 -->",
      "## Lesson 101",
      "body",
      "",
    ].join("\n");
    const r = migrateContent(md);
    assert.equal(r.legacySentinelsFound, 1);
    const id100 = deriveStableSectionId("r1", [100]);
    assert.deepEqual(r.sidecarEntries[id100], ["alpha"]);
    assert.equal(Object.keys(r.sidecarEntries).length, 1);
  });

  it("compacted (multi-issue) sentinels resolve to a stable ID over the merged ID set", () => {
    const md = [
      "<!-- run:r1 issue:#100+#101+#102 outcome:compacted ts:2026-05-07T00:00:00Z tags:zeta,eta -->",
      "## Compacted lesson",
      "body",
      "",
    ].join("\n");
    const r = migrateContent(md);
    assert.equal(r.legacySentinelsFound, 1);
    const id = deriveStableSectionId("r1", [100, 101, 102]);
    assert.deepEqual(r.sidecarEntries[id], ["eta", "zeta"]);
    assert.ok(!r.rewritten.includes("tags:"));
  });
});
