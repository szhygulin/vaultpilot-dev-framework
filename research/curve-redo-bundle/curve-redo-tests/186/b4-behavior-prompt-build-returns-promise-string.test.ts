import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("buildAgentSystemPrompt returns a Promise<string> with global loaded", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## A\n\nGLOB_RT_PROMISE_MARKER\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const ret = (buildAgentSystemPrompt as any)({
      agentId: "test-agent",
      liveProjectClaudeMd: "",
    });
    assert.ok(
      ret && typeof (ret as Promise<unknown>).then === "function",
      `expected a Promise from buildAgentSystemPrompt`,
    );
    const resolved = await ret;
    assert.equal(typeof resolved, "string");
    assert.ok(String(resolved).includes("GLOB_RT_PROMISE_MARKER"));
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
