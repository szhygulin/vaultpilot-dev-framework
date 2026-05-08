import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("every paragraph of multi-paragraph global body appears in prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  const body = "## OneRule\nPARA_A_111\n\nPARA_B_222\n\nPARA_C_333\n";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), body);
  fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
  fs.writeFileSync(path.join(agentsDir, agentId, "CLAUDE.md"), "## Z\n");
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
    assert.ok(result.includes("PARA_A_111"), "first paragraph missing");
    assert.ok(result.includes("PARA_B_222"), "second paragraph missing");
    assert.ok(result.includes("PARA_C_333"), "third paragraph missing");
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
