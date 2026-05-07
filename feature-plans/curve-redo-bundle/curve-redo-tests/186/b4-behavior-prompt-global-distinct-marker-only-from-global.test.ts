import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("unique marker placed only in global file is propagated to built prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const onlyGlobal = "ONLY_IN_GLOBAL_FILE_BTQ7";
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## Operator Process\n\n${onlyGlobal}\n`,
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "## Other\n\nproject body unrelated.\n",
      })) ?? "",
    );
    assert.ok(
      out.includes(onlyGlobal),
      `marker that exists only in ~/.claude/CLAUDE.md must reach the prompt`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
