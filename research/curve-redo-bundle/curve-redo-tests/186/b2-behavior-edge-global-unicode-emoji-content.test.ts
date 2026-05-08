import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: emoji 🎯 inside global body survives into the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-emoji-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const MARKER = "EMOJI_MARK_🎯_TG7";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `## H\n${MARKER}\n`);
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
    assert.ok(out.includes(MARKER), "unicode-bearing global body marker must appear in prompt");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
