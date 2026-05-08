import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: H2 heading with special chars (parens/slashes) survives", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-spec-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const HEADING = "## Foo/Bar (baz) - QQQ-MARK-44H";
  const BODY = "BODY_SPEC_44H";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), `${HEADING}\n${BODY}\n`);
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
    assert.ok(out.includes("QQQ-MARK-44H"), "global heading marker text must appear");
    assert.ok(out.includes(BODY), "global body marker must appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
