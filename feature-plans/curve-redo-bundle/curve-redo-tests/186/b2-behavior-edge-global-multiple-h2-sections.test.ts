import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: three distinct H2 sections in the global file all reach the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-multi-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const A = "GBM_A_77J";
  const B = "GBM_B_77K";
  const C = "GBM_C_77L";
  const content =
    `## AlphaUnique\n${A}\n\n` +
    `## BetaUnique\n${B}\n\n` +
    `## GammaUnique\n${C}\n`;
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), content);
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## Live\nlb",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(A), "first global body marker missing");
    assert.ok(out.includes(B), "second global body marker missing");
    assert.ok(out.includes(C), "third global body marker missing");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
