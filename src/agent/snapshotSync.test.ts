import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyAgent,
  isSynthetic,
  pullSnapshot,
  pushSnapshot,
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

async function readAgent(root: string, id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, id, "CLAUDE.md"), "utf-8");
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
