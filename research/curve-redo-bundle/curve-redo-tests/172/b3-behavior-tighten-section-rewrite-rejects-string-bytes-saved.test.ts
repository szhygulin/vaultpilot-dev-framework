import { test } from "node:test";
import assert from "node:assert/strict";
import { SectionRewriteSchema } from "./tightenClaudeMd.js";

test("SectionRewriteSchema rejects non-numeric estimatedBytesSaved", () => {
  const result = SectionRewriteSchema.safeParse({
    sectionId: "s0",
    rewrittenBody: "body",
    estimatedBytesSaved: "fifty",
  });
  assert.equal(result.success, false);
});
