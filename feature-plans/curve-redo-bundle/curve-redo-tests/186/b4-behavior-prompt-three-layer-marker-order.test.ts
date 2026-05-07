import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global → project markers appear in correct order in built prompt", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const gMark = "M3_GLOBAL_AAA";
  const pMark = "M3_PROJECT_BBB";
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## L1\n\n${gMark}\n`,
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: `## L2\n\n${pMark}\n`,
      })) ?? "",
    );
    const ig = out.indexOf(gMark);
    const ip = out.indexOf(pMark);
    assert.ok(ig >= 0 && ip >= 0, `markers missing: ${out.slice(0, 300)}`);
    assert.ok(ig < ip, `expected global (${ig}) < project (${ip})`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
