import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildAgentSystemPrompt } from "./prompt.js";

test("per-agent H2 dropped when it duplicates a global H2 (more-specific wins, but global already covers)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-h-"));
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-a-"));
  const agentId = "agent-x";
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    "## Push-Back Discipline\nGLOBAL_PUSHBACK_BODY_55\n",
  );
  fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, agentId, "CLAUDE.md"),
    "## Push-Back Discipline\nAGENT_PUSHBACK_BODY_99\n\n## Unique Agent Section\nunique-marker-77\n",
  );
  const prevHome = process.env.HOME;
  const prevUP = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const result = String(
      await (buildAgentSystemPrompt as any)({
        agentId,
        liveProjectClaudeMd: "## ProjectOnly\n",
        agentsDir,
      }),
    );
    assert.ok(
      result.includes("GLOBAL_PUSHBACK_BODY_55"),
      "global push-back body should be present",
    );
    assert.ok(
      !result.includes("AGENT_PUSHBACK_BODY_99"),
      "per-agent duplicate of global heading should be stripped",
    );
    assert.ok(result.includes("unique-marker-77"), "unique per-agent section should remain");
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUP === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUP;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(agentsDir, { recursive: true, force: true });
  }
});
