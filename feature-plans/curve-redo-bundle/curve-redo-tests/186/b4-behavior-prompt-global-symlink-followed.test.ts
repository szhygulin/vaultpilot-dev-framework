import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md as symlink is followed and content rendered", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-real-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const marker = "SYMLINK_TARGET_MARKER_QZ7";
  const realFile = path.join(realDir, "global.md");
  fs.writeFileSync(realFile, `## Linked\n\n${marker}\n`);
  fs.symlinkSync(realFile, path.join(home, ".claude", "CLAUDE.md"));
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(out.includes(marker), `symlink target content not loaded`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(realDir, { recursive: true, force: true });
  }
});
