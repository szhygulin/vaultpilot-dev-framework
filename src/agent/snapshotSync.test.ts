import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyAgent,
  isSynthetic,
  mergeAgentActions,
  pullSnapshot,
  pushSnapshot,
  SYNCED_AGENT_FILES,
  SYNTHETIC_AGENT_PATTERNS,
} from "./snapshotSync.js";

async function makeTempLayout(): Promise<{
  rootDir: string;
  cloneDir: string;
  remoteAgentsDir: string;
  localAgentsDir: string;
}> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-sync-test-"));
  const cloneDir = path.join(rootDir, "clone");
  const remoteAgentsDir = path.join(cloneDir, "agents");
  const localAgentsDir = path.join(rootDir, "local-agents");
  await fs.mkdir(remoteAgentsDir, { recursive: true });
  await fs.mkdir(localAgentsDir, { recursive: true });
  return { rootDir, cloneDir, remoteAgentsDir, localAgentsDir };
}

async function writeAgent(root: string, id: string, body: string): Promise<void> {
  const dir = path.join(root, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "CLAUDE.md"), body, "utf-8");
}

async function writeSidecar(root: string, id: string, body: string): Promise<void> {
  const dir = path.join(root, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "section-tags.json"), body, "utf-8");
}

async function readAgent(root: string, id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, id, "CLAUDE.md"), "utf-8");
  } catch {
    return null;
  }
}

async function readSidecar(root: string, id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, id, "section-tags.json"), "utf-8");
  } catch {
    return null;
  }
}

describe("isSynthetic", () => {
  it("matches trim-* curve-redo Phase A agents", () => {
    assert.equal(isSynthetic("agent-916a-trim-6000-s8026"), true);
    assert.equal(isSynthetic("agent-916a-trim-58000-s2060032"), true);
  });

  it("matches 9180-9189 Smoke10 Phase B agents", () => {
    for (let i = 0; i <= 9; i++) {
      assert.equal(isSynthetic(`agent-918${i}`), true, `9180+${i}`);
    }
  });

  it("does not match real specialists", () => {
    assert.equal(isSynthetic("agent-916a"), false);
    assert.equal(isSynthetic("agent-92ff"), false);
    assert.equal(isSynthetic("agent-9190"), false);
    assert.equal(isSynthetic("agent-91801"), false);
  });

  it("honors extra patterns", () => {
    assert.equal(isSynthetic("agent-foo-test", [/^agent-foo-/]), true);
    assert.equal(isSynthetic("agent-bar", [/^agent-foo-/]), false);
  });

  it("exposes its baseline patterns as a readonly array", () => {
    assert.equal(SYNTHETIC_AGENT_PATTERNS.length, 2);
  });
});

describe("classifyAgent", () => {
  const A = Buffer.from("apple");
  const B = Buffer.from("banana");

  it("returns add when destination is missing", () => {
    assert.equal(
      classifyAgent({ sourceBytes: A, destBytes: null, policy: "skip-existing", direction: "pull" }),
      "add",
    );
  });

  it("returns unchanged on byte-equal content", () => {
    assert.equal(
      classifyAgent({ sourceBytes: A, destBytes: Buffer.from("apple"), policy: "overwrite", direction: "pull" }),
      "unchanged",
    );
  });

  it("pull + skip-existing preserves existing local file", () => {
    assert.equal(
      classifyAgent({ sourceBytes: A, destBytes: B, policy: "skip-existing", direction: "pull" }),
      "skip",
    );
  });

  it("pull + overwrite replaces existing local file", () => {
    assert.equal(
      classifyAgent({ sourceBytes: A, destBytes: B, policy: "overwrite", direction: "pull" }),
      "update",
    );
  });

  it("push always updates on a difference (PR is the gate)", () => {
    assert.equal(
      classifyAgent({ sourceBytes: A, destBytes: B, policy: "skip-existing", direction: "push" }),
      "update",
    );
  });

  it("returns skip when source is null", () => {
    assert.equal(
      classifyAgent({ sourceBytes: null, destBytes: A, policy: "overwrite", direction: "pull" }),
      "skip",
    );
  });
});

