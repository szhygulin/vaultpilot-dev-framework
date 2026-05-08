import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md is read from $HOME/.claude/CLAUDE.md when HOME is overridden", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## R\nHOME_RESOLVED_TOKEN_4242\n",
  );
  fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
  fs.writeFileSync(path.join(agentsDir, agentId, "CLAUDE.md"), "## A\n");
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const result = String(
      await (buildAgentSystemPrompt as any)({
        agentId,
        liveProjectClaudeMd: "## L\n",
        agentsDir,
      }),
    );
    assert.ok(
      result.includes("HOME_RESOLVED_TOKEN_4242"),
      "global file resolved via HOME override should appear",
    );
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
