import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global section appears before per-agent section in prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## G\nGLOBAL_MARKER_3344\n",
  );
  fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, agentId, "CLAUDE.md"),
    "## AgentSpecific\nPERAGENT_MARKER_5566\n",
  );
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
    const idxGlobal = result.indexOf("GLOBAL_MARKER_3344");
    const idxAgent = result.indexOf("PERAGENT_MARKER_5566");
    assert.ok(idxGlobal >= 0, "global marker missing");
    assert.ok(idxAgent >= 0, "per-agent marker missing");
    assert.ok(idxGlobal < idxAgent, "expected global before per-agent");
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
