import { test } from "node:test";
import assert from "node:assert/strict";
import { SectionRewriteSchema } from "./tightenClaudeMd.js";

test("SectionRewriteSchema rejects rewrite missing rewrittenBody", () => {
  const result = SectionRewriteSchema.safeParse({
    sectionId: "s0",
    estimatedBytesSaved: 10,
  });
  assert.equal(result.success, false);
});
