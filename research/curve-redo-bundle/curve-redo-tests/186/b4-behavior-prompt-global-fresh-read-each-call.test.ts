import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global CLAUDE.md is read fresh on each dispatch", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  const file = path.join(home, ".claude", "CLAUDE.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "## Initial\n\nFIRST_VERSION_MARKER\n");
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out1 = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(out1.includes("FIRST_VERSION_MARKER"), `first read missing marker`);
    fs.writeFileSync(file, "## Updated\n\nSECOND_VERSION_MARKER\n");
    const out2 = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "",
      })) ?? "",
    );
    assert.ok(out2.includes("SECOND_VERSION_MARKER"), `second read missing updated marker`);
    assert.ok(!out2.includes("FIRST_VERSION_MARKER"), `stale content cached: ${out2.slice(0, 200)}`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
