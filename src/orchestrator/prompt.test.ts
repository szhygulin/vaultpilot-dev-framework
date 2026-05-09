import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildTickPrompt, PROMPT_BYTE_BUDGET } from "./prompt.js";
import { agentClaudeMdPath, agentDir } from "../agent/specialization.js";
import type { AgentRecord, IssueSummary } from "../types.js";

// `buildTickPrompt` reads three files per call: the target repo's
// CLAUDE.md (seed), each idle agent's `agents/<id>/CLAUDE.md`, and
// any global CLAUDE.md is NOT consumed here (the dispatcher prompt
// is a different surface than `buildAgentSystemPrompt`). These
// helpers stage the first two on disk, then unwind them in `finally`.

async function withTargetRepo<T>(
  claudeMd: string,
  fn: (targetRepoPath: string) => Promise<T>,
): Promise<T> {
  const targetRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "vp-tick-prompt-target-"),
  );
  await fs.writeFile(path.join(targetRepoPath, "CLAUDE.md"), claudeMd);
  try {
    return await fn(targetRepoPath);
  } finally {
    await fs.rm(targetRepoPath, { recursive: true, force: true });
  }
}

async function withPerAgentMds<T>(
  byAgentId: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const dirs: string[] = [];
  for (const [agentId, content] of Object.entries(byAgentId)) {
    const dir = agentDir(agentId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(agentClaudeMdPath(agentId), content);
    dirs.push(dir);
  }
  try {
    return await fn();
  } finally {
    for (const dir of dirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

function makeAgent(overrides: Partial<AgentRecord> & Pick<AgentRecord, "agentId">): AgentRecord {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: ["general"],
    issuesHandled: 0,
    implementCount: 0,
    pushbackCount: 0,
    errorCount: 0,
    lastActiveAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueSummary> & Pick<IssueSummary, "id">): IssueSummary {
  return {
    title: `Issue ${overrides.id}`,
    labels: [],
    state: "open",
    body: "",
    ...overrides,
  };
}

test("buildTickPrompt: inlines per-agent CLAUDE.md prose verbatim (deduped against seed)", async () => {
  const seed = `# Project rules\n\n## Shared rule\nstays in seed.\n`;
  const perAgent =
    `## Shared rule\nshould be deduped — appears in seed too.\n\n` +
    `## Specialty rule\nUNIQUE_PROSE_TOKEN_glibc_musl_loader\n`;
  const agentId = "agent-test-prompt-prose-a";

  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds({ [agentId]: perAgent }, async () => {
      const { cacheStablePrefix, volatileSuffix } = await buildTickPrompt({
        idleAgents: [makeAgent({ agentId, tags: ["sdk-binary"] })],
        pendingIssues: [
          makeIssue({ id: 99, title: "preflight", body: "glibc vs musl loader fix" }),
        ],
        cap: 1,
        targetRepoPath,
      });

      // Agent prose is in the cache-stable prefix.
      assert.match(cacheStablePrefix, /UNIQUE_PROSE_TOKEN_glibc_musl_loader/);
      assert.doesNotMatch(cacheStablePrefix, /should be deduped/);
      assert.match(cacheStablePrefix, /## Agent agent-test-prompt-prose-a/);
      // Issue list is in the volatile suffix.
      assert.match(volatileSuffix, /Issue #99/);
      assert.match(volatileSuffix, /glibc vs musl loader fix/);
    });
  });
});

test("buildTickPrompt: cache-stable prefix is byte-identical across validation-retry round-trips", async () => {
  // Issue #268: the prefix MUST be byte-identical between attempt 1 and
  // attempt 2 within a single dispatch call, otherwise the prompt-cache
  // hit on retry — the highest-value win — is lost. The only delta
  // between calls is `errorsFromPrior`; that lives in the volatile
  // suffix and must NOT appear in the prefix.
  const seed = `# Project rules\n`;
  const agentId = "agent-test-prompt-cache-stable";
  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds({ [agentId]: "## solo\nminimal\n" }, async () => {
      const baseInput = {
        idleAgents: [makeAgent({ agentId })],
        pendingIssues: [makeIssue({ id: 5, body: "body" })],
        cap: 1,
        targetRepoPath,
      };
      const attempt1 = await buildTickPrompt(baseInput);
      const attempt2 = await buildTickPrompt({
        ...baseInput,
        errorsFromPrior: ["agentId X is not idle / unknown."],
      });

      assert.equal(
        attempt1.cacheStablePrefix,
        attempt2.cacheStablePrefix,
        "prefix must be byte-identical between retries",
      );
      // Suffix differs: attempt 2 carries the prior-error block.
      assert.notEqual(attempt1.volatileSuffix, attempt2.volatileSuffix);
      assert.match(attempt2.volatileSuffix, /PRIOR proposal failed validation/);
      assert.doesNotMatch(attempt1.volatileSuffix, /PRIOR proposal failed validation/);
      // Prefix never carries the error block.
      assert.doesNotMatch(attempt2.cacheStablePrefix, /PRIOR proposal failed validation/);
    });
  });
});

test("buildTickPrompt: cap and pending issues live only in the volatile suffix, not the prefix", async () => {
  // Issue #268: the cap text is part of the cap-directive line that
  // moved into the suffix to keep the prefix cap-agnostic, so a tick
  // where one agent goes busy (cap shrinks) still hits the cache.
  const seed = `# Project rules\n`;
  const agentId = "agent-test-prompt-cap-suffix";
  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds({ [agentId]: "## solo\nminimal\n" }, async () => {
      const cap1 = await buildTickPrompt({
        idleAgents: [makeAgent({ agentId })],
        pendingIssues: [makeIssue({ id: 1 }), makeIssue({ id: 2 })],
        cap: 1,
        targetRepoPath,
      });
      const cap2 = await buildTickPrompt({
        idleAgents: [makeAgent({ agentId })],
        pendingIssues: [makeIssue({ id: 1 }), makeIssue({ id: 2 })],
        cap: 2,
        targetRepoPath,
      });
      assert.equal(
        cap1.cacheStablePrefix,
        cap2.cacheStablePrefix,
        "prefix must be cap-agnostic so cross-tick cap shrinkage still hits cache",
      );
      assert.match(cap1.volatileSuffix, /cap=1/);
      assert.match(cap2.volatileSuffix, /cap=2/);
    });
  });
});

