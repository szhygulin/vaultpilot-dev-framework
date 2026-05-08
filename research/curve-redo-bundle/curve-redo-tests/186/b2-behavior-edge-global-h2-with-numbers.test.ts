import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: H2 with numbers '## Section 1.2.3' is preserved", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-num-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const BODY = "NUMBER_BODY_MARK_55Z";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## Section 1.2.3 ZUNK\n${BODY}\n`,
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
    assert.ok(out.includes("Section 1.2.3 ZUNK"), "numeric heading must appear");
    assert.ok(out.includes(BODY), "numeric-section body must appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
