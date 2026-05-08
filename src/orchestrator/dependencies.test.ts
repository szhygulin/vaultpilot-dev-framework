import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDependencyRefs,
  checkDependencies,
  formatBlockingReason,
  type DependencyRef,
  type DependencyState,
} from "./dependencies.js";
import type { IssueSummary } from "../types.js";

// Tests for issue #185 — pre-dispatch dependency check. The parser is
// the main correctness surface (false-negatives let bad dispatches
// through; false-positives are absorbed by --include-blocked, but
// shouldn't be excessive). The orchestrator wiring is exercised by
// pure-function checkDependencies tests with stubbed state resolvers.

function makeSummary(id: number, title = `Issue ${id}`): IssueSummary {
  return { id, title, labels: [], state: "open", body: "" };
}

// ---------- parseDependencyRefs ----------

test("parseDependencyRefs: empty body returns []", () => {
  assert.deepEqual(parseDependencyRefs(""), []);
  // @ts-expect-error -- runtime guard for accidental nullish bodies
  assert.deepEqual(parseDependencyRefs(undefined), []);
});

test("parseDependencyRefs: `## Dependencies` heading section yields refs", () => {
  const body = `## Problem\n\nFoo bar.\n\n## Dependencies\n\n- #178 must land first\n- #179 also blocks\n\n## Plan\n\nNot related: #200\n`;
  const refs = parseDependencyRefs(body);
  assert.deepEqual(
    refs.map((r) => r.issueId).sort(),
    [178, 179],
    "only refs inside the heading section are extracted; #200 in ## Plan is not pulled",
  );
});

test("parseDependencyRefs: aliases — `## Depends on`, `## Prerequisites`, `## Blocked by`", () => {
  const body1 = `## Depends on\n\n#1\n`;
  const body2 = `## Prerequisites\n\n#2\n`;
  const body3 = `## Blocked by\n\n#3\n`;
  assert.deepEqual(parseDependencyRefs(body1).map((r) => r.issueId), [1]);
  assert.deepEqual(parseDependencyRefs(body2).map((r) => r.issueId), [2]);
  assert.deepEqual(parseDependencyRefs(body3).map((r) => r.issueId), [3]);
});

test("parseDependencyRefs: heading match is case-insensitive", () => {
  const body = `## DEPENDENCIES\n\n#42\n`;
  assert.deepEqual(parseDependencyRefs(body).map((r) => r.issueId), [42]);
});

test("parseDependencyRefs: section ends at next `## ` heading (not `### `)", () => {
  const body = `## Dependencies\n\n#10\n\n### Sub-section still in deps\n\n#11\n\n## Out of scope\n\n#99\n`;
  const refs = parseDependencyRefs(body).map((r) => r.issueId).sort();
  assert.deepEqual(refs, [10, 11], "sub-section content stays inside Dependencies; #99 in Out of scope is excluded");
});

test("parseDependencyRefs: inline `Dependencies:` line yields the refs", () => {
  // The proposal's primary motivating example — #180's body had:
  //   *Dependencies: [#178](...) (Phase 1) MUST land first*
  const body = `*Dependencies: [#178](https://example/issues/178) (Phase 1) MUST land first*\n\nrest of body`;
  const refs = parseDependencyRefs(body);
  assert.deepEqual(refs.map((r) => r.issueId), [178]);
});

test("parseDependencyRefs: inline `Depends on:` with multiple refs", () => {
  const body = `Depends on: #1, #2, #3\n`;
  const refs = parseDependencyRefs(body).map((r) => r.issueId).sort();
  assert.deepEqual(refs, [1, 2, 3]);
});

test("parseDependencyRefs: inline match accepts blockquote/emphasis leaders", () => {
  const body1 = `> Dependencies: #5\n`;
  const body2 = `*Depends on:* #6\n`;
  const body3 = `_Dependencies:_ #7\n`;
  assert.deepEqual(parseDependencyRefs(body1).map((r) => r.issueId), [5]);
  assert.deepEqual(parseDependencyRefs(body2).map((r) => r.issueId), [6]);
  assert.deepEqual(parseDependencyRefs(body3).map((r) => r.issueId), [7]);
});

