import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: single H2 section in global file appears verbatim in the prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-1h2-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const HEADING = "## QXAlphaSoloHeading";
  const BODY = "GLB_BODY_MARKER_8K2";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `${HEADING}\n\n${BODY}\n`);
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## Live\nlive body",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(out.includes("QXAlphaSoloHeading"), "global heading text should appear");
    assert.ok(out.includes(BODY), "global body marker should appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
