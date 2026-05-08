import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: Layer-1 header line 'User global CLAUDE.md' is rendered when global exists", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-hdr-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "## Foo\nfoo body\n");
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
    assert.ok(
      out.includes("User global CLAUDE.md"),
      "Layer-1 header text 'User global CLAUDE.md' must be in prompt when global file exists",
    );
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
