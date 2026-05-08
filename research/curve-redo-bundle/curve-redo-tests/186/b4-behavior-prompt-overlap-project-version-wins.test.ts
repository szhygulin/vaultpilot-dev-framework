import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("when project H2 overlaps global H2, project version's body still appears", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Git/PR Workflow\n\nGLOBAL_GIT_BODY_OVR\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const projectBody = "PROJECT_GIT_BODY_OVR_TXT";
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: `## Git/PR Workflow\n\n${projectBody}\n`,
      })) ?? "",
    );
    // Project (more-specific, later in prompt) keeps its body.
    assert.ok(
      out.includes(projectBody),
      `project's overriding body must remain in output`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
