// Curve-redo Phase 1b: hidden-test generator.
//
// For each issue in the corpus we generate exactly N (default 100) hidden
// tests via Opus. The tests grade whether a coding agent's implementation
// solves the issue — they're applied to the agent's worktree-diff and run
// in Phase 1c's testRunner. Coding agents do NOT see the tests; this module
// is operator-only, run once per corpus issue ahead of dispatch.
//
// Design choices:
//   - One LLM call per BATCH of testsPerBatch tests (default 25, ×4 = 100).
//     Single-call 100-test generation truncates output for issues with rich
//     surface area; batching keeps each response under the model's natural
//     output cap and lets the prompt steer each batch toward a different
//     test category (happy-path / edges / errors / contracts).
//   - Strict JSON output schema. parseJsonEnvelope salvages
//     near-malformed responses (apostrophe escapes, etc.) so a single
//     batch's parse failure doesn't poison the whole run.
//   - Baseline-validation (do all 100 tests fail on the unmodified base?)
//     lives in Phase 2 operator workflow, NOT here. testGenerator's job
//     is generation; testRunner (Phase 1c) does the run, and the operator
//     decides whether to regenerate.
//
// LlmCall is injectable so unit tests can substitute a synthetic generator
// without spinning up the real SDK.

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "../../agent/sdkBinary.js";
import { parseJsonEnvelope } from "../../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_TEST_GENERATOR } from "../../orchestrator/models.js";
import type { Logger } from "../../log/logger.js";

export type Framework = "node-test" | "vitest";

const TEST_BATCH_SCHEMA = z.object({
  tests: z.array(
    z.object({
      filename: z.string().min(1),
      description: z.string().optional(),
      code: z.string().min(1),
    }),
  ),
});

export interface GenerateTestsInput {
  issueId: number;
  issueTitle: string;
  issueBody: string;
  /** Absolute path to a clone of the target repo (used for repo-tree + style fixture). */
  repoPath: string;
  framework: Framework;
  /** Where the .test.ts files land. Created if missing. */
  outDir: string;
  /** Default 4. Total tests = batchCount × testsPerBatch. */
  batchCount?: number;
  /** Default 25. Total tests = batchCount × testsPerBatch. */
  testsPerBatch?: number;
  /**
   * Optional path to a sibling test file used as style hint. When absent,
   * the generator picks one automatically via `pickStyleFixture`.
   */
  styleFixturePath?: string;
  /** Test seam: substitute the SDK call in unit tests. */
  llmCall?: LlmCall;
  logger?: Logger;
}

export interface GenerateTestsResult {
  ok: boolean;
  testsRequested: number;
  testsWritten: number;
  generatedFiles: string[];
  perBatch: BatchOutcome[];
  costUsd?: number;
  failures: string[];
}

export interface BatchOutcome {
  batch: number;
  category: string;
  requested: number;
  received: number;
  written: number;
  costUsd?: number;
  error?: string;
}

export type LlmCall = (args: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}) => Promise<LlmCallResult>;

export interface LlmCallResult {
  raw: string;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
}

const DEFAULT_BATCH_COUNT = 4;
const DEFAULT_TESTS_PER_BATCH = 25;

const BATCH_CATEGORIES = [
  "Happy-path / canonical correctness — the issue's primary success case is exercised end-to-end.",
  "Edge cases — empty inputs, single-element collections, off-by-one boundaries, max/min sizes.",
  "Error paths / negative tests — invalid inputs, malformed data, contract violations should fail loudly.",
  "Side effects / contracts — observable state transitions, integration with the surfaces the issue body names.",
];

const SYSTEM_PROMPT = `You generate hidden behavior-level tests that grade whether a coding agent's implementation of an issue solves the problem described. Each test you generate is a self-contained TypeScript test file in the named framework that will be run against the agent's worktree-diff applied on top of the unmodified base SHA.

CRITICAL CONSTRAINTS — violating these wastes the test:
- Tests check OBSERVABLE BEHAVIOR (return values, file contents, exported symbol shapes, side effects), NOT implementation details (private helper names, internal variable names, specific data structures).
- Each test must FAIL on the unmodified baseline AND PASS only after a correct implementation diff is applied.
- Each test file imports ONLY from public module paths named in the issue body or visible in the repo tree. Imports of paths the issue doesn't mention will fail compile and waste the test.
- Test files MUST compile cleanly. Use the framework's idiomatic test/expect API exactly as the style fixture demonstrates.
- Filenames are kebab-case ending in \`.test.ts\`. No spaces, no uppercase, no special chars.

IMPORT PATHS — your tests will NOT live next to the impl modules they exercise:
- Generated tests are placed at \`<cloneRoot>/curve-redo-hidden-tests/<filename>.test.ts\` (a sibling of \`src/\`, not inside it).
- Use \`../src/<dir>/<module>.js\` to reach impl modules. Never use sibling imports (\`./<module>.js\`) — those would resolve inside \`curve-redo-hidden-tests/\` where no impl files exist.
- The style fixture below was authored AT a location next to its impl, so its imports may be sibling-style. DO NOT mimic that path style — translate every \`./<x>.js\` to \`../src/<dir>/<x>.js\` based on where the file actually lives in the repo tree. Match its API/idiom style, not its import paths.

OUTPUT FORMAT — strict JSON object, no prose before or after:
{
  "tests": [
    {
      "filename": "behavior-foo-<descriptive-slug>.test.ts",
      "description": "one short sentence on what observable behavior this verifies",
      "code": "<full TypeScript test file content, ready to write to disk>"
    }
  ]
}

Generate exactly the requested number of tests, all in the requested category. No fewer.`;

