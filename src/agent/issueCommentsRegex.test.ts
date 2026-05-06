import { test } from "node:test";
import assert from "node:assert/strict";
import { ISSUE_COMMENTS_FETCH_RE } from "./codingAgent.js";

test("ISSUE_COMMENTS_FETCH_RE: matches `gh api .../issues/<n>/comments` shape", () => {
  assert.match("gh api repos/owner/repo/issues/650/comments", ISSUE_COMMENTS_FETCH_RE);
  assert.match("gh api repos/owner/repo/issues/12/comments?per_page=100", ISSUE_COMMENTS_FETCH_RE);
});

test("ISSUE_COMMENTS_FETCH_RE: matches `gh issue view ... --comments`", () => {
  assert.match("gh issue view 650 --repo owner/repo --comments", ISSUE_COMMENTS_FETCH_RE);
  assert.match("gh issue view 99 --json title,body,comments", ISSUE_COMMENTS_FETCH_RE);
});

test("ISSUE_COMMENTS_FETCH_RE: does NOT match the body-only fetch shape", () => {
  assert.doesNotMatch("gh issue view 650 --repo owner/repo --json number,title,body,labels,state", ISSUE_COMMENTS_FETCH_RE);
});

test("ISSUE_COMMENTS_FETCH_RE: does NOT match unrelated `gh api` calls", () => {
  assert.doesNotMatch("gh api repos/owner/repo/pulls/650", ISSUE_COMMENTS_FETCH_RE);
  assert.doesNotMatch("gh api user", ISSUE_COMMENTS_FETCH_RE);
});

test("ISSUE_COMMENTS_FETCH_RE: catches comments smuggled into a chained command", () => {
  // Compound shapes that try to slip a comments fetch past the gate
  assert.match(
    "gh issue view 650 --json body && gh api repos/owner/repo/issues/650/comments",
    ISSUE_COMMENTS_FETCH_RE,
  );
});
