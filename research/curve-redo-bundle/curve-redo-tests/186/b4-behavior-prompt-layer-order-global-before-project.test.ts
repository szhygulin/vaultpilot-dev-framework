import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global section appears before project section in prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const globalMark = "GLOBAL_ORDER_MARK_AAA";
  const projectMark = "PROJECT_ORDER_MARK_BBB";
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## Global\n\n${globalMark}\n`,
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: `## Project\n\n${projectMark}\n`,
      })) ?? "",
    );
    const gi = out.indexOf(globalMark);
    const pi = out.indexOf(projectMark);
    assert.ok(gi >= 0, `global marker not found: ${out.slice(0, 200)}`);
    assert.ok(pi >= 0, `project marker not found: ${out.slice(0, 200)}`);
    assert.ok(gi < pi, `global (${gi}) must precede project (${pi})`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
