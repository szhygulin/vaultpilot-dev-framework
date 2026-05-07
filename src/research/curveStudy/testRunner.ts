// Curve-redo Phase 1c: hidden-test runner.
//
// For each cell:
//   1. Apply the cell's captured worktree diff (Phase 1a output) to a fresh
//      clone at the issue's base SHA.
//   2. Copy the issue's 100 hidden tests (Phase 1b output) into the clone.
//   3. Run the framework's test command against the hidden-tests glob.
//   4. Parse pass / fail counts from stdout.
//   5. Return {B: passed, total, applyCleanly, ...} which Phase 1d's
//      aggregator reads to compute B.
//
// The framework command is a template defaulting to `npx --yes tsx --test`
// for node-test (no project tsc dependency) and `npx --yes vitest run` for
// vitest. Operators can override via `--test-cmd <template>`.
//
// `applyCleanly: false` on git-apply failure → cell scores B=0. Any test
// runner error (timeout, crashed framework) → B=0.
//
// `execTestCommand` is injectable so unit tests can substitute synthetic
// stdout without spinning up a real framework.

import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type Framework = "node-test" | "vitest";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
// Default templates use ${testFiles} (explicit list of copied hidden tests)
// so the framework runs ONLY hidden tests, even when --tests-dest-rel-dir
// places them next to existing source-tree tests (e.g. `src/agent/` already
// has the repo's own *.test.ts files). The ${testsGlob} / ${testsDir}
// substitutions are kept for backward-compat with custom --test-cmd users.
const DEFAULT_NODE_TEST_TEMPLATE = "npx --yes tsx --test ${testFiles}";
const DEFAULT_VITEST_TEMPLATE = "npx --yes vitest run ${testFiles}";

export interface RunHiddenTestsInput {
  /**
   * Absolute path to the cell's captured worktree diff. When `baselineOnly`
   * is true this is ignored — useful for measuring baseline pass rates
   * during corpus validation.
   */
  diffPath?: string;
  /** Absolute path to the directory containing the 100 hidden tests. */
  testsDir: string;
  /**
   * Absolute path to a fresh clone of the target repo at the issue's base
   * SHA. testRunner does NOT manage this clone's lifecycle; the caller is
   * responsible for setting it up and tearing it down.
   */
  cloneDir: string;
  framework: Framework;
  /** Default 5 min. Per-cell test runtime is usually 30-90 s; cap protects against runaway. */
  timeoutMs?: number;
  /** Override the framework's command template. */
  testCmd?: string;
  /** When true, skip diff application (counts baseline pass rate). */
  baselineOnly?: boolean;
  /**
   * Clone-relative directory the hidden tests are copied into before the
   * framework runs. Default `curve-redo-hidden-tests`. Set per-issue (via
   * the corpus's `testsDestRelDir`) when generated tests use sibling
   * imports (`./<module>.js`) that match the codebase's source-tree
   * colocation pattern — placing tests next to the impl in `src/agent/`,
   * `src/state/`, etc. lets sibling resolution succeed.
   */
  testsDestRelDir?: string;
  /** Test seam — substitute the framework command in unit tests. */
  execTestCommand?: ExecTestCommand;
}

export interface RunHiddenTestsResult {
  passed: number;
  failed: number;
  /** Tests that errored (compile failure, runtime exception). */
  errored: number;
  total: number;
  applyCleanly: boolean;
  applyError?: string;
  runtimeMs: number;
  /** First 4 KB of test stdout/stderr for debugging. Trimmed to keep cells.json small. */
  rawOutput?: string;
  /** Reason this run did NOT score successfully (timeout, crashed runner, no tests found). */
  errorReason?: string;
}

export interface ExecTestCommandResult {
  stdout: string;
  stderr: string;
  /** Set when the runner timed out. */
  timedOut?: boolean;
  /** Set when the runner crashed (non-zero exit + no parseable summary). */
  crashed?: boolean;
}

