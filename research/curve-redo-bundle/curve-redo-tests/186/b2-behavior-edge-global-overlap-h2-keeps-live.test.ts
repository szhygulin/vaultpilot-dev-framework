import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: Layer-1 ∩ Layer-2 H2 overlap keeps both bodies (live wins by ordering)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-keepL2-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const GBODY = "GBODY_KEEP_L1L2_TT3";
  const LBODY = "LBODY_KEEP_L1L2_TT3";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## GitPrWorkflow\n${GBODY}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: `## GitPrWorkflow\n${LBODY}\n`,
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(GBODY), "global body must remain (Layer-1 not stripped against itself)");
    assert.ok(out.includes(LBODY), "target-repo body must remain (per test plan #2: both kept)");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
