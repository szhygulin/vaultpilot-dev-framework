import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: ~5KB global body is loaded fully (tail marker present)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-5kb-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const TAIL = "TAIL_MARK_END_ZK6";
  const filler = "a".repeat(5000);
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `## Big\n${filler}\n${TAIL}\n`);
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
    assert.ok(out.includes(TAIL), "tail marker after ~5KB filler must be in prompt");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
