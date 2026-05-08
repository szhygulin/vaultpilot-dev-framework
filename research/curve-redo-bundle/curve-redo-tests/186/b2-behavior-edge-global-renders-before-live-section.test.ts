import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: Layer-1 (global) appears before Layer-2 (live) in the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-ord12-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const G = "GMARK_ORD12_8B";
  const L = "LMARK_ORD12_8B";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `## GH\n${G}\n`);
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: `## LH\n${L}\n`,
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    const gIdx = out.indexOf(G);
    const lIdx = out.indexOf(L);
    assert.ok(gIdx >= 0, "global marker missing");
    assert.ok(lIdx >= 0, "live marker missing");
    assert.ok(gIdx < lIdx, `global must precede live (gIdx=${gIdx}, lIdx=${lIdx})`);
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
