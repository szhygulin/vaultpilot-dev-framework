import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("long global content is rendered without truncation", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const startMark = "LONG_START_MARK_QQ";
  const endMark = "LONG_END_MARK_ZZ";
  const filler = "line of text\n".repeat(200);
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## Long Section\n\n${startMark}\n${filler}${endMark}\n`,
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
    assert.ok(out.includes(startMark), `start marker missing`);
    assert.ok(out.includes(endMark), `end marker missing`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
