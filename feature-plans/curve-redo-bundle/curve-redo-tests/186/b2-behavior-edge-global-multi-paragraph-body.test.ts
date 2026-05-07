import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: multi-paragraph body preserves all paragraph markers", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-multi-para-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const P1 = "PARA_ONE_MARK_AA1";
  const P2 = "PARA_TWO_MARK_AA2";
  const P3 = "PARA_THREE_MARK_AA3";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## MultiPara\n${P1}\n\n${P2}\n\n${P3}\n`,
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## L\nlb",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(P1), "paragraph 1 marker missing");
    assert.ok(out.includes(P2), "paragraph 2 marker missing");
    assert.ok(out.includes(P3), "paragraph 3 marker missing");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
