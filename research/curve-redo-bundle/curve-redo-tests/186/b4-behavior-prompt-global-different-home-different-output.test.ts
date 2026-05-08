import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("different HOME yields different global content in prompt", async () => {
  const homeA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-homeA-"));
  const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "vp-homeB-"));
  fs.mkdirSync(path.join(homeA, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(homeB, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(homeA, ".claude", "CLAUDE.md"), "## A\n\nMARKER_HOME_AAA\n");
  fs.writeFileSync(path.join(homeB, ".claude", "CLAUDE.md"), "## B\n\nMARKER_HOME_BBB\n");
  const prev = process.env.HOME;
  try {
    process.env.HOME = homeA;
    const outA = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    process.env.HOME = homeB;
    const outB = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(outA.includes("MARKER_HOME_AAA"));
    assert.ok(!outA.includes("MARKER_HOME_BBB"));
    assert.ok(outB.includes("MARKER_HOME_BBB"));
    assert.ok(!outB.includes("MARKER_HOME_AAA"));
  } finally {
    process.env.HOME = prev;
    fs.rmSync(homeA, { recursive: true, force: true });
    fs.rmSync(homeB, { recursive: true, force: true });
  }
});
