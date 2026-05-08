import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global file path resolves under HOME/.claude/CLAUDE.md", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  // Place the file ONLY at HOME/.claude/CLAUDE.md, not at any other plausible
  // location, to confirm that path is what's read.
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const marker = "HOME_CLAUDE_PATH_MARKER_QQX";
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## Resolved\n\n${marker}\n`,
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(
      out.includes(marker),
      `marker not found — path resolution likely incorrect: ${out.slice(0, 200)}`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
