import { test } from "node:test";
import assert from "node:assert/strict";
import type { SectionRewrite } from "./tightenClaudeMd.js";

test("SectionRewrite: minimal valid object exposes sectionId, rewrittenBody, estimatedBytesSaved", () => {
  const rewrite: SectionRewrite = {
    sectionId: "s0",
    rewrittenBody: "body",
    estimatedBytesSaved: 5,
  };
  assert.equal(rewrite.sectionId, "s0");
  assert.equal(rewrite.rewrittenBody, "body");
  assert.equal(rewrite.estimatedBytesSaved, 5);
});