function buildUserPrompt(args: {
  issueTitle: string;
  issueBody: string;
  framework: Framework;
  category: string;
  testCount: number;
  repoTree: string;
  styleFixture: string;
  styleFixturePath: string;
}): string {
  const frameworkInstructions =
    args.framework === "node-test"
      ? "Framework: Node built-in test runner. Use `import { test } from \"node:test\"` and `import assert from \"node:assert/strict\"`."
      : "Framework: Vitest. Use `import { test, expect } from \"vitest\"`.";
  return [
    `Issue: ${args.issueTitle}`,
    "",
    "--- Issue body ---",
    args.issueBody,
    "--- end body ---",
    "",
    frameworkInstructions,
    "",
    "Repo tree (depth 2):",
    args.repoTree,
    "",
    `Style fixture (existing test from this repo at ${args.styleFixturePath} — match its API/idiom style, NOT its import-path style: this fixture lives next to its impl, but your generated tests live at curve-redo-hidden-tests/, so rewrite any sibling imports to ../src/<dir>/<x>.js):`,
    "```ts",
    args.styleFixture,
    "```",
    "",
    `Generate exactly ${args.testCount} tests in this category: ${args.category}`,
    "",
    "Emit only the JSON object specified in the system prompt. No markdown fences, no prose.",
  ].join("\n");
}

/**
 * Walk the repo (depth 2) and emit a compact directory listing usable as
 * an LLM-prompt context. Excludes node_modules, dist, .git, agents, logs,
 * state — directories the LLM doesn't need to reason about.
 */