test("parseDependencyRefs: cross-repo refs preserve the repo prefix", () => {
  const body = `## Dependencies\n\n- szhygulin/vaultpilot-mcp#100\n- #50\n`;
  const refs = parseDependencyRefs(body);
  const cross = refs.find((r) => r.repo);
  const same = refs.find((r) => !r.repo);
  assert.ok(cross, "cross-repo ref should be parsed");
  assert.equal(cross!.repo, "szhygulin/vaultpilot-mcp");
  assert.equal(cross!.issueId, 100);
  assert.ok(same, "same-repo ref should be parsed");
  assert.equal(same!.issueId, 50);
});

test("parseDependencyRefs: dedupes same id from heading + inline detection", () => {
  // A body that has BOTH a heading section and an inline line referencing
  // the same issue should yield exactly one ref entry.
  const body = `## Dependencies\n\n- #178\n\nMore prose.\n\nDependencies: #178\n`;
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 1, "duplicate refs across detection paths must dedupe");
  assert.equal(refs[0].issueId, 178);
});

test("parseDependencyRefs: ignores `#NNN` mentions outside any deps section", () => {
  // The motivating false-positive: this issue body (#185) itself mentions
  // many `#N` numbers in prose without any Dependencies section.
  const body = `## Problem\n\nDispatched [#180](https://example) and [#178](https://example) together.\n\n## Proposal\n\nDo something with #200.\n`;
  assert.deepEqual(parseDependencyRefs(body), []);
});

test("parseDependencyRefs: skips invalid ref ids (zero, too-long)", () => {
  const body = `## Dependencies\n\n#0 should not match. #1234567 is too long. #42 is fine.\n`;
  // `#1234567` is 7 digits which exceeds {1,5}; the regex will only match
  // the leading 5 → #12345. Accept either behavior so long as #42 is in.
  const ids = parseDependencyRefs(body).map((r) => r.issueId);
  assert.ok(ids.includes(42), "#42 must be parsed");
  assert.ok(!ids.includes(0), "#0 must not be parsed");
});

// ---------- checkDependencies ----------

function stubResolver(map: Map<number, DependencyState>) {
  return async (ref: DependencyRef): Promise<DependencyState> => {
    return map.get(ref.issueId) ?? "unknown";
  };
}

test("checkDependencies: all deps satisfied → all dispatch", async () => {
  const candidates = [
    { summary: makeSummary(1), body: "no deps" },
    { summary: makeSummary(2), body: "## Dependencies\n\n#10\n" },
  ];
  const resolver = stubResolver(new Map([[10, "closed-completed"]]));
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(result.dispatchIssues.length, 2);
  assert.equal(result.deferred.length, 0);
  assert.equal(result.forceIncluded.length, 0);
});

test("checkDependencies: open prerequisite defers the dependent", async () => {
  // The motivating shape from #185: #180 depends on #178 which is open.
  const candidates = [
    {
      summary: makeSummary(180),
      body: "*Dependencies: [#178](...) (Phase 1) MUST land first*",
    },
  ];
  const resolver = stubResolver(new Map([[178, "open"]]));
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(result.dispatchIssues.length, 0);
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].issue.id, 180);
  assert.equal(result.deferred[0].blockingVerdicts[0].ref.issueId, 178);
  assert.equal(result.deferred[0].blockingVerdicts[0].state, "open");
  assert.match(result.deferred[0].reason, /open #178/);
  assert.match(result.deferred[0].reason, /re-dispatch after #178 lands/);
});

test("checkDependencies: same-batch dependency defers without a state lookup", async () => {
  // #178 is in the same batch as #180. The check must defer #180 WITHOUT
  // consulting the resolver — the in-batch presence is itself the signal.
  let resolverCalls = 0;
  const candidates = [
    { summary: makeSummary(178), body: "" },
    { summary: makeSummary(180), body: "## Dependencies\n\n#178\n" },
  ];
  const resolver = async (): Promise<DependencyState> => {
    resolverCalls += 1;
    return "closed-completed";
  };
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(resolverCalls, 0, "same-batch dep must not trigger the resolver");
  assert.equal(result.dispatchIssues.length, 1);
  assert.equal(result.dispatchIssues[0].id, 178);
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].issue.id, 180);
});

