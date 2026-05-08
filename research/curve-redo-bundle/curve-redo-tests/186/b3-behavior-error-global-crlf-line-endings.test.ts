import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md with CRLF line endings is loaded without corruption", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-err-crlf-"));
  const claudeDir = path.join(tmp, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "CLAUDE.md"),
    "## Heading\r\n\r\nBody ZZZNEEDLE005 with CRLF.\r\n",
  );

  const originalHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    const fn = buildAgentSystemPrompt as unknown as (opts: unknown) => Promise<string>;
    const result = await fn({ agentId: "vp-err-crlf" });
    assert.equal(typeof result, "string");
    assert.match(result, /ZZZNEEDLE005/);
  } finally {
    process.env.HOME = originalHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
