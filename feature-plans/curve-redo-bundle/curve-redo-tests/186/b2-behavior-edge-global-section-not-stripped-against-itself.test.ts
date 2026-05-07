import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: a single-section global file's body must not be stripped against itself", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-self-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const BODY = "SELF_BODY_MARK_NN8R";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    // Single section in global; nothing else has this heading.
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## OnlyInGlobal\n${BODY}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          // A completely disjoint live and a null per-agent.
          liveProjectClaudeMd: "## DistinctLiveHeading\nlive body unrelated",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(
      out.includes(BODY),
      "global body must remain — Layer-1 is the baseline, not the strip target",
    );
    assert.ok(
      out.includes("OnlyInGlobal"),
      "global heading must remain (it is unique across all three layers)",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
