import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: Layer-1 (global) appears before Layer-3 (per-agent) in the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-ord13-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const G = "GMARK_ORD13_9C";
  const A = "AMARK_ORD13_9C";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `## GH\n${G}\n`);
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## L\nlb",
          perAgentClaudeMd: `## AH\n${A}\n`,
        }),
      )) ?? "",
    );
    const gIdx = out.indexOf(G);
    const aIdx = out.indexOf(A);
    assert.ok(gIdx >= 0, "global marker missing");
    assert.ok(aIdx >= 0, "per-agent marker missing");
    assert.ok(gIdx < aIdx, `global must precede per-agent (gIdx=${gIdx}, aIdx=${aIdx})`);
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
