import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global header includes literal '~/.claude/CLAUDE.md' path", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "## Foo\n\nbody.\n");
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(
      out.includes("~/.claude/CLAUDE.md"),
      `expected literal '~/.claude/CLAUDE.md' in output`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
