import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as promptMod from "./prompt.js";

test("global edge: section containing a fenced code block keeps its inner code", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vp-edge-code-"));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  const CODE_MARK = "CODE_BODY_MARK_PP1Q";
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".claude", "CLAUDE.md"),
      [
        "## CodeRule",
        "```ts",
        `const ${CODE_MARK} = 1;`,
        "```",
        "",
      ].join("\n"),
    );
    const fn: any = (promptMod as any).buildAgentSystemPrompt;
    const out = String(
      (await Promise.resolve(
        fn({
          agentId: "test-agent",
          agentName: "test-agent",
          liveProjectClaudeMd: "## L\nlb",
          perAgentClaudeMd: null,
        }),
      )) ?? "",
    );
    assert.ok(out.includes(CODE_MARK), "code block content marker must appear");
  } finally {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
