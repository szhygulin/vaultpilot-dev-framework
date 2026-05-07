import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateTests,
  parseTestBatch,
  pickStyleFixture,
  listRepoTree,
  writeTestFiles,
  type LlmCall,
} from "./testGenerator.js";

async function makeRepo(opts?: { withStyleFixture?: boolean }): Promise<{
  repoPath: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-generator-test-"));
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.mkdir(path.join(dir, "src", "agent"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "index.ts"), "export const x = 1;\n");
  if (opts?.withStyleFixture !== false) {
    await fs.writeFile(
      path.join(dir, "src", "agent", "example.test.ts"),
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\n\ntest("example: basic assertion", () => {\n  assert.equal(1 + 1, 2);\n});\n`,
    );
  }
  return {
    repoPath: dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

function makeSyntheticLlm(
  responses: Array<{ tests: { filename: string; code: string; description?: string }[] } | string>,
): LlmCall {
  let i = 0;
  return async () => {
    if (i >= responses.length) {
      return { raw: "", isError: true, errorReason: "no more synthetic responses" };
    }
    const r = responses[i++];
    if (typeof r === "string") {
      return { raw: r, isError: false, costUsd: 0.05 };
    }
    return { raw: JSON.stringify(r), isError: false, costUsd: 0.05 };
  };
}

test("parseTestBatch: extracts tests from valid JSON", () => {
  const raw = JSON.stringify({
    tests: [
      { filename: "foo-bar.test.ts", code: "test('a', () => {});", description: "checks a" },
      { filename: "baz.test.ts", code: "test('b', () => {});" },
    ],
  });
  const out = parseTestBatch(raw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.tests.length, 2);
    assert.equal(out.tests[0].filename, "foo-bar.test.ts");
  }
});

test("parseTestBatch: rejects malformed JSON", () => {
  const out = parseTestBatch("not json at all");
  assert.equal(out.ok, false);
});

test("parseTestBatch: rejects valid JSON missing required fields", () => {
  const raw = JSON.stringify({ tests: [{ filename: "x.test.ts" }] }); // missing code
  const out = parseTestBatch(raw);
  assert.equal(out.ok, false);
});

test("parseTestBatch: salvages JSON wrapped in markdown fences", () => {
  const raw = "```json\n" + JSON.stringify({
    tests: [{ filename: "foo.test.ts", code: "test('x', () => {});" }],
  }) + "\n```";
  const out = parseTestBatch(raw);
  assert.equal(out.ok, true);
});

test("listRepoTree: emits depth-2 listing, excludes node_modules / dist / .git", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    await fs.mkdir(path.join(repoPath, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "node_modules", "should-not-appear.txt"), "");
    const tree = await listRepoTree(repoPath, 2);
    assert.match(tree, /src\//);
    assert.match(tree, /agent\//);
    assert.doesNotMatch(tree, /node_modules/);
  } finally {
    await cleanup();
  }
});

test("pickStyleFixture: returns the largest .test.ts file", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const fixture = await pickStyleFixture(repoPath);
    assert.ok(fixture, "expected a style fixture");
    if (fixture) {
      assert.match(fixture.path, /\.test\.ts$/);
      assert.match(fixture.contents, /import \{ test \} from "node:test"/);
    }
  } finally {
    await cleanup();
  }
});

test("pickStyleFixture: returns null when no test files exist", async () => {
  const { repoPath, cleanup } = await makeRepo({ withStyleFixture: false });
  try {
    const fixture = await pickStyleFixture(repoPath);
    assert.equal(fixture, null);
  } finally {
    await cleanup();
  }
});

test("writeTestFiles: writes one file per test, sanitizes filenames", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const outDir = path.join(repoPath, "out");
    const written = await writeTestFiles({
      outDir,
      batch: 1,
      tests: [
        { filename: "Foo Bar.test.ts", code: "// a" },
        { filename: "weird/path/baz.test.ts", code: "// b" },
        { filename: "", code: "// fallback" },
      ],
    });
    assert.equal(written.length, 3);
    for (const p of written) {
      assert.match(path.basename(p), /^b1-[a-z0-9-]+\.test\.ts$/);
      const contents = await fs.readFile(p, "utf-8");
      assert.ok(contents.length > 0);
    }
  } finally {
    await cleanup();
  }
});

test("writeTestFiles: deduplicates filename collisions across the batch", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const outDir = path.join(repoPath, "out");
    const written = await writeTestFiles({
      outDir,
      batch: 1,
      tests: [
        { filename: "same.test.ts", code: "// one" },
        { filename: "same.test.ts", code: "// two" },
        { filename: "same.test.ts", code: "// three" },
      ],
    });
    assert.equal(written.length, 3);
    const names = new Set(written.map((p) => path.basename(p)));
    assert.equal(names.size, 3, "expected three unique filenames");
  } finally {
    await cleanup();
  }
});

