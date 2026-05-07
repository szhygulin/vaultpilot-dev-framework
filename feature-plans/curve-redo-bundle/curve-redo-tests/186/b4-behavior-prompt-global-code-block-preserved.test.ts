import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAgentSystemPrompt } from "./prompt.js";

test("fenced code block from global file is preserved", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-home-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const code = "```bash\ngit push --force-with-lease\n```";
  fs.writeFileSync(
    path.join(home, ".claude", "CLAUDE.md"),
    `## Git Tips\n\n${code}\n`,
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
    assert.ok(out.includes("```bash"), `fence start missing`);
    assert.ok(out.includes("git push --force-with-lease"));
    assert.ok(out.includes("```"), `closing fence missing`);
  } finally {
    process.env.HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
