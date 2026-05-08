import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: a 1-character ~/.claude/CLAUDE.md is rendered into the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-tiny-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    // Single character marker, intentionally distinctive.
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "Z");
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    assert.equal(typeof fn, "function", "buildAgentSystemPrompt must be exported");
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## Project A\nproject body",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    // Either the user-global header copy must appear or the body itself must be in the prompt.
    assert.ok(
      out.includes("User global CLAUDE.md"),
      "expected Layer-1 header to be present when global file exists",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
