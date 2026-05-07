import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("project rules section still renders when global is also loaded", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Global Rule\n\nGLOBAL_BODY_TXT\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const projectMark = "PROJECT_BODY_TXT_HHJ";
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: `## Project Rule\n\n${projectMark}\n`,
      })) ?? "",
    );
    assert.ok(out.includes("GLOBAL_BODY_TXT"), `global body missing`);
    assert.ok(out.includes(projectMark), `project body missing`);
    assert.ok(out.includes("Project Rule"), `project H2 missing`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
