import { test } from "node:test";
import assert from "node:assert/strict";
import { SectionRewriteSchema } from "./tightenClaudeMd.js";

test("SectionRewriteSchema rejects non-string sectionId", () => {
  const result = SectionRewriteSchema.safeParse({
    sectionId: 0,
    rewrittenBody: "body",
    estimatedBytesSaved: 10,
  });
  assert.equal(result.success, false);
});
