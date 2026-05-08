import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: H2 with empty body — the heading text still propagates", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-emptyh2-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const HEADING_MARK = "EMPTYBODY_HEAD_BB6Y";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    // Heading line, then immediately EOF.
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      `## ${HEADING_MARK}\n`,
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
    assert.ok(out.includes(HEADING_MARK), "empty-body heading marker must appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