describe("pullSnapshot", () => {
  it("adds agents missing locally and leaves existing ones under skip-existing", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-aaaa");
    await writeAgent(remoteAgentsDir, "agent-bbbb", "remote-bbbb");
    await writeAgent(localAgentsDir, "agent-aaaa", "local-aaaa");

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      skipFetch: true,
    });

    assert.deepEqual(summary.added, ["agent-bbbb"]);
    assert.deepEqual(summary.skipped, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "local-aaaa");
    assert.equal(await readAgent(localAgentsDir, "agent-bbbb"), "remote-bbbb");
  });

  it("overwrites local under policy: overwrite", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-aaaa");
    await writeAgent(localAgentsDir, "agent-aaaa", "local-aaaa");

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      policy: "overwrite",
      skipFetch: true,
    });

    assert.deepEqual(summary.updated, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "remote-aaaa");
  });

  it("reports unchanged for byte-identical files without re-writing", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "same-bytes");
    await writeAgent(localAgentsDir, "agent-aaaa", "same-bytes");

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      policy: "overwrite",
      skipFetch: true,
    });

    assert.deepEqual(summary.unchanged, ["agent-aaaa"]);
    assert.deepEqual(summary.updated, []);
  });

  it("dry-run reports the planned changes without writing", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-aaaa");

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      dryRun: true,
      skipFetch: true,
    });

    assert.deepEqual(summary.added, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), null);
  });

  it("returns an empty summary when the snapshot has no agents", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      skipFetch: true,
    });
    assert.deepEqual(summary.added, []);
    assert.deepEqual(summary.skipped, []);
    assert.deepEqual(summary.unchanged, []);
  });
});

describe("pushSnapshot", () => {
  it("excludes synthetic curve-redo agents by default", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(localAgentsDir, "agent-916a", "real");
    await writeAgent(localAgentsDir, "agent-916a-trim-6000-s8026", "synthetic-A");
    await writeAgent(localAgentsDir, "agent-9189", "synthetic-B");

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.added, ["agent-916a"]);
    assert.deepEqual(
      result.summary.excluded.sort(),
      ["agent-916a-trim-6000-s8026", "agent-9189"].sort(),
    );
  });

  it("includes synthetic when --include-synthetic is set", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(localAgentsDir, "agent-9189", "synthetic");

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      includeSynthetic: true,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.added, ["agent-9189"]);
    assert.deepEqual(result.summary.excluded, []);
  });

  it("reports updated for differing content, unchanged for identical", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "old");
    await writeAgent(remoteAgentsDir, "agent-bbbb", "same");
    await writeAgent(localAgentsDir, "agent-aaaa", "new");
    await writeAgent(localAgentsDir, "agent-bbbb", "same");
    await writeAgent(localAgentsDir, "agent-cccc", "fresh");

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.updated, ["agent-aaaa"]);
    assert.deepEqual(result.summary.unchanged, ["agent-bbbb"]);
    assert.deepEqual(result.summary.added, ["agent-cccc"]);
  });

  it("does not write to clone when apply=false", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "old");
    await writeAgent(localAgentsDir, "agent-aaaa", "new");

    await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.equal(await readAgent(remoteAgentsDir, "agent-aaaa"), "old");
  });

  it("returns an empty summary when local agents/ is empty", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });
    assert.deepEqual(result.summary.added, []);
    assert.deepEqual(result.summary.excluded, []);
    assert.match(result.branch, /^refresh-snapshot-\d{4}-\d{2}-\d{2}$/);
  });
});

describe("mergeAgentActions", () => {
  it("dest didn't exist + any add → add (fresh agent dir)", () => {
    assert.equal(mergeAgentActions(["add", "add"], false), "add");
    assert.equal(mergeAgentActions(["add"], false), "add");
  });

  it("dest didn't exist + only unchanged → unchanged (degenerate case)", () => {
    assert.equal(mergeAgentActions(["unchanged"], false), "unchanged");
  });

  it("dest existed + any add → update (sidecar landed alongside existing CLAUDE.md)", () => {
    assert.equal(mergeAgentActions(["unchanged", "add"], true), "update");
    assert.equal(mergeAgentActions(["add"], true), "update");
  });

  it("dest existed + any update → update", () => {
    assert.equal(mergeAgentActions(["update", "unchanged"], true), "update");
    assert.equal(mergeAgentActions(["unchanged", "update"], true), "update");
  });

  it("dest existed + skip beats unchanged", () => {
    assert.equal(mergeAgentActions(["skip", "unchanged"], true), "skip");
  });

  it("dest existed + every file unchanged → unchanged", () => {
    assert.equal(mergeAgentActions(["unchanged", "unchanged"], true), "unchanged");
  });

  it("exposes the synced filename set", () => {
    assert.deepEqual([...SYNCED_AGENT_FILES], ["CLAUDE.md", "section-tags.json"]);
  });
});

