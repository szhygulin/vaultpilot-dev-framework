import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildAgentSystemPrompt,
  renderResumeBlock,
  stripOverlappingSections,
} from "../agent/prompt.js";
import {
  agentClaudeMdPath,
  agentDir,
  readUserGlobalClaudeMd,
} from "../agent/specialization.js";
import type { AgentRecord } from "../types.js";
import type { WorkflowVars } from "../agent/workflow.js";

test("stripOverlappingSections: drops perAgent ## sections whose heading also appears in live", () => {
  const live = `# Project rules
## Git workflow
- some rule

## CI is a hard gate
- another rule
`;
  const perAgent = `## Crypto/DeFi Transaction Preflight Checks
- agent-specific rule

## Git workflow
- stale copy of the same heading

## Tool Usage Discipline
- agent-specific rule
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.match(out, /## Crypto\/DeFi Transaction Preflight Checks/);
  assert.match(out, /## Tool Usage Discipline/);
  assert.doesNotMatch(out, /## Git workflow/);
  assert.doesNotMatch(out, /stale copy of the same heading/);
});

test("stripOverlappingSections: heading match is case-insensitive and whitespace-trimmed", () => {
  const live = `## Foo Bar
content
`;
  const perAgent = `##  foo bar
stale content

## Other
keep
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /stale content/);
  assert.match(out, /## Other/);
  assert.match(out, /keep/);
});

test("stripOverlappingSections: preserves preamble (content before first ##)", () => {
  const live = `## Shared
x
`;
  const perAgent = `intro paragraph
preserved as preamble

## Shared
drop me

## Unique
keep me
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.match(out, /intro paragraph/);
  assert.match(out, /preserved as preamble/);
  assert.doesNotMatch(out, /drop me/);
  assert.match(out, /## Unique/);
  assert.match(out, /keep me/);
});

test("stripOverlappingSections: no overlap leaves perAgent untouched", () => {
  const live = `## A
1
`;
  const perAgent = `## B
2

## C
3
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.equal(out.trim(), perAgent.trim());
});

test("stripOverlappingSections: live with no ## headings leaves perAgent untouched", () => {
  const live = `just a paragraph, no headings`;
  const perAgent = `## A
1

## B
2
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.equal(out, perAgent);
});

test("stripOverlappingSections: drops the dropped section's body lines too, until next ##", () => {
  const live = `## Drop
x
`;
  const perAgent = `## Drop
line 1
line 2

line 3
## Keep
y
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /line 1/);
  assert.doesNotMatch(out, /line 2/);
  assert.doesNotMatch(out, /line 3/);
  assert.match(out, /## Keep/);
  assert.match(out, /y/);
});

// ---- renderResumeBlock (issue #119 Phase 2) ----------------------------

test("renderResumeBlock: full context — agent, runId, errorSubtype, finalText, partialBranchUrl all present", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-08c4/issue-86-incomplete-run-2026-05-04T16-53-06-188Z",
    runId: "run-2026-05-04T16-53-06-188Z",
    agentId: "agent-08c4",
    errorSubtype: "error_max_turns",
    finalText: "Pushed branch but ran out of turns before gh pr create",
    partialBranchUrl:
      "https://github.com/owner/repo/tree/vp-dev%2Fagent-08c4%2Fissue-86-incomplete-run-2026-05-04T16-53-06-188Z",
  });
  assert.match(out, /agent-08c4/);
  assert.match(out, /run-2026-05-04T16-53-06-188Z/);
  assert.match(out, /error_max_turns/);
  assert.match(out, /git log --oneline origin\/main\.\.HEAD/);
  assert.match(out, /Pushed branch but ran out of turns/);
  assert.match(out, /Salvage branch: https:\/\/github\.com\/owner\/repo\/tree\//);
});

test("renderResumeBlock: missing errorSubtype renders as 'unknown'", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
  });
  assert.match(out, /failure mode: unknown/);
  assert.doesNotMatch(out, /Last meaningful action/);
  assert.doesNotMatch(out, /Salvage branch/);
});

test("renderResumeBlock: truncates finalText to 120 chars and collapses whitespace", () => {
  const long =
    "x".repeat(80) + "\n  multiline\twhitespace\n" + "y".repeat(80);
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
    finalText: long,
  });
  const m = /Last meaningful action recorded: (.+)$/m.exec(out);
  assert.ok(m, "expected the recorded line to render");
  assert.ok(m![1].length <= 120, `truncated text length should be <= 120, got ${m![1].length}`);
  assert.doesNotMatch(m![1], /\t/);
  assert.doesNotMatch(m![1], /\n/);
});

test("renderResumeBlock: omits partial branch line when partialBranchUrl is undefined", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
    errorSubtype: "error_max_budget_usd",
    finalText: "ran out of budget",
  });
  assert.match(out, /failure mode: error_max_budget_usd/);
  assert.match(out, /Last meaningful action recorded: ran out of budget/);
  assert.doesNotMatch(out, /Salvage branch/);
});

