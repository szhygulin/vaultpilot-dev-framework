import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("global header text appears before any 'Project rules' / project-related header", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Foo\n\nbody.\n",
  );
  const prev = process.env.HOME;
  process.env.HOME = home;
  try {
    const out = String(
      (await (buildAgentSystemPrompt as any)({
        agentId: "test-agent",
        liveProjectClaudeMd: "## Foo Project\n\nproject_body.\n",
      })) ?? "",
    );
    const giHeader = out.indexOf("User global CLAUDE.md");
    const projHeader = out.indexOf("Project rules");
    assert.ok(giHeader >= 0, `global header text missing`);
    assert.ok(projHeader >= 0, `'Project rules' header text missing`);
    assert.ok(
      giHeader < projHeader,
      `expected global header (${giHeader}) before project header (${projHeader})`,
    );
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
