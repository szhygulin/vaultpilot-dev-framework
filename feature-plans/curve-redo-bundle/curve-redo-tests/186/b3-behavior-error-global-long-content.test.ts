import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md with very long content is fully loaded", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-err-long-"));
  const claudeDir = path.join(tmp, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const filler = "lorem ipsum dolor sit amet ".repeat(400);
  fs.writeFileSync(
    path.join(claudeDir, "CLAUDE.md"),
    `## Heading\n\n${filler}\n\nZZZNEEDLE010 at end.\n`,
  );

  const originalHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    const fn = buildAgentSystemPrompt as unknown as (opts: unknown) => Promise<string>;
    const result = await fn({ agentId: "vp-err-long" });
    assert.equal(typeof result, "string");
    assert.match(result, /ZZZNEEDLE010/);
  } finally {
    process.env.HOME = originalHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
