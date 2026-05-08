import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("all H2 sections of global are present in output", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Push-Back Discipline\n\nbody1.\n\n## Issue Analysis\n\nbody2.\n\n## Documentation Style\n\nbody3.\n",
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
    assert.ok(out.includes("Push-Back Discipline"));
    assert.ok(out.includes("Issue Analysis"));
    assert.ok(out.includes("Documentation Style"));
    assert.ok(out.includes("body1"));
    assert.ok(out.includes("body2"));
    assert.ok(out.includes("body3"));
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
