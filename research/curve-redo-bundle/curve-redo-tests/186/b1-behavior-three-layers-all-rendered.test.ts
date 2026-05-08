import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("three CLAUDE.md sources -> all three layer markers appear", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## GHead\nGLOBAL_TOKEN_aaa\n",
  );
  fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, agentId, "CLAUDE.md"),
    "## AHead\nAGENT_TOKEN_ccc\n",
  );
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const result = String(
      await (buildAgentSystemPrompt as any)({
        agentId,
        liveProjectClaudeMd: "## LHead\nLIVE_TOKEN_bbb\n",
        agentsDir,
      }),
    );
    assert.ok(result.includes("GLOBAL_TOKEN_aaa"), "global content missing");
    assert.ok(result.includes("LIVE_TOKEN_bbb"), "live content missing");
    assert.ok(result.includes("AGENT_TOKEN_ccc"), "per-agent content missing");
    assert.ok(result.includes("User global CLAUDE.md"), "global header missing");
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
