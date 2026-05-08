import { test } from "node:test";
import assert from "node:assert/strict";
import { getIssue } from "./gh.js";

// Stub-shaped issue record that `fetchIssueRecord` would return on a
// successful `gh issue view` call. The retry tests inject a fake fetcher
// via the `_fetch` test seam so no real `gh` shell-out happens.
const FIXTURE_RECORD = {
  number: 204,
  title: "fix(curve-study): transient gh issue view 404 should retry",
  state: "OPEN",
  labels: [{ name: "bug" }],
  body: "",
};

test("getIssue: first-attempt success returns issue, no retries fired", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await getIssue("owner/repo", 204, {
    sleep: async (ms) => { sleeps.push(ms); },
    _fetch: async () => {
      calls += 1;
      return FIXTURE_RECORD;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(result?.id, 204);
  assert.equal(result?.title, FIXTURE_RECORD.title);
  assert.equal(result?.state, "open");
  assert.deepEqual(result?.labels, ["bug"]);
});

test("getIssue: transient failure then success returns issue after retry", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const onRetryAttempts: number[] = [];
  const result = await getIssue("owner/repo", 172, {
    retryDelaysMs: [10, 20],
    sleep: async (ms) => { sleeps.push(ms); },
    onRetry: (attempt) => { onRetryAttempts.push(attempt); },
    _fetch: async () => {
      calls += 1;
      if (calls === 1) throw new Error("HTTP 404 transient");
      return { ...FIXTURE_RECORD, number: 172, title: "transient ok" };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [10]);
  assert.deepEqual(onRetryAttempts, [1]);
  assert.equal(result?.id, 172);
});

test("getIssue: persistent failure exhausts retries and returns null", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const onRetryAttempts: number[] = [];
  const result = await getIssue("owner/repo", 999, {
    retryDelaysMs: [10, 20],
    sleep: async (ms) => { sleeps.push(ms); },
    onRetry: (attempt) => { onRetryAttempts.push(attempt); },
    _fetch: async () => {
      calls += 1;
      throw new Error("HTTP 404: not found");
    },
  });
  // delays.length + 1 = 3 total attempts; 2 retry sleeps fire between them.
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
  assert.deepEqual(onRetryAttempts, [1, 2]);
  assert.equal(result, null);
});

test("getIssue: empty retryDelaysMs disables retries (legacy single-attempt path)", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await getIssue("owner/repo", 999, {
    retryDelaysMs: [],
    sleep: async (ms) => { sleeps.push(ms); },
    _fetch: async () => {
      calls += 1;
      throw new Error("transient");
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(result, null);
});

test("getIssue: success on the LAST retry attempt still returns the issue (no off-by-one)", async () => {
  // Three total attempts; first two fail, third succeeds. Verifies the
  // loop doesn't accidentally bail on the last retry.
  let calls = 0;
  const sleeps: number[] = [];
  const result = await getIssue("owner/repo", 180, {
    retryDelaysMs: [5, 10],
    sleep: async (ms) => { sleeps.push(ms); },
    _fetch: async () => {
      calls += 1;
      if (calls < 3) throw new Error("hiccup");
      return { ...FIXTURE_RECORD, number: 180, title: "ok" };
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [5, 10]);
  assert.equal(result?.id, 180);
});