export type ExecTestCommand = (args: {
  cmd: string;
  cwd: string;
  timeoutMs: number;
}) => Promise<ExecTestCommandResult>;

const DEFAULT_DEST_SUBDIR = "curve-redo-hidden-tests";

export async function runHiddenTests(input: RunHiddenTestsInput): Promise<RunHiddenTestsResult> {
  const start = Date.now();
  const exec = input.execTestCommand ?? defaultExecTestCommand;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const destRelDir = input.testsDestRelDir ?? DEFAULT_DEST_SUBDIR;

  // Step 1: optionally apply the cell's diff.
  let applyCleanly = true;
  let applyError: string | undefined;
  if (!input.baselineOnly && input.diffPath) {
    try {
      const stat = await fs.stat(input.diffPath);
      if (stat.size > 0) {
        await execFile("git", ["-C", input.cloneDir, "apply", input.diffPath]);
      }
      // Empty diff (clean worktree) is still a successful apply.
    } catch (err) {
      applyCleanly = false;
      applyError = (err as { stderr?: string }).stderr ?? (err as Error).message;
      return {
        passed: 0,
        failed: 0,
        errored: 0,
        total: 0,
        applyCleanly: false,
        applyError,
        runtimeMs: Date.now() - start,
      };
    }
  }

  // Step 2: copy hidden tests into the clone.
  const destDir = path.join(input.cloneDir, destRelDir);
  const copiedRelPaths: string[] = [];
  try {
    // Only clear destDir when it's the default sandbox subdir. When the
    // operator points us at an existing source dir (e.g. `src/agent`), we
    // copy in alongside whatever's already there — clearing would wipe
    // the impl files the tests need to import.
    if (destRelDir === DEFAULT_DEST_SUBDIR) {
      await fs.rm(destDir, { recursive: true, force: true });
    }
    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(input.testsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /\.(test|spec)\.tsx?$/.test(e.name)) {
        await fs.copyFile(
          path.join(input.testsDir, e.name),
          path.join(destDir, e.name),
        );
        copiedRelPaths.push(`${destRelDir}/${e.name}`);
      }
    }
    if (copiedRelPaths.length === 0) {
      return {
        passed: 0,
        failed: 0,
        errored: 0,
        total: 0,
        applyCleanly,
        runtimeMs: Date.now() - start,
        errorReason: `no .test.ts / .spec.ts files found in ${input.testsDir}`,
      };
    }
  } catch (err) {
    return {
      passed: 0,
      failed: 0,
      errored: 0,
      total: 0,
      applyCleanly,
      runtimeMs: Date.now() - start,
      errorReason: `tests-copy failed: ${(err as Error).message}`,
    };
  }

  // Step 3: run the framework command.
  const template = input.testCmd ?? defaultCommandTemplate(input.framework);
  // ${testFiles} is the explicit list of copied hidden tests — robust when
  // the dest dir already contains other *.test.ts files (e.g. when copying
  // into `src/agent/` so sibling imports resolve).
  const cmd = template
    .replace(/\$\{testFiles\}/g, copiedRelPaths.join(" "))
    .replace(/\$\{testsGlob\}/g, `${destRelDir}/*.test.ts`)
    .replace(/\$\{testsDir\}/g, destRelDir);
  let runResult: ExecTestCommandResult;
  try {
    runResult = await exec({ cmd, cwd: input.cloneDir, timeoutMs });
  } catch (err) {
    return {
      passed: 0,
      failed: 0,
      errored: 0,
      total: 0,
      applyCleanly,
      runtimeMs: Date.now() - start,
      errorReason: `runner exception: ${(err as Error).message}`,
    };
  }

  if (runResult.timedOut) {
    return {
      passed: 0,
      failed: 0,
      errored: 0,
      total: 0,
      applyCleanly,
      runtimeMs: Date.now() - start,
      rawOutput: truncateForRaw(runResult.stdout, runResult.stderr),
      errorReason: "test-runner timed out",
    };
  }

  // Step 4: parse pass/fail.
  const combined = runResult.stdout + "\n" + runResult.stderr;
  const parsed =
    input.framework === "node-test"
      ? parseNodeTestOutput(combined)
      : parseVitestOutput(combined);
  if (!parsed) {
    return {
      passed: 0,
      failed: 0,
      errored: 0,
      total: 0,
      applyCleanly,
      runtimeMs: Date.now() - start,
      rawOutput: truncateForRaw(runResult.stdout, runResult.stderr),
      errorReason: "could not parse framework summary",
    };
  }

  return {
    passed: parsed.passed,
    failed: parsed.failed,
    errored: parsed.errored,
    total: parsed.passed + parsed.failed + parsed.errored,
    applyCleanly,
    runtimeMs: Date.now() - start,
    rawOutput: truncateForRaw(runResult.stdout, runResult.stderr),
  };
}

