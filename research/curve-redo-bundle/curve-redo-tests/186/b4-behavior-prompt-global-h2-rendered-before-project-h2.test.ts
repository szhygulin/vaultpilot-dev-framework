import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("a global H2 heading appears before a unique project H2 heading", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Global Heading Unique\n\nbody A.\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "## Project Heading Unique\n\nbody B.\n",
      })) ?? "",
    );
    const gi = out.indexOf("Global Heading Unique");
    const pi = out.indexOf("Project Heading Unique");
    assert.ok(gi >= 0, `global heading missing`);
    assert.ok(pi >= 0, `project heading missing`);
    assert.ok(gi < pi, `global heading must precede project heading`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
