import { describe, it, after } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  readSectionTags,
  writeSectionTagsEntry,
  replaceSectionTags,
  dropSectionTagsEntries,
  sectionTagsPath,
  stableIdForHeader,
  SECTION_TAGS_FILE_VERSION,
} from "./sectionTags.js";
import { AGENTS_ROOT } from "../agent/specialization.js";

// AGENTS_ROOT is computed from process.cwd() at module load. Tests run from
// the repo root, so we land under `<repo>/agents/<id>/`.
function uniqueAgentId(): string {
  return `agent-test-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function cleanup(agentId: string): Promise<void> {
  const dir = path.join(AGENTS_ROOT, agentId);
  await fs.rm(dir, { recursive: true, force: true });
}

describe("sectionTags sidecar", () => {
  const agents: string[] = [];

  after(async () => {
    for (const id of agents) await cleanup(id);
  });

  it("readSectionTags returns empty file when sidecar is missing", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    const sidecar = await readSectionTags(id);
    assert.equal(sidecar.version, SECTION_TAGS_FILE_VERSION);
    assert.deepEqual(sidecar.sections, {});
  });

  it("writeSectionTagsEntry persists a single entry, sorted + deduped", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    await writeSectionTagsEntry(id, "stable-1", ["b", "a", "b", "c"]);
    const sidecar = await readSectionTags(id);
    assert.deepEqual(sidecar.sections["stable-1"], ["a", "b", "c"]);
  });

  it("writeSectionTagsEntry merges multiple entries", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    await writeSectionTagsEntry(id, "id-1", ["alpha"]);
    await writeSectionTagsEntry(id, "id-2", ["beta"]);
    const sidecar = await readSectionTags(id);
    assert.deepEqual(sidecar.sections, { "id-1": ["alpha"], "id-2": ["beta"] });
  });

  it("replaceSectionTags overwrites the whole sidecar", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    await writeSectionTagsEntry(id, "stale-id", ["old"]);
    await replaceSectionTags(id, { "fresh-id": ["new", "tag"] });
    const sidecar = await readSectionTags(id);
    assert.deepEqual(sidecar.sections, { "fresh-id": ["new", "tag"] });
  });

  it("dropSectionTagsEntries removes specific stable IDs only", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    await replaceSectionTags(id, {
      keep: ["a"],
      drop1: ["b"],
      drop2: ["c"],
    });
    await dropSectionTagsEntries(id, ["drop1", "drop2", "non-existent"]);
    const sidecar = await readSectionTags(id);
    assert.deepEqual(sidecar.sections, { keep: ["a"] });
  });

  it("dropSectionTagsEntries on empty drop set is a no-op", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    await replaceSectionTags(id, { id1: ["a"] });
    await dropSectionTagsEntries(id, []);
    const sidecar = await readSectionTags(id);
    assert.deepEqual(sidecar.sections, { id1: ["a"] });
  });

  it("readSectionTags ignores corrupt JSON gracefully (returns empty file)", async () => {
    const id = uniqueAgentId();
    agents.push(id);
    const filePath = sectionTagsPath(id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{not json");
    await assert.rejects(() => readSectionTags(id));
  });

  it("stableIdForHeader: single-issue sentinel", () => {
    const id = stableIdForHeader({
      runId: "r1",
      issueId: 42,
      outcome: "implement",
      ts: "t1",
    });
    assert.match(id, /^[a-f0-9]{64}$/);
  });

  it("stableIdForHeader: multi-issue (compacted) sentinel uses sorted issue list", () => {
    const a = stableIdForHeader({
      runId: "r1",
      issueId: 100,
      issueIds: [100, 101, 102],
      outcome: "compacted",
      ts: "t1",
    });
    const b = stableIdForHeader({
      runId: "r1",
      issueId: 101,
      issueIds: [102, 101, 100],
      outcome: "compacted",
      ts: "t1",
    });
    assert.equal(a, b);
  });
});
