import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: three-way H2 overlap — L1 keeps, L2 keeps, L3 dropped", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-3way-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const GBODY = "GBODY_3W_K8R";
  const LBODY = "LBODY_3W_K8R";
  const ABODY = "ABODY_3W_K8R";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## SharedX\n${GBODY}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: `## SharedX\n${LBODY}\n`,
          perAgentClaudeMd: `## SharedX\n${ABODY}\n`,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(GBODY), "global body must remain");
    assert.ok(out.includes(LBODY), "live body must remain");
    assert.ok(
      !out.includes(ABODY),
      "per-agent body must be stripped (overlaps with L1∪L2)",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