describe("pullSnapshot — section-tags.json sidecar", () => {
  it("copies the sidecar alongside CLAUDE.md when adding a new agent", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"version":1,"sections":{}}');

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      skipFetch: true,
    });

    assert.deepEqual(summary.added, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "remote-body");
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), '{"version":1,"sections":{}}');
  });

  it("tolerates a missing sidecar on the source (early-life agent)", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-body");
    // No sidecar on remote.

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      skipFetch: true,
    });

    assert.deepEqual(summary.added, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "remote-body");
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), null);
  });

  it("overwrites both files under policy=overwrite", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"remote"}');
    await writeAgent(localAgentsDir, "agent-aaaa", "local-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      policy: "overwrite",
      skipFetch: true,
    });

    assert.deepEqual(summary.updated, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "remote-body");
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), '{"v":"remote"}');
  });

  it("under skip-existing leaves both files alone when both differ", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"remote"}');
    await writeAgent(localAgentsDir, "agent-aaaa", "local-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      skipFetch: true,
    });

    assert.deepEqual(summary.skipped, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), "local-body");
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), '{"v":"local"}');
  });

  it("reports updated when only the sidecar diverges (CLAUDE.md unchanged)", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"remote"}');
    await writeAgent(localAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      policy: "overwrite",
      skipFetch: true,
    });

    assert.deepEqual(summary.updated, ["agent-aaaa"]);
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), '{"v":"remote"}');
  });

  it("dry-run does not write the sidecar", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "remote-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"remote"}');

    const summary = await pullSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      dryRun: true,
      skipFetch: true,
    });

    assert.deepEqual(summary.added, ["agent-aaaa"]);
    assert.equal(await readAgent(localAgentsDir, "agent-aaaa"), null);
    assert.equal(await readSidecar(localAgentsDir, "agent-aaaa"), null);
  });
});

describe("pushSnapshot — section-tags.json sidecar", () => {
  // Push tests use apply=false to avoid needing a real git clone — the
  // existing pushSnapshot suite uses the same convention. A separate
  // apply=true test covers the actual remote write under git.

  it("counts the sidecar in the per-agent verdict when adding a fresh agent", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(localAgentsDir, "agent-aaaa", "local-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.added, ["agent-aaaa"]);
  });

  it("tolerates a missing local sidecar (early-life agent)", async () => {
    const { cloneDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(localAgentsDir, "agent-aaaa", "local-body");
    // No sidecar locally.

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.added, ["agent-aaaa"]);
  });

  it("reports updated when only the sidecar diverges", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"remote"}');
    await writeAgent(localAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.updated, ["agent-aaaa"]);
  });

  it("reports unchanged when both files are byte-identical", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    await writeAgent(remoteAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(remoteAgentsDir, "agent-aaaa", '{"v":"shared"}');
    await writeAgent(localAgentsDir, "agent-aaaa", "shared-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"shared"}');

    const result = await pushSnapshot({
      cloneDir,
      agentsRoot: localAgentsDir,
      apply: false,
      skipFetch: true,
    });

    assert.deepEqual(result.summary.unchanged, ["agent-aaaa"]);
  });

  it("writes the sidecar to clone under apply=true (git-initialized clone)", async () => {
    const { cloneDir, remoteAgentsDir, localAgentsDir } = await makeTempLayout();
    // Initialize the clone as a git repo with a base commit so apply=true's
    // commit step has something to work against. The push step inside
    // pushSnapshot is gated by skipFetch=true so we won't hit the network.
    await fs.mkdir(remoteAgentsDir, { recursive: true });
    const { execFile: execFileCb } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileP = promisify(execFileCb);
    await execFileP("git", ["init", "-q", "-b", "main"], { cwd: cloneDir });
    await execFileP("git", ["config", "user.email", "test@local"], { cwd: cloneDir });
    await execFileP("git", ["config", "user.name", "Test"], { cwd: cloneDir });
    await fs.writeFile(path.join(cloneDir, "README.md"), "seed", "utf-8");
    await execFileP("git", ["add", "-A"], { cwd: cloneDir });
    await execFileP("git", ["commit", "-q", "-m", "seed"], { cwd: cloneDir });

    await writeAgent(localAgentsDir, "agent-aaaa", "local-body");
    await writeSidecar(localAgentsDir, "agent-aaaa", '{"v":"local"}');

    // apply=true would also try `git push` and `gh pr create`; bypass that
    // path by stopping after the file write. We can't easily stub gh, so
    // assert by intercepting before the git operations: pushSnapshot only
    // runs the file copy synchronously when apply=true, and the failure is
    // at `git push`. Catch and inspect.
    let writeReached = false;
    try {
      await pushSnapshot({
        cloneDir,
        agentsRoot: localAgentsDir,
        apply: true,
        skipFetch: true,
      });
      writeReached = true;
    } catch {
      // git push to non-existent remote will fail; that's fine for this test.
      writeReached = true;
    }
    assert.equal(writeReached, true);
    // The remote file was written before the git operations failed.
    assert.equal(await readAgent(remoteAgentsDir, "agent-aaaa"), "local-body");
    assert.equal(await readSidecar(remoteAgentsDir, "agent-aaaa"), '{"v":"local"}');
  });
});
