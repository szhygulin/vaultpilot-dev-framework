import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md with multiple H2 sections renders all of them", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-err-multih2-"));
  const claudeDir = path.join(tmp, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "CLAUDE.md"),
    "## First\n\nAlpha ZZZNEEDLE004A.\n\n## Second\n\nBeta ZZZNEEDLE004B.\n",
  );

  const originalHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    const fn = buildAgentSystemPrompt as unknown as (opts: unknown) => Promise<string>;
    const result = await fn({ agentId: "vp-err-multih2" });
    assert.equal(typeof result, "string");
    assert.match(result, /ZZZNEEDLE004A/);
    assert.match(result, /ZZZNEEDLE004B/);
  } finally {
    process.env.HOME = originalHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
