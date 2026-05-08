import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("User global CLAUDE.md header sits near the start of the prompt (before project)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## L1\n\nbody.\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const projectBody = "PROJECT_NEAR_TOP_TEST_LL";
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: `## P1\n\n${projectBody}\n`,
      })) ?? "",
    );
    const gh = out.indexOf("User global CLAUDE.md");
    const pp = out.indexOf(projectBody);
    assert.ok(gh >= 0, `global header missing`);
    assert.ok(pp >= 0, `project body missing`);
    assert.ok(gh < pp, `global header must come before project content`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