function defaultCommandTemplate(framework: Framework): string {
  return framework === "node-test" ? DEFAULT_NODE_TEST_TEMPLATE : DEFAULT_VITEST_TEMPLATE;
}

function truncateForRaw(stdout: string, stderr: string): string {
  const combined = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "");
  return combined.length > 4096 ? combined.slice(-4096) : combined;
}

/**
 * Parse Node's --test TAP output. Examples of the lines we extract:
 *   # tests 100
 *   # pass 87
 *   # fail 13
 * Returns null when the summary is missing (parser couldn't find any of
 * the expected lines).
 */
export function parseNodeTestOutput(out: string): { passed: number; failed: number; errored: number } | null {
  const passMatch = out.match(/^#\s*pass\s+(\d+)/m);
  const failMatch = out.match(/^#\s*fail\s+(\d+)/m);
  const cancelledMatch = out.match(/^#\s*cancelled\s+(\d+)/m);
  const todoMatch = out.match(/^#\s*todo\s+(\d+)/m);
  if (!passMatch && !failMatch) return null;
  const passed = passMatch ? Number(passMatch[1]) : 0;
  const failed = failMatch ? Number(failMatch[1]) : 0;
  // Cancelled + todo treated as errored (didn't actually run cleanly).
  const errored =
    (cancelledMatch ? Number(cancelledMatch[1]) : 0) +
    (todoMatch ? Number(todoMatch[1]) : 0);
  return { passed, failed, errored };
}

/**
 * Parse Vitest output. Vitest reports a "Tests" summary line:
 *   Tests   87 passed | 13 failed (100)
 *   Tests   87 passed | 13 failed | 1 skipped (101)
 * Skipped tests are treated as errored (didn't run cleanly).
 */
export function parseVitestOutput(out: string): { passed: number; failed: number; errored: number } | null {
  const summary = out.match(/^\s*Tests\s+([^\n]+)$/m);
  if (!summary) return null;
  const line = summary[1];
  const passed = (line.match(/(\d+)\s*passed/) ?? ["", "0"])[1];
  const failed = (line.match(/(\d+)\s*failed/) ?? ["", "0"])[1];
  const skipped = (line.match(/(\d+)\s*skipped/) ?? ["", "0"])[1];
  return {
    passed: Number(passed),
    failed: Number(failed),
    errored: Number(skipped),
  };
}

const defaultExecTestCommand: ExecTestCommand = async ({ cmd, cwd, timeoutMs }) => {
  const parts = cmd.split(/\s+/).filter((s) => s.length > 0);
  const [bin, ...args] = parts;
  try {
    const { stdout, stderr } = await execFile(bin, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as { code?: string; killed?: boolean; stdout?: string; stderr?: string; message?: string };
    if (e.killed && (e.code === "ETIMEDOUT" || (e as { signal?: string }).signal === "SIGTERM")) {
      return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", timedOut: true };
    }
    // Non-zero exit is normal when tests fail. Surface stdout/stderr so
    // the parser can still extract counts. Only flag as crashed when
    // there's no stdout at all (genuinely no output).
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      crashed: !(e.stdout || e.stderr),
    };
  }
};