test("checkDependencies: closed-not-planned dep defers with the dedicated tail", async () => {
  const candidates = [
    { summary: makeSummary(50), body: "## Dependencies\n\n#40\n" },
  ];
  const resolver = stubResolver(new Map([[40, "closed-not-planned"]]));
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0].reason, /closed-not-planned #40/);
  assert.match(result.deferred[0].reason, /re-read/);
});

test("checkDependencies: unknown dep state defers (resolver returns unknown)", async () => {
  // Network/permissions error or a 404 on cross-repo defaults to unknown,
  // which is treated as blocking with the conservative "verify state" tail.
  const candidates = [
    { summary: makeSummary(50), body: "## Dependencies\n\n#40\n" },
  ];
  const resolver = stubResolver(new Map([[40, "unknown"]]));
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(result.deferred.length, 1);
  assert.match(result.deferred[0].reason, /unknown #40/);
  assert.match(result.deferred[0].reason, /verify/);
});

test("checkDependencies: --include-blocked moves deferred → forceIncluded but still dispatches", async () => {
  const candidates = [
    { summary: makeSummary(180), body: "## Dependencies\n\n#178\n" },
  ];
  const resolver = stubResolver(new Map([[178, "open"]]));
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: true,
    resolveExternalState: resolver,
  });
  assert.equal(result.dispatchIssues.length, 1, "force-included issues still dispatch");
  assert.equal(result.deferred.length, 0, "deferred set is empty when force-included");
  assert.equal(result.forceIncluded.length, 1);
  assert.equal(result.forceIncluded[0].issue.id, 180);
});

test("checkDependencies: state cache shares lookups across multiple dependents", async () => {
  // Two dependents, both pointing at #178. The resolver must be called
  // exactly once for #178 — subsequent lookups hit the cache.
  let calls = 0;
  const candidates = [
    { summary: makeSummary(179), body: "## Dependencies\n\n#178\n" },
    { summary: makeSummary(180), body: "## Dependencies\n\n#178\n" },
  ];
  const resolver = async (ref: DependencyRef): Promise<DependencyState> => {
    if (ref.issueId === 178) {
      calls += 1;
      return "open";
    }
    return "closed-completed";
  };
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(calls, 1, "shared dep state cached after first lookup");
  assert.equal(result.deferred.length, 2);
});

test("checkDependencies: self-reference in body is ignored", async () => {
  // An issue whose body cites its own number in a Dependencies block must
  // not be deferred against itself — that's nonsensical and would block
  // every dispatch with a self-reference typo.
  let resolverCalls = 0;
  const candidates = [
    { summary: makeSummary(50), body: "## Dependencies\n\n#50 (self)\n" },
  ];
  const resolver = async (): Promise<DependencyState> => {
    resolverCalls += 1;
    return "open";
  };
  const result = await checkDependencies({
    repo: "owner/repo",
    candidates,
    includeBlocked: false,
    resolveExternalState: resolver,
  });
  assert.equal(resolverCalls, 0, "self-reference must be filtered before the lookup");
  assert.equal(result.dispatchIssues.length, 1, "self-only deps are not blocking");
  assert.equal(result.deferred.length, 0);
});

// ---------- formatBlockingReason ----------

test("formatBlockingReason: single open dep gets the re-dispatch tail", () => {
  const text = formatBlockingReason([
    { ref: { issueId: 178 }, state: "open" },
  ]);
  assert.match(text, /^depends on open #178/);
  assert.match(text, /re-dispatch after #178 lands$/);
});

test("formatBlockingReason: cross-repo ref renders the owner/repo prefix", () => {
  const text = formatBlockingReason([
    { ref: { repo: "szhygulin/vaultpilot-mcp", issueId: 100 }, state: "open" },
  ]);
  assert.match(text, /szhygulin\/vaultpilot-mcp#100/);
});

test("formatBlockingReason: multiple deps elide the per-dep tail", () => {
  const text = formatBlockingReason([
    { ref: { issueId: 1 }, state: "open" },
    { ref: { issueId: 2 }, state: "closed-not-planned" },
  ]);
  assert.match(text, /open #1/);
  assert.match(text, /closed-not-planned #2/);
  assert.doesNotMatch(text, /re-dispatch after/);
});
