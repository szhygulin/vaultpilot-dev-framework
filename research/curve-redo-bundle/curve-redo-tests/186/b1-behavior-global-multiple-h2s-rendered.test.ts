import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("multiple H2 sections in global file all appear in prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## AlphaHeading\nalpha body\n\n## BetaHeading\nbeta body\n\n## GammaHeading\ngamma body\n",
  );
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
        liveProjectClaudeMd: "## P\n",
        agentsDir,
      }),
    );
    assert.ok(result.includes("AlphaHeading"), "alpha");
    assert.ok(result.includes("BetaHeading"), "beta");
    assert.ok(result.includes("GammaHeading"), "gamma");
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