export async function listRepoTree(repoPath: string, depth = 2): Promise<string> {
  const skip = new Set(["node_modules", "dist", ".git", "agents", "logs", "state"]);
  const lines: string[] = [];
  async function walk(dir: string, depthLeft: number, indent: string) {
    if (depthLeft < 0) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (skip.has(e.name) || e.name.startsWith(".")) continue;
      lines.push(`${indent}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), depthLeft - 1, indent + "  ");
      }
    }
  }
  await walk(repoPath, depth, "");
  return lines.join("\n");
}

/**
 * Find a representative .test.ts (or .spec.ts) file in the repo to use as
 * a style hint. Prefers the largest test file under src/ (more realistic
 * coverage of the framework's idioms). Returns null when no test files
 * exist — the caller fails the run rather than fabricating a fixture.
 */
export async function pickStyleFixture(repoPath: string): Promise<{ path: string; contents: string } | null> {
  const candidates: { path: string; size: number }[] = [];
  async function walk(dir: string, depthLeft: number) {
    if (depthLeft < 0) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p, depthLeft - 1);
      } else if (e.isFile() && (/\.(test|spec)\.ts$/.test(e.name))) {
        try {
          const st = await fs.stat(p);
          candidates.push({ path: p, size: st.size });
        } catch {
          // ignore unreadable
        }
      }
    }
  }
  await walk(repoPath, 6);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.size - a.size);
  // Cap at 4 KB — a style fixture only needs to demonstrate idioms.
  const picked = candidates[0];
  const full = await fs.readFile(picked.path, "utf-8");
  return { path: picked.path, contents: full.slice(0, 4096) };
}

export function parseTestBatch(raw: string): { ok: true; tests: { filename: string; code: string; description?: string }[] } | { ok: false; error: string } {
  const extracted = parseJsonEnvelope(raw, TEST_BATCH_SCHEMA);
  if (!extracted.ok || !extracted.value) {
    return { ok: false, error: extracted.error ?? "JSON parse failed" };
  }
  return { ok: true, tests: extracted.value.tests };
}

const FILENAME_SAFE_RE = /^[a-z0-9][a-z0-9-]{0,80}\.test\.ts$/;

function sanitizeFilename(name: string, fallbackIndex: number, batch: number): string {
  const base = name
    .toLowerCase()
    .replace(/\.test\.tsx?$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const safe = `${base || `t${fallbackIndex}`}.test.ts`;
  if (FILENAME_SAFE_RE.test(safe)) return `b${batch}-${safe}`;
  return `b${batch}-t${fallbackIndex}.test.ts`;
}

export async function writeTestFiles(args: {
  outDir: string;
  batch: number;
  tests: { filename: string; code: string }[];
}): Promise<string[]> {
  await fs.mkdir(args.outDir, { recursive: true });
  const written: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < args.tests.length; i++) {
    const t = args.tests[i];
    let safe = sanitizeFilename(t.filename, i, args.batch);
    let suffix = 1;
    while (seen.has(safe)) {
      safe = safe.replace(/\.test\.ts$/, `-${suffix}.test.ts`);
      suffix++;
    }
    seen.add(safe);
    const target = path.join(args.outDir, safe);
    await fs.writeFile(target, t.code);
    written.push(target);
  }
  return written;
}

async function defaultLlmCall(args: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}): Promise<LlmCallResult> {
  let raw = "";
  let costUsd: number | undefined;
  try {
    const stream = query({
      prompt: args.userPrompt,
      options: {
        model: args.model,
        systemPrompt: args.systemPrompt,
        tools: [],
        permissionMode: "default",
        env: process.env,
        maxTurns: 1,
        settingSources: [],
        persistSession: false,
        pathToClaudeCodeExecutable: claudeBinPath(),
      },
    });
    for await (const msg of stream) {
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          raw = msg.result;
          costUsd = msg.total_cost_usd;
        } else {
          return {
            raw: "",
            costUsd: msg.total_cost_usd,
            isError: true,
            errorReason: msg.subtype,
          };
        }
      }
    }
  } catch (err) {
    return { raw: "", isError: true, errorReason: (err as Error).message };
  }
  return { raw, costUsd, isError: false };
}

export async function generateTests(input: GenerateTestsInput): Promise<GenerateTestsResult> {
  const batchCount = input.batchCount ?? DEFAULT_BATCH_COUNT;
  const testsPerBatch = input.testsPerBatch ?? DEFAULT_TESTS_PER_BATCH;
  const totalRequested = batchCount * testsPerBatch;
  const llm = input.llmCall ?? defaultLlmCall;

  const repoTree = await listRepoTree(input.repoPath);
  let styleFixture: { path: string; contents: string } | null;
  if (input.styleFixturePath) {
    try {
      const contents = await fs.readFile(input.styleFixturePath, "utf-8");
      styleFixture = { path: input.styleFixturePath, contents: contents.slice(0, 4096) };
    } catch (err) {
      return {
        ok: false,
        testsRequested: totalRequested,
        testsWritten: 0,
        generatedFiles: [],
        perBatch: [],
        failures: [`style fixture read failed: ${(err as Error).message}`],
      };
    }
  } else {
    styleFixture = await pickStyleFixture(input.repoPath);
  }
  if (!styleFixture) {
    return {
      ok: false,
      testsRequested: totalRequested,
      testsWritten: 0,
      generatedFiles: [],
      perBatch: [],
      failures: ["no .test.ts / .spec.ts file found in repo to use as style fixture"],
    };
  }

  const allFiles: string[] = [];
  const perBatch: BatchOutcome[] = [];
  const failures: string[] = [];
  let totalCost = 0;

  for (let b = 0; b < batchCount; b++) {
    const category = BATCH_CATEGORIES[b % BATCH_CATEGORIES.length];
    const userPrompt = buildUserPrompt({
      issueTitle: input.issueTitle,
      issueBody: input.issueBody,
      framework: input.framework,
      category,
      testCount: testsPerBatch,
      repoTree,
      styleFixture: styleFixture.contents,
      styleFixturePath: styleFixture.path,
    });

    const llmResult = await llm({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      model: ORCHESTRATOR_MODEL_TEST_GENERATOR,
    });
    if (llmResult.costUsd !== undefined) totalCost += llmResult.costUsd;

    if (llmResult.isError) {
      perBatch.push({
        batch: b + 1,
        category,
        requested: testsPerBatch,
        received: 0,
        written: 0,
        costUsd: llmResult.costUsd,
        error: llmResult.errorReason,
      });
      failures.push(`batch ${b + 1}: LLM error: ${llmResult.errorReason ?? "unknown"}`);
      continue;
    }

    const parsed = parseTestBatch(llmResult.raw);
    if (!parsed.ok) {
      perBatch.push({
        batch: b + 1,
        category,
        requested: testsPerBatch,
        received: 0,
        written: 0,
        costUsd: llmResult.costUsd,
        error: parsed.error,
      });
      failures.push(`batch ${b + 1}: parse error: ${parsed.error}`);
      continue;
    }

    const written = await writeTestFiles({
      outDir: input.outDir,
      batch: b + 1,
      tests: parsed.tests,
    });
    allFiles.push(...written);
    perBatch.push({
      batch: b + 1,
      category,
      requested: testsPerBatch,
      received: parsed.tests.length,
      written: written.length,
      costUsd: llmResult.costUsd,
    });

    if (parsed.tests.length < testsPerBatch) {
      failures.push(
        `batch ${b + 1}: requested ${testsPerBatch}, received ${parsed.tests.length}`,
      );
    }
  }

  const ok = allFiles.length === totalRequested && failures.length === 0;
  return {
    ok,
    testsRequested: totalRequested,
    testsWritten: allFiles.length,
    generatedFiles: allFiles,
    perBatch,
    costUsd: totalCost > 0 ? totalCost : undefined,
    failures,
  };
}