test("generateTests: ok=true when all batches return the requested test count", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const llm = makeSyntheticLlm([
      { tests: [{ filename: "a-1.test.ts", code: "// 1" }, { filename: "a-2.test.ts", code: "// 2" }] },
      { tests: [{ filename: "b-1.test.ts", code: "// 3" }, { filename: "b-2.test.ts", code: "// 4" }] },
    ]);
    const out = await generateTests({
      issueId: 100,
      issueTitle: "Test issue",
      issueBody: "Body",
      repoPath,
      framework: "node-test",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 2,
      testsPerBatch: 2,
      llmCall: llm,
    });
    assert.equal(out.ok, true);
    assert.equal(out.testsRequested, 4);
    assert.equal(out.testsWritten, 4);
    assert.equal(out.generatedFiles.length, 4);
    assert.equal(out.failures.length, 0);
    assert.equal(out.perBatch.length, 2);
    assert.equal(out.costUsd, 0.1);
  } finally {
    await cleanup();
  }
});

test("generateTests: prompt instructs the LLM that tests live at curve-redo-hidden-tests/ and imports must use ../src/ paths", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const captured: { systemPrompt: string; userPrompt: string }[] = [];
    const llm: LlmCall = async (args) => {
      captured.push({ systemPrompt: args.systemPrompt, userPrompt: args.userPrompt });
      return {
        raw: JSON.stringify({ tests: [{ filename: "a.test.ts", code: "// noop" }] }),
        isError: false,
        costUsd: 0.01,
      };
    };
    await generateTests({
      issueId: 999,
      issueTitle: "Capture prompts",
      issueBody: "Body",
      repoPath,
      framework: "node-test",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 1,
      testsPerBatch: 1,
      llmCall: llm,
    });
    assert.equal(captured.length, 1);
    const sys = captured[0].systemPrompt;
    // Test placement is named explicitly so the LLM knows where its output runs from.
    assert.match(sys, /curve-redo-hidden-tests\//);
    // Both the do (../src/) and the don't (no sibling) are spelled out.
    assert.match(sys, /\.\.\/src\//);
    assert.match(sys, /sibling imports/i);
    // Style fixture's path style is explicitly NOT to be mimicked.
    const user = captured[0].userPrompt;
    assert.match(user, /API\/idiom style, NOT its import-path style/);
  } finally {
    await cleanup();
  }
});

test("generateTests: ok=false and failures recorded when LLM short-counts a batch", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const llm = makeSyntheticLlm([
      { tests: [{ filename: "a-1.test.ts", code: "// 1" }] }, // requested 2, got 1
      { tests: [{ filename: "b-1.test.ts", code: "// 2" }, { filename: "b-2.test.ts", code: "// 3" }] },
    ]);
    const out = await generateTests({
      issueId: 200,
      issueTitle: "Short-count issue",
      issueBody: "Body",
      repoPath,
      framework: "node-test",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 2,
      testsPerBatch: 2,
      llmCall: llm,
    });
    assert.equal(out.ok, false);
    assert.equal(out.testsWritten, 3);
    assert.ok(out.failures.some((f) => f.includes("batch 1")));
  } finally {
    await cleanup();
  }
});

test("generateTests: ok=false when LLM returns an error", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const llm: LlmCall = async () => ({
      raw: "",
      isError: true,
      errorReason: "rate_limit",
    });
    const out = await generateTests({
      issueId: 300,
      issueTitle: "Rate-limited",
      issueBody: "Body",
      repoPath,
      framework: "vitest",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 1,
      testsPerBatch: 5,
      llmCall: llm,
    });
    assert.equal(out.ok, false);
    assert.ok(out.failures.some((f) => f.includes("rate_limit")));
    assert.equal(out.testsWritten, 0);
  } finally {
    await cleanup();
  }
});

test("generateTests: ok=false when LLM returns malformed JSON", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const llm = makeSyntheticLlm(["this is not JSON"]);
    const out = await generateTests({
      issueId: 400,
      issueTitle: "Malformed",
      issueBody: "Body",
      repoPath,
      framework: "node-test",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 1,
      testsPerBatch: 3,
      llmCall: llm,
    });
    assert.equal(out.ok, false);
    assert.equal(out.testsWritten, 0);
    assert.ok(out.failures.some((f) => /parse error/.test(f)));
  } finally {
    await cleanup();
  }
});

test("generateTests: ok=false when no style fixture is available in the repo", async () => {
  const { repoPath, cleanup } = await makeRepo({ withStyleFixture: false });
  try {
    const out = await generateTests({
      issueId: 500,
      issueTitle: "No style",
      issueBody: "Body",
      repoPath,
      framework: "node-test",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 1,
      testsPerBatch: 1,
      llmCall: makeSyntheticLlm([]),
    });
    assert.equal(out.ok, false);
    assert.ok(out.failures.some((f) => /style fixture/.test(f)));
  } finally {
    await cleanup();
  }
});

test("generateTests: respects an explicit styleFixturePath", async () => {
  const { repoPath, cleanup } = await makeRepo();
  try {
    const customFixture = path.join(repoPath, "custom.test.ts");
    await fs.writeFile(customFixture, "import { test } from 'vitest';\ntest('x', () => {});\n");
    const llm = makeSyntheticLlm([
      { tests: [{ filename: "a.test.ts", code: "// a" }] },
    ]);
    const out = await generateTests({
      issueId: 600,
      issueTitle: "Custom fixture",
      issueBody: "Body",
      repoPath,
      framework: "vitest",
      outDir: path.join(repoPath, "tests-out"),
      batchCount: 1,
      testsPerBatch: 1,
      styleFixturePath: customFixture,
      llmCall: llm,
    });
    assert.equal(out.ok, true);
    assert.equal(out.testsWritten, 1);
  } finally {
    await cleanup();
  }
});
