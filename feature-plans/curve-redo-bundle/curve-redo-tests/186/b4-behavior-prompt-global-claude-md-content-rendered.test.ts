import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md body content is rendered in built prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const marker = "GLOBAL_BODY_MARKER_NQ4F2K";
  fs.writeFileSync(
    path.join(claudeDir, "CLAUDE.md"),
    `## Process Habits\n\n${marker}\n`,
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const result = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(
      result.includes(marker),
      `expected built prompt to include global marker; got: ${result.slice(0, 400)}`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
