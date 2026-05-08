import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global H2 body remains when project carries the same H2 heading (both rendered)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Git/PR Workflow\n\nGLOBAL_KEEP_BODY_AAQ\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "## Git/PR Workflow\n\nPROJECT_KEEP_BODY_BBQ\n",
      })) ?? "",
    );
    assert.ok(out.includes("GLOBAL_KEEP_BODY_AAQ"), `global body must be kept (it is the least-specific source and not stripped)`);
    assert.ok(out.includes("PROJECT_KEEP_BODY_BBQ"), `project body must also be present`);
    const gi = out.indexOf("GLOBAL_KEEP_BODY_AAQ");
    const pi = out.indexOf("PROJECT_KEEP_BODY_BBQ");
    assert.ok(gi < pi, `global must appear before project (more-specific later)`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
