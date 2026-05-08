import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: per-agent H2 matching only the global is stripped from per-agent", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-stripL3-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const GLOBAL_BODY = "GBODY_5N9P_GLOBAL";
  const AGENT_BODY = "ABODY_5N9P_AGENT";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## SharedHeading\n${GLOBAL_BODY}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## DistinctLive\nlive body",
          perAgentClaudeMd: `## SharedHeading\n${AGENT_BODY}\n`,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(GLOBAL_BODY), "global body must appear (Layer-1 kept)");
    assert.ok(
      !out.includes(AGENT_BODY),
      "per-agent body must be stripped because H2 collides with global",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
