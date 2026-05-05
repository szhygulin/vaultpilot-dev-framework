import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  applyTrimProposal,
  buildTrimUserPrompt,
  emitPool,
  formatTrimProposal,
  parsePool,
  reconcileVerdicts,
  selectKeptEntries,
  type PoolEntry,
  type PoolFile,
  type TrimProposal,
  type TrimVerdict,
} from "../agent/trimPool.js";
import { MAX_POOL_LINES } from "../agent/sharedLessons.js";

function makePoolContent(domain: string, entries: { source: string; issueId: number; ts: string; body: string }[]): string {
  const header =
    `# Shared lessons: ${domain}\n` +
    `\n` +
    `Curated cross-agent lessons for the \`${domain}\` domain.\n` +
    `\n` +
    `\n`;
  const blocks = entries
    .map(
      (e) =>
        `<!-- entry source:${e.source} issue:#${e.issueId} ts:${e.ts} -->\n${e.body}\n`,
    )
    .join("");
  return header + blocks;
}

test("parsePool: extracts header + entries; empty pool yields zero entries", () => {
  const content = makePoolContent("solana", []);
  const file = parsePool("solana", content);
  assert.equal(file.domain, "solana");
  assert.equal(file.entries.length, 0);
  assert.match(file.header, /# Shared lessons: solana/);
});

test("parsePool: parses single entry with multi-line body", () => {
  const content = makePoolContent("solana", [
    {
      source: "agent-90e4",
      issueId: 42,
      ts: "2026-04-29T12:00:00.000Z",
      body: "Solana RPC X behaves like Y.\nConfirm with `getRecentBlockhash`.",
    },
  ]);
  const file = parsePool("solana", content);
  assert.equal(file.entries.length, 1);
  const e = file.entries[0];
  assert.equal(e.index, 0);
  assert.equal(e.source, "agent-90e4");
  assert.equal(e.issueId, 42);
  assert.equal(e.ts, "2026-04-29T12:00:00.000Z");
  assert.match(e.body, /Solana RPC X behaves like Y/);
  assert.match(e.body, /getRecentBlockhash/);
});

test("parsePool: parses multiple entries in pool order", () => {
  const content = makePoolContent("eip-712", [
    {
      source: "agent-1111",
      issueId: 1,
      ts: "2026-01-01T00:00:00.000Z",
      body: "Entry one body.",
    },
    {
      source: "agent-2222",
      issueId: 2,
      ts: "2026-02-02T00:00:00.000Z",
      body: "Entry two body line A.\nEntry two body line B.",
    },
    {
      source: "agent-3333",
      issueId: 3,
      ts: "2026-03-03T00:00:00.000Z",
      body: "Entry three body.",
    },
  ]);
  const file = parsePool("eip-712", content);
  assert.equal(file.entries.length, 3);
  assert.equal(file.entries[0].issueId, 1);
  assert.equal(file.entries[1].issueId, 2);
  assert.equal(file.entries[2].issueId, 3);
  assert.match(file.entries[1].body, /Entry two body line A/);
  assert.match(file.entries[1].body, /Entry two body line B/);
});

test("parsePool: rejects invalid domain", () => {
  assert.throws(() => parsePool("Bad-Domain", "ignored"));
  assert.throws(() => parsePool("", "ignored"));
});

test("emitPool roundtrips an unchanged pool", () => {
  const content = makePoolContent("solana", [
    {
      source: "agent-aaaa",
      issueId: 10,
      ts: "2026-04-01T00:00:00.000Z",
      body: "Body one.",
    },
    {
      source: "agent-bbbb",
      issueId: 20,
      ts: "2026-04-02T00:00:00.000Z",
      body: "Body two\nwith two lines.",
    },
  ]);
  const file = parsePool("solana", content);
  const reEmitted = emitPool(file, file.entries);
  // The re-emitted file must parse back to the same entry set verbatim.
  const round = parsePool("solana", reEmitted);
  assert.equal(round.entries.length, 2);
  assert.equal(round.entries[0].source, "agent-aaaa");
  assert.equal(round.entries[0].body, "Body one.");
  assert.equal(round.entries[1].source, "agent-bbbb");
  assert.equal(round.entries[1].body, "Body two\nwith two lines.");
});

test("selectKeptEntries: drop verdicts always drop; maybe kept by default", () => {
  const file: PoolFile = {
    domain: "solana",
    header: "",
    entries: [
      mkEntry(0, "a", 1, "t1", "body0"),
      mkEntry(1, "b", 2, "t2", "body1"),
      mkEntry(2, "c", 3, "t3", "body2"),
    ],
    totalLines: 0,
  };
  const verdicts: TrimVerdict[] = [
    { entryIndex: 0, verdict: "keep", rationale: "" },
    { entryIndex: 1, verdict: "maybe", rationale: "" },
    { entryIndex: 2, verdict: "drop", rationale: "" },
  ];
  const keptDefault = selectKeptEntries(file, verdicts);
  assert.deepEqual(keptDefault.map((e) => e.index), [0, 1]);

  const keptDropMaybes = selectKeptEntries(file, verdicts, { dropMaybes: true });
  assert.deepEqual(keptDropMaybes.map((e) => e.index), [0]);
});

test("reconcileVerdicts: missing verdict defaults to keep; out-of-range ignored", () => {
  const file: PoolFile = {
    domain: "solana",
    header: "",
    entries: [
      mkEntry(0, "a", 1, "t", "b"),
      mkEntry(1, "b", 2, "t", "b"),
      mkEntry(2, "c", 3, "t", "b"),
    ],
    totalLines: 0,
  };
  const raw: TrimVerdict[] = [
    { entryIndex: 0, verdict: "drop", rationale: "x" },
    { entryIndex: 99, verdict: "drop", rationale: "out of range" },
    { entryIndex: 2, verdict: "drop", rationale: "x" },
    // entry 1 deliberately omitted
  ];
  const sane = reconcileVerdicts(file, raw);
  assert.equal(sane.length, 3);
  assert.equal(sane[0].entryIndex, 0);
  assert.equal(sane[0].verdict, "drop");
  assert.equal(sane[1].entryIndex, 1);
  assert.equal(sane[1].verdict, "keep");
  assert.match(sane[1].rationale, /defaulting to keep/);
  assert.equal(sane[2].entryIndex, 2);
  assert.equal(sane[2].verdict, "drop");
});

test("reconcileVerdicts: dedups duplicate verdicts on the same entryIndex", () => {
  const file: PoolFile = {
    domain: "solana",
    header: "",
    entries: [mkEntry(0, "a", 1, "t", "b")],
    totalLines: 0,
  };
  const raw: TrimVerdict[] = [
    { entryIndex: 0, verdict: "keep", rationale: "first" },
    { entryIndex: 0, verdict: "drop", rationale: "second (dropped)" },
  ];
  const sane = reconcileVerdicts(file, raw);
  assert.equal(sane.length, 1);
  assert.equal(sane[0].verdict, "keep");
  assert.equal(sane[0].rationale, "first");
});

test("buildTrimUserPrompt: includes per-entry index, source, issueId, ts", () => {
  const file = parsePool(
    "solana",
    makePoolContent("solana", [
      { source: "agent-aa", issueId: 5, ts: "2026-01-01T00:00:00.000Z", body: "X" },
      { source: "agent-bb", issueId: 6, ts: "2026-02-01T00:00:00.000Z", body: "Y" },
    ]),
  );
  const prompt = buildTrimUserPrompt(file);
  assert.match(prompt, /entry 0/);
  assert.match(prompt, /agent-aa/);
  assert.match(prompt, /issue=#5/);
  assert.match(prompt, /ts=2026-01-01T00:00:00.000Z/);
  assert.match(prompt, /entry 1/);
  assert.match(prompt, /agent-bb/);
  assert.match(prompt, /Emit verdicts JSON now\./);
});

test("formatTrimProposal: surfaces verdict tags and projected line count", () => {
  const file = parsePool(
    "solana",
    makePoolContent("solana", [
      { source: "a", issueId: 1, ts: "2026-01-01T00:00:00.000Z", body: "alpha" },
      { source: "b", issueId: 2, ts: "2026-02-01T00:00:00.000Z", body: "beta" },
    ]),
  );
  const proposal: TrimProposal = {
    domain: "solana",
    filePath: "/tmp/solana.md",
    totalEntries: 2,
    totalLines: file.totalLines,
    verdicts: [
      { entryIndex: 0, verdict: "drop", rationale: "stale" },
      { entryIndex: 1, verdict: "keep", rationale: "useful" },
    ],
  };
  const text = formatTrimProposal(file, proposal);
  assert.match(text, /\[DROP \] entry 0/);
  assert.match(text, /\[KEEP \] entry 1/);
  assert.match(text, /stale/);
  assert.match(text, /useful/);
  assert.match(text, /keep 1 \/ drop 1/);
  assert.match(text, new RegExp(`/${MAX_POOL_LINES} lines`));
});

test("applyTrimProposal: rewrites pool dropping the targeted entries", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-trim-pool-"));
  // applyTrimProposal goes through sharedLessonsPath(domain), which is
  // pinned to AGENTS_ROOT/.shared/lessons/. To exercise the function
  // end-to-end without coupling to that root, redirect via the proposal's
  // explicit filePath.
  const filePath = path.join(tmpRoot, "test-domain.md");
  const content = makePoolContent("solana", [
    { source: "agent-a", issueId: 1, ts: "2026-01-01T00:00:00.000Z", body: "alpha line one\nalpha line two" },
    { source: "agent-b", issueId: 2, ts: "2026-02-01T00:00:00.000Z", body: "beta only line" },
    { source: "agent-c", issueId: 3, ts: "2026-03-01T00:00:00.000Z", body: "gamma line" },
  ]);
  await fs.writeFile(filePath, content);
  const file = parsePool("solana", content);
  const proposal: TrimProposal = {
    domain: "solana",
    filePath,
    totalEntries: 3,
    totalLines: file.totalLines,
    verdicts: [
      { entryIndex: 0, verdict: "drop", rationale: "stale" },
      { entryIndex: 1, verdict: "keep", rationale: "useful" },
      { entryIndex: 2, verdict: "maybe", rationale: "narrow" },
    ],
  };

  // Default: keep maybes.
  const result = await applyTrimProposal({ proposal, file });
  assert.equal(result.kind, "applied");
  if (result.kind !== "applied") return;
  assert.equal(result.kept, 2);
  assert.equal(result.dropped, 1);
  const after = await fs.readFile(filePath, "utf-8");
  const reparsed = parsePool("solana", after);
  assert.deepEqual(
    reparsed.entries.map((e) => e.source),
    ["agent-b", "agent-c"],
  );
  assert.equal(reparsed.entries[0].body, "beta only line");
  assert.equal(reparsed.entries[1].body, "gamma line");

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("applyTrimProposal: dropMaybes also removes 'maybe' entries", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-trim-pool-"));
  const filePath = path.join(tmpRoot, "test-domain.md");
  const content = makePoolContent("eip-712", [
    { source: "agent-a", issueId: 1, ts: "2026-01-01T00:00:00.000Z", body: "alpha" },
    { source: "agent-b", issueId: 2, ts: "2026-02-01T00:00:00.000Z", body: "beta" },
    { source: "agent-c", issueId: 3, ts: "2026-03-01T00:00:00.000Z", body: "gamma" },
  ]);
  await fs.writeFile(filePath, content);
  const file = parsePool("eip-712", content);
  const proposal: TrimProposal = {
    domain: "eip-712",
    filePath,
    totalEntries: 3,
    totalLines: file.totalLines,
    verdicts: [
      { entryIndex: 0, verdict: "keep", rationale: "" },
      { entryIndex: 1, verdict: "maybe", rationale: "" },
      { entryIndex: 2, verdict: "drop", rationale: "" },
    ],
  };

  const result = await applyTrimProposal({ proposal, file, dropMaybes: true });
  assert.equal(result.kind, "applied");
  if (result.kind !== "applied") return;
  assert.equal(result.kept, 1);
  assert.equal(result.dropped, 2);
  const after = await fs.readFile(filePath, "utf-8");
  const reparsed = parsePool("eip-712", after);
  assert.deepEqual(reparsed.entries.map((e) => e.source), ["agent-a"]);

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("applyTrimProposal: refuses to write if result still exceeds line cap", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-trim-pool-"));
  const filePath = path.join(tmpRoot, "test-domain.md");
  // Build a pool that overflows MAX_POOL_LINES even with a single entry.
  const giantBody = Array.from({ length: MAX_POOL_LINES + 50 }, (_, i) => `line ${i}`).join("\n");
  const content = makePoolContent("solana", [
    { source: "agent-a", issueId: 1, ts: "2026-01-01T00:00:00.000Z", body: giantBody },
  ]);
  await fs.writeFile(filePath, content);
  const file = parsePool("solana", content);
  const proposal: TrimProposal = {
    domain: "solana",
    filePath,
    totalEntries: 1,
    totalLines: file.totalLines,
    verdicts: [{ entryIndex: 0, verdict: "keep", rationale: "" }],
  };
  const result = await applyTrimProposal({ proposal, file });
  assert.equal(result.kind, "still-over-cap");
  // File must NOT have been mutated.
  const after = await fs.readFile(filePath, "utf-8");
  assert.equal(after, content);

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("applyTrimProposal: drift-tolerant — entry appended after propose is preserved", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-trim-pool-"));
  const filePath = path.join(tmpRoot, "test-domain.md");
  const initialEntries = [
    { source: "agent-a", issueId: 1, ts: "2026-01-01T00:00:00.000Z", body: "alpha" },
    { source: "agent-b", issueId: 2, ts: "2026-02-01T00:00:00.000Z", body: "beta" },
  ];
  await fs.writeFile(filePath, makePoolContent("solana", initialEntries));
  const file = parsePool("solana", await fs.readFile(filePath, "utf-8"));

  // Simulate a concurrent append between propose and apply.
  const driftedEntries = [
    ...initialEntries,
    { source: "agent-c", issueId: 3, ts: "2026-03-01T00:00:00.000Z", body: "gamma (appended after propose)" },
  ];
  await fs.writeFile(filePath, makePoolContent("solana", driftedEntries));

  // Proposal still references the propose-time entry indices (0, 1) only.
  const proposal: TrimProposal = {
    domain: "solana",
    filePath,
    totalEntries: 2,
    totalLines: file.totalLines,
    verdicts: [
      { entryIndex: 0, verdict: "drop", rationale: "stale" },
      { entryIndex: 1, verdict: "keep", rationale: "useful" },
    ],
  };

  const result = await applyTrimProposal({ proposal, file });
  assert.equal(result.kind, "applied");
  if (result.kind !== "applied") return;
  // agent-a dropped, agent-b kept, agent-c (drifted-in) preserved.
  const after = await fs.readFile(filePath, "utf-8");
  const reparsed = parsePool("solana", after);
  assert.deepEqual(
    reparsed.entries.map((e) => e.source),
    ["agent-b", "agent-c"],
  );

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function mkEntry(
  index: number,
  source: string,
  issueId: number,
  ts: string,
  body: string,
): PoolEntry {
  return {
    index,
    source,
    issueId,
    ts,
    body,
    startLine: 0,
    endLine: 0,
  };
}
