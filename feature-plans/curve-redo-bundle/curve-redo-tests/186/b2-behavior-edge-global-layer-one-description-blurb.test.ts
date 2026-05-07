import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: Layer-1 descriptive blurb accompanies the header when global exists", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-blurb-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "## Anything\nbody\n");
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## L\nb",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    // Issue spec quotes 'per-user process rules' as part of the header copy.
    assert.ok(
      out.includes("per-user process rules"),
      "Layer-1 descriptive phrase 'per-user process rules' must appear in prompt",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
