import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("prompt with global file present is longer than with global file absent", async () => {
  const homeA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-homeA-"));
  const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "vp-homeB-"));
  // homeA: no .claude/CLAUDE.md
  fs.mkdirSync(path.join(homeA, ".claude"), { recursive: true });
  // homeB: with content
  fs.mkdirSync(path.join(homeB, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(homeB, ".claude", "CLAUDE.md"),
    "## Distinctive\n\nDISTINCT_BODY_LK_LARGE\n\n".repeat(20),
  );
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
    assert.ok(
      outB.length > outA.length,
      `expected B (with global) to be longer than A (without): ${outB.length} vs ${outA.length}`,
    );
    assert.ok(outB.includes("DISTINCT_BODY_LK_LARGE"), `B missing global body`);
    assert.ok(!outA.includes("DISTINCT_BODY_LK_LARGE"), `A unexpectedly contains global body`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(homeA, { recursive: true, force: true });
    fs.rmSync(homeB, { recursive: true, force: true });
  }
});
