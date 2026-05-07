import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: matching H3 (not H2) does not cause per-agent section to be stripped", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-h3-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const GBODY = "GBODY_H3_RG7";
  const ABODY = "ABODY_H3_RG7";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## GTop\n### SubsharedH3\n${GBODY}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## DistinctLive\nlb",
          perAgentClaudeMd: `## ATop\n### SubsharedH3\n${ABODY}\n`,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(GBODY), "global body must remain");
    assert.ok(
      out.includes(ABODY),
      "per-agent body must remain because the overlap is at H3 (only H2 collisions strip)",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
