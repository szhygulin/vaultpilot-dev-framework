import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import {
  parseNodeTestOutput,
  parseVitestOutput,
  runHiddenTests,
  type ExecTestCommand,
} from "./testRunner.js";

const execFile = promisify(execFileCb);

async function makeFixtureClone(): Promise<{
  cloneDir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-runner-clone-"));
  await execFile("git", ["init", "-q", "-b", "main", dir]);
  await execFile("git", ["-C", dir, "config", "user.email", "t@t.t"]);
  await execFile("git", ["-C", dir, "config", "user.name", "T"]);
  await execFile("git", ["-C", dir, "config", "commit.gpgsign", "false"]);
  await fs.writeFile(path.join(dir, "src.ts"), "export const x = 1;\n");
  await execFile("git", ["-C", dir, "add", "src.ts"]);
  await execFile("git", ["-C", dir, "commit", "-q", "-m", "seed"]);
  return {
    cloneDir: dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

async function makeTestsDir(count: number): Promise<{
  testsDir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-runner-tests-"));
  for (let i = 0; i < count; i++) {
    await fs.writeFile(
      path.join(dir, `gen-${i}.test.ts`),
      `import { test } from "node:test";\ntest("t${i}", () => {});\n`,
    );
  }
  return {
    testsDir: dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

test("parseNodeTestOutput: extracts pass/fail/cancelled/todo counts from TAP", () => {
  const out = `
TAP version 13
1..100
# tests 100
# pass 87
# fail 13
# cancelled 0
# todo 0
`;
  const r = parseNodeTestOutput(out);
  assert.deepEqual(r, { passed: 87, failed: 13, errored: 0 });
});

test("parseNodeTestOutput: counts cancelled + todo as errored", () => {
  const out = `# pass 50\n# fail 0\n# cancelled 5\n# todo 3\n`;
  const r = parseNodeTestOutput(out);
  assert.deepEqual(r, { passed: 50, failed: 0, errored: 8 });
});

test("parseNodeTestOutput: returns null when no summary lines present", () => {
  assert.equal(parseNodeTestOutput("nothing here"), null);
});

test("parseVitestOutput: extracts pass/fail counts from summary line", () => {
  const out = `
 Test Files  4 passed (4)
      Tests  87 passed | 13 failed (100)
   Start at  10:00:00
`;
  const r = parseVitestOutput(out);
  assert.deepEqual(r, { passed: 87, failed: 13, errored: 0 });
});

test("parseVitestOutput: handles skipped tests as errored", () => {
  const out = `      Tests  85 passed | 13 failed | 2 skipped (100)\n`;
  const r = parseVitestOutput(out);
  assert.deepEqual(r, { passed: 85, failed: 13, errored: 2 });
});

test("parseVitestOutput: returns null when no Tests summary line", () => {
  assert.equal(parseVitestOutput("nothing"), null);
});

test("runHiddenTests: applyCleanly=false when diff doesn't apply", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(3);
  try {
    // Bad diff: references a file that doesn't exist
    const badDiff = path.join(cloneDir, "bad.diff");
    await fs.writeFile(
      badDiff,
      `diff --git a/missing.txt b/missing.txt\n--- a/missing.txt\n+++ b/missing.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n`,
    );
    const exec: ExecTestCommand = async () => ({ stdout: "", stderr: "" });
    const r = await runHiddenTests({
      diffPath: badDiff,
      testsDir,
      cloneDir,
      framework: "node-test",
      execTestCommand: exec,
    });
    assert.equal(r.applyCleanly, false);
    assert.ok(r.applyError);
    assert.equal(r.passed, 0);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: empty diff is a successful apply (clean worktree)", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(2);
  try {
    const emptyDiff = path.join(cloneDir, "empty.diff");
    await fs.writeFile(emptyDiff, "");
    const exec: ExecTestCommand = async () => ({
      stdout: "# pass 2\n# fail 0\n",
      stderr: "",
    });
    const r = await runHiddenTests({
      diffPath: emptyDiff,
      testsDir,
      cloneDir,
      framework: "node-test",
      execTestCommand: exec,
    });
    assert.equal(r.applyCleanly, true);
    assert.equal(r.passed, 2);
    assert.equal(r.failed, 0);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: copies hidden tests into clone and runs the framework command", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(5);
  try {
    let capturedCwd = "";
    let capturedCmd = "";
    const exec: ExecTestCommand = async ({ cmd, cwd }) => {
      capturedCmd = cmd;
      capturedCwd = cwd;
      return { stdout: "# pass 4\n# fail 1\n", stderr: "" };
    };
    const r = await runHiddenTests({
      diffPath: undefined,
      testsDir,
      cloneDir,
      framework: "node-test",
      baselineOnly: true,
      execTestCommand: exec,
    });
    assert.equal(r.passed, 4);
    assert.equal(r.failed, 1);
    assert.equal(r.total, 5);
    assert.equal(r.applyCleanly, true);
    assert.equal(capturedCwd, cloneDir);
    assert.match(capturedCmd, /tsx --test curve-redo-hidden-tests/);
    // Confirm the tests landed in the clone
    const copied = await fs.readdir(path.join(cloneDir, "curve-redo-hidden-tests"));
    assert.equal(copied.length, 5);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: testsDestRelDir override copies tests into the named source dir without wiping it", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(3);
  try {
    // Pre-populate src/agent/ with an impl file the tests import as a sibling.
    await fs.mkdir(path.join(cloneDir, "src/agent"), { recursive: true });
    await fs.writeFile(
      path.join(cloneDir, "src/agent/impl.ts"),
      "export const impl = 1;\n",
    );
    let capturedCmd = "";
    const exec: ExecTestCommand = async ({ cmd }) => {
      capturedCmd = cmd;
      return { stdout: "# pass 3\n# fail 0\n", stderr: "" };
    };
    const r = await runHiddenTests({
      testsDir,
      cloneDir,
      framework: "node-test",
      baselineOnly: true,
      testsDestRelDir: "src/agent",
      execTestCommand: exec,
    });
    assert.equal(r.passed, 3);
    assert.equal(r.applyCleanly, true);
    // Default template uses ${testFiles}: each hidden test is named explicitly,
    // so a sibling *.test.ts (e.g. an existing src/agent/repo.test.ts) wouldn't
    // be picked up even when destRelDir collides with a populated source dir.
    assert.match(capturedCmd, /tsx --test src\/agent\/gen-0\.test\.ts/);
    assert.match(capturedCmd, /src\/agent\/gen-1\.test\.ts/);
    assert.match(capturedCmd, /src\/agent\/gen-2\.test\.ts/);
    // Pre-existing impl.ts must survive the copy (no wipe-then-mkdir for non-default dest).
    const entries = await fs.readdir(path.join(cloneDir, "src/agent"));
    assert.ok(entries.includes("impl.ts"), "impl.ts was wiped");
    assert.equal(
      entries.filter((e) => e.endsWith(".test.ts")).length,
      3,
      "expected 3 hidden tests copied alongside impl.ts",
    );
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: returns errorReason when stdout is unparseable", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(1);
  try {
    const exec: ExecTestCommand = async () => ({
      stdout: "garbage output, no summary",
      stderr: "",
    });
    const r = await runHiddenTests({
      testsDir,
      cloneDir,
      framework: "node-test",
      baselineOnly: true,
      execTestCommand: exec,
    });
    assert.equal(r.passed, 0);
    assert.match(r.errorReason ?? "", /parse/);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: timed-out runner produces errorReason without crashing", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(1);
  try {
    const exec: ExecTestCommand = async () => ({
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const r = await runHiddenTests({
      testsDir,
      cloneDir,
      framework: "vitest",
      baselineOnly: true,
      execTestCommand: exec,
    });
    assert.equal(r.passed, 0);
    assert.match(r.errorReason ?? "", /timed out/);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: vitest framework parses the Tests summary line", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(3);
  try {
    const exec: ExecTestCommand = async () => ({
      stdout: " Test Files  1 passed (1)\n      Tests  2 passed | 1 failed (3)\n",
      stderr: "",
    });
    const r = await runHiddenTests({
      testsDir,
      cloneDir,
      framework: "vitest",
      baselineOnly: true,
      execTestCommand: exec,
    });
    assert.equal(r.passed, 2);
    assert.equal(r.failed, 1);
    assert.equal(r.total, 3);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});

test("runHiddenTests: empty tests directory returns errorReason", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const emptyTestsDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-tests-"));
  try {
    const exec: ExecTestCommand = async () => ({ stdout: "", stderr: "" });
    const r = await runHiddenTests({
      testsDir: emptyTestsDir,
      cloneDir,
      framework: "node-test",
      baselineOnly: true,
      execTestCommand: exec,
    });
    assert.match(r.errorReason ?? "", /no \.test\.ts/);
  } finally {
    await cleanClone();
    await fs.rm(emptyTestsDir, { recursive: true, force: true });
  }
});

test("runHiddenTests: --test-cmd template substitution", async () => {
  const { cloneDir, cleanup: cleanClone } = await makeFixtureClone();
  const { testsDir, cleanup: cleanTests } = await makeTestsDir(1);
  try {
    let capturedCmd = "";
    const exec: ExecTestCommand = async ({ cmd }) => {
      capturedCmd = cmd;
      return { stdout: "# pass 1\n# fail 0\n", stderr: "" };
    };
    const r = await runHiddenTests({
      testsDir,
      cloneDir,
      framework: "node-test",
      baselineOnly: true,
      testCmd: "custom-runner ${testsGlob} --extra-flag",
      execTestCommand: exec,
    });
    assert.equal(r.passed, 1);
    assert.match(capturedCmd, /^custom-runner curve-redo-hidden-tests\/\*\.test\.ts --extra-flag$/);
  } finally {
    await cleanClone();
    await cleanTests();
  }
});