test("buildTickPrompt: empty issue body renders as (empty), oversized body truncates", async () => {
  const seed = `# Project rules\n`;
  const agentId = "agent-test-prompt-issue-b";

  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds({ [agentId]: "## solo\nminimal\n" }, async () => {
      const longBody = "x".repeat(7000);
      const { volatileSuffix } = await buildTickPrompt({
        idleAgents: [makeAgent({ agentId })],
        pendingIssues: [
          makeIssue({ id: 1, body: "" }),
          makeIssue({ id: 2, body: longBody }),
        ],
        cap: 2,
        targetRepoPath,
      });

      assert.match(volatileSuffix, /Issue #1[^]*\(empty\)/);
      // 6000-char cap trims the 7000-char body to 5997 chars + "..."
      const issue2Match = volatileSuffix.match(/Issue #2[^]*?(?=\n\n##|\n\nEmit|\n\nOutput|$)/);
      assert.ok(issue2Match, "issue 2 block should render");
      assert.ok(
        issue2Match![0].includes("...") && !issue2Match![0].includes("x".repeat(6500)),
        "long body should be truncated to 6000 chars",
      );
    });
  });
});

test("buildTickPrompt: byte-budget guard drops oldest agents to tag-only fallback", async () => {
  // Budget math: each full agent block ≈ 4 KB (4000 A's + heading + meta).
  // The internal builder reserves ~50 KB for framing prose. Setting the
  // override to ~55 KB leaves ~5 KB for agent content — fits exactly one
  // full block, so the second agent has to fall back to tag-only.
  const seed = `# Project rules\n`;
  const heavyProse = `## ${"H".repeat(40)}\n${"A".repeat(4000)}\n`;
  const recent = "agent-test-prompt-recent-c";
  const stale = "agent-test-prompt-stale-c";

  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds(
      { [recent]: heavyProse, [stale]: heavyProse },
      async () => {
        const { cacheStablePrefix } = await buildTickPrompt({
          idleAgents: [
            makeAgent({
              agentId: stale,
              tags: ["stale-tag"],
              lastActiveAt: "2025-01-01T00:00:00.000Z",
            }),
            makeAgent({
              agentId: recent,
              tags: ["recent-tag"],
              lastActiveAt: "2026-05-01T00:00:00.000Z",
            }),
          ],
          pendingIssues: [makeIssue({ id: 7 })],
          cap: 1,
          targetRepoPath,
          byteBudgetOverride: 55_000,
        });

        // Recent agent's heavy prose appears in full.
        assert.match(cacheStablePrefix, new RegExp(`Agent ${recent}[^]*A{3000,}`));
        // Stale agent gets the tag-only fallback marker.
        assert.match(
          cacheStablePrefix,
          new RegExp(
            `Agent ${stale}[^]*CLAUDE\\.md prose omitted under prompt-byte-budget`,
          ),
        );
      },
    );
  });
});

test("buildTickPrompt: PROMPT_BYTE_BUDGET is large enough that 1 small agent + 1 small issue fits", async () => {
  // Sanity check: production default budget is permissive on realistic inputs.
  const seed = `# Project rules\n`;
  const agentId = "agent-test-prompt-default-d";
  await withTargetRepo(seed, async (targetRepoPath) => {
    await withPerAgentMds({ [agentId]: "## small\nbody\n" }, async () => {
      const { cacheStablePrefix, volatileSuffix } = await buildTickPrompt({
        idleAgents: [makeAgent({ agentId })],
        pendingIssues: [makeIssue({ id: 1, body: "small body" })],
        cap: 1,
        targetRepoPath,
      });
      assert.ok(cacheStablePrefix.length + volatileSuffix.length < PROMPT_BYTE_BUDGET);
      assert.match(cacheStablePrefix, /## small/);
    });
  });
});
