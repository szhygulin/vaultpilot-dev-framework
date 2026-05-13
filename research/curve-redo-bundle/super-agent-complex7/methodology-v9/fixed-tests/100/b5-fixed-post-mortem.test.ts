// Issue #100 v5 — failure post-mortem composer + detection.
// FIXES: probe symbol-name variants (FAILURE_SENTINEL vs POSTMORTEM_SENTINEL vs
// POST_MORTEM_SENTINEL; detectPendingPostMortem vs findUnresolvedPostMortem).
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PATHS = ["./failurePostMortem.js", "./failure-post-mortem.js", "../orchestrator/failurePostMortem.js"];
let mod: any = null;
let compose: any = null;
let detect: any = null;
let sentinel: string | null = null;

async function load() {
  for (const p of PATHS) {
    try {
      const m = await import(p);
      if (m && Object.keys(m).length > 0) return m;
    } catch {}
  }
  return null;
}
function pick(m: any, names: string[]): any {
  for (const n of names) if (m && typeof m[n] === "function") return m[n];
  return null;
}
function pickConst(m: any, names: string[]): string | null {
  for (const n of names) {
    if (!m || m[n] == null) continue;
    const v = m[n];
    if (typeof v === "string" && v.length > 0) return v;
    // Some impls export the sentinel as a RegExp — extract its source as a
    // string so downstream tests can substring-check or pattern-test against it.
    if (v instanceof RegExp) return v.source;
  }
  return null;
}

const setup = (async () => {
  mod = await load();
  if (mod) {
    compose = pick(mod, ["composeFailurePostMortem", "renderFailurePostMortem", "composePostMortem", "buildFailurePostMortem"]);
    detect = pick(mod, ["detectPendingPostMortem", "findUnresolvedPostMortem", "hasPendingPostMortem", "detectPostMortem"]);
    sentinel = pickConst(mod, ["POST_MORTEM_SENTINEL", "POSTMORTEM_SENTINEL", "FAILURE_SENTINEL", "POSTMORTEM_HEADER", "POST_MORTEM_HEADER"]);
  }
})();

test("b5 module + functions loaded", async () => {
  await setup;
  assert.ok(mod, "implementation module not found");
  assert.ok(typeof compose === "function", "compose function not found");
});

test("b5 sentinel constant present", async () => {
  await setup;
  assert.ok(typeof sentinel === "string" && sentinel.length > 5, "sentinel constant not found");
});

test("b5 compose renders body with agent + run + reason", async () => {
  await setup;
  const body = compose({
    agentId: "agent-Y",
    runId: "run-X",
    errorSubtype: "broken pipe",
    durationMs: 7 * 60 * 1000 + 0,
    costUsd: 4.51,
    partialBranchUrl: "https://x/y",
  });
  assert.ok(typeof body === "string" && body.length > 50, "body should be a non-trivial string");
  assert.ok(body.includes("agent-Y"), "body should contain the agent ID");
  assert.ok(body.includes("run-X"), "body should contain the run ID");
});

test("b5 compose includes cost when provided", async () => {
  await setup;
  const body = compose({ agentId: "a", runId: "r", errorSubtype: "x", durationMs: 0, costUsd: 4.51 });
  assert.match(body, /\$?4\.51|4\.51/, "body should reference the cost figure");
});

test("b5 compose fallback for unknown error subtype", async () => {
  await setup;
  const body = compose({ agentId: "a", runId: "r", errorSubtype: undefined as any, durationMs: 0 });
  assert.ok(/unknown|n\/a|none/i.test(body) || body.length > 20, "missing-subtype body should still be coherent");
});

test("b5 detect finds pending post-mortem in comments containing sentinel", async () => {
  await setup;
  if (typeof detect !== "function" || !sentinel) return;
  // The sentinel may be a literal string OR a regex source. Use the canonical
  // string form ("## vp-dev failure post-mortem") which any sentinel must match
  // since the agreed-on header per the issue body is that line.
  const canonicalHeader = "## vp-dev failure post-mortem";
  const comments = [{ body: `${canonicalHeader}\n\nagent-Y crashed`, user: { login: "ci" }, created_at: "now" }];
  const r = detect(comments);
  // Different impls return { pending } or boolean or { hasPending }
  const hasPending = r?.pending ?? r?.hasPending ?? r === true ?? r?.found ?? false;
  assert.ok(hasPending, "detect should return truthy when comment contains canonical sentinel header");
});

test("b5 detect returns falsy on empty comments", async () => {
  await setup;
  if (typeof detect !== "function") return;
  const r = detect([]);
  const hasPending = r?.pending ?? r?.hasPending ?? r === true ?? r?.found ?? false;
  assert.equal(!!hasPending, false, "detect should return falsy for empty comments");
});

test("b5 stub-defeat: compose must vary by input", async () => {
  await setup;
  const a = compose({ agentId: "agent-A", runId: "run-1", errorSubtype: "x", durationMs: 0 });
  const b = compose({ agentId: "agent-B", runId: "run-2", errorSubtype: "x", durationMs: 0 });
  assert.notEqual(a, b, "compose output must vary by agent/run IDs (otherwise it's a constant stub)");
});
