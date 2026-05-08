import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: file lacking trailing newline still loads its body", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-noeof-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const MARKER = "NOEOF_MARK_44YQ";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    // Note the absence of trailing \n.
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `## H\n${MARKER}`);
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
    assert.ok(out.includes(MARKER), "trailing-newline-less marker must appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