test("stripOverlappingSections: section-body containing what looks like a heading marker on its own does not bleed", () => {
  // Edge case: a section's body has a line starting with "##" only at the
  // top level (no leading whitespace), which the regex treats as a new
  // section. That's the expected behavior — markdown semantics say the same.
  const live = `## A
x
`;
  const perAgent = `## A
drop body

## B
keep body
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /drop body/);
  assert.match(out, /keep body/);
});

// ---- readUserGlobalClaudeMd + buildAgentSystemPrompt 3-layer (issue #186) --

let testCounter = 0;
function makeAgentId(): string {
  return `agent-prompt-test-${process.pid}-${++testCounter}`;
}

function makeAgentRecord(agentId: string, name?: string): AgentRecord {
  return {
    agentId,
    createdAt: "2026-05-07T00:00:00.000Z",
    tags: [],
    issuesHandled: 0,
    implementCount: 0,
    pushbackCount: 0,
    errorCount: 0,
    lastActiveAt: "2026-05-07T00:00:00.000Z",
    name,
  };
}

function makeWorkflow(agentId: string, worktreePath: string): WorkflowVars {
  return {
    issueId: 186,
    targetRepo: "owner/repo",
    worktreePath,
    branchName: `vp-dev/${agentId}/issue-186`,
    dryRun: false,
    agentId,
  };
}

async function withSandboxHome<T>(
  fn: (homeDir: string) => Promise<T>,
): Promise<T> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vp-prompt-home-"));
  const prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return await fn(homeDir);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

async function withTargetRepo<T>(
  claudeMd: string | null,
  fn: (targetRepoPath: string) => Promise<T>,
): Promise<T> {
  const targetRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "vp-prompt-target-"),
  );
  if (claudeMd !== null) {
    await fs.writeFile(path.join(targetRepoPath, "CLAUDE.md"), claudeMd);
  }
  try {
    return await fn(targetRepoPath);
  } finally {
    await fs.rm(targetRepoPath, { recursive: true, force: true });
  }
}

async function withPerAgentMd<T>(
  agentId: string,
  perAgentMd: string,
  fn: () => Promise<T>,
): Promise<T> {
  const dir = agentDir(agentId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(agentClaudeMdPath(agentId), perAgentMd);
  try {
    return await fn();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeGlobalClaudeMd(homeDir: string, content: string): Promise<void> {
  await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
  await fs.writeFile(path.join(homeDir, ".claude", "CLAUDE.md"), content);
}

test("readUserGlobalClaudeMd: reads ~/.claude/CLAUDE.md when present, honoring HOME override", async () => {
  await withSandboxHome(async (homeDir) => {
    await writeGlobalClaudeMd(homeDir, "# Operator global rules\n\n## Push-Back Discipline\n- speak up early\n");
    const out = await readUserGlobalClaudeMd();
    assert.match(out, /Operator global rules/);
    assert.match(out, /Push-Back Discipline/);
  });
});

test("readUserGlobalClaudeMd: returns empty string when ~/.claude/CLAUDE.md is missing (graceful skip, not an error)", async () => {
  await withSandboxHome(async () => {
    const out = await readUserGlobalClaudeMd();
    assert.equal(out, "");
  });
});

test("buildAgentSystemPrompt: emits Layer 1 (global) before Layer 2 (live target) and Layer 3 (per-agent), in that order", async () => {
  await withSandboxHome(async (homeDir) => {
    await writeGlobalClaudeMd(
      homeDir,
      "# Operator global rules\n\n## Push-Back Discipline\n- speak up early\n",
    );
    await withTargetRepo(
      "# Project rules\n\n## CI is a hard gate\n- typecheck + build + test must pass\n",
      async (targetRepoPath) => {
        const agentId = makeAgentId();
        await withPerAgentMd(
          agentId,
          "# Per-agent\n\n## Crypto/DeFi Preflight\n- decode calldata before signing\n",
          async () => {
            const out = await buildAgentSystemPrompt({
              agent: makeAgentRecord(agentId, "TestAgent"),
              workflow: makeWorkflow(agentId, targetRepoPath),
              targetRepoPath,
            });
            const globalIdx = out.indexOf("# User global CLAUDE.md");
            const liveIdx = out.indexOf("# Project rules (live target-repo CLAUDE.md");
            const perAgentIdx = out.indexOf("# Per-agent CLAUDE.md");
            assert.ok(globalIdx >= 0, "global section must render");
            assert.ok(liveIdx > globalIdx, "live section must follow global");
            assert.ok(perAgentIdx > liveIdx, "per-agent section must follow live");
            assert.match(out, /Push-Back Discipline/);
            assert.match(out, /CI is a hard gate/);
            assert.match(out, /Crypto\/DeFi Preflight/);
          },
        );
      },
    );
  });
});

test("buildAgentSystemPrompt: omits Layer 1 (global) entirely when ~/.claude/CLAUDE.md is missing — backward-compatible with two-layer behavior", async () => {
  await withSandboxHome(async () => {
    await withTargetRepo(
      "# Project rules\n\n## CI is a hard gate\n- pass\n",
      async (targetRepoPath) => {
        const agentId = makeAgentId();
        await withPerAgentMd(
          agentId,
          "# Per-agent\n\n## Domain Lessons\n- something\n",
          async () => {
            const out = await buildAgentSystemPrompt({
              agent: makeAgentRecord(agentId, "TestAgent"),
              workflow: makeWorkflow(agentId, targetRepoPath),
              targetRepoPath,
            });
            assert.doesNotMatch(out, /# User global CLAUDE\.md/);
            assert.match(out, /# Project rules \(live target-repo CLAUDE\.md/);
            assert.match(out, /# Per-agent CLAUDE\.md/);
          },
        );
      },
    );
  });
});

test("buildAgentSystemPrompt: per-agent ## heading matching a global heading is dropped (per-agent dedups against global ∪ live)", async () => {
  await withSandboxHome(async (homeDir) => {
    await writeGlobalClaudeMd(
      homeDir,
      "# Global\n\n## Push-Back Discipline\n- canonical global version\n",
    );
    await withTargetRepo(
      "# Project rules\n\n## CI is a hard gate\n- pass\n",
      async (targetRepoPath) => {
        const agentId = makeAgentId();
        await withPerAgentMd(
          agentId,
          "## Push-Back Discipline\nstale duplicate of global\n\n## Domain Lessons\nkeep me\n",
          async () => {
            const out = await buildAgentSystemPrompt({
              agent: makeAgentRecord(agentId, "TestAgent"),
              workflow: makeWorkflow(agentId, targetRepoPath),
              targetRepoPath,
            });
            // Global's section keeps its content.
            assert.match(out, /canonical global version/);
            // Per-agent's duplicate of the same heading is dropped.
            assert.doesNotMatch(out, /stale duplicate of global/);
            // Unique per-agent section survives.
            assert.match(out, /Domain Lessons/);
            assert.match(out, /keep me/);
          },
        );
      },
    );
  });
});

test("buildAgentSystemPrompt: live target-repo heading matching a global heading is NOT dropped — both layers emit, more-specific wins by position", async () => {
  await withSandboxHome(async (homeDir) => {
    await writeGlobalClaudeMd(
      homeDir,
      "# Global\n\n## Git/PR Workflow\n- generic global rule\n",
    );
    await withTargetRepo(
      "# Project rules\n\n## Git/PR Workflow\n- target-repo-specific override\n",
      async (targetRepoPath) => {
        const agentId = makeAgentId();
        await withPerAgentMd(
          agentId,
          "## Domain\nspecialization\n",
          async () => {
            const out = await buildAgentSystemPrompt({
              agent: makeAgentRecord(agentId, "TestAgent"),
              workflow: makeWorkflow(agentId, targetRepoPath),
              targetRepoPath,
            });
            // Both copies present.
            assert.match(out, /generic global rule/);
            assert.match(out, /target-repo-specific override/);
            // The target-repo's "Git/PR Workflow" appears AFTER the global's,
            // so attention-position favors it.
            const globalRule = out.indexOf("generic global rule");
            const targetRule = out.indexOf("target-repo-specific override");
            assert.ok(globalRule >= 0 && targetRule > globalRule);
          },
        );
      },
    );
  });
});

test("buildAgentSystemPrompt: suppressTargetClaudeMd suppresses BOTH target-repo and global tiers (#179 calibration parity)", async () => {
  await withSandboxHome(async (homeDir) => {
    await writeGlobalClaudeMd(
      homeDir,
      "# Global\n\n## Push-Back\n- global rule\n",
    );
    await withTargetRepo(
      "# Project rules\n\n## CI\n- pass\n",
      async (targetRepoPath) => {
        const agentId = makeAgentId();
        await withPerAgentMd(
          agentId,
          "## Domain\nspecialization\n",
          async () => {
            const out = await buildAgentSystemPrompt({
              agent: makeAgentRecord(agentId, "TestAgent"),
              workflow: makeWorkflow(agentId, targetRepoPath),
              targetRepoPath,
              suppressTargetClaudeMd: true,
            });
            assert.doesNotMatch(out, /# User global CLAUDE\.md/);
            assert.doesNotMatch(out, /# Project rules \(live target-repo CLAUDE\.md/);
            assert.match(out, /# Per-agent CLAUDE\.md/);
            assert.match(out, /specialization/);
          },
        );
      },
    );
  });
});
