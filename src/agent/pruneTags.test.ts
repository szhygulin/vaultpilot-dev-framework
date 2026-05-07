import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseSectionTagsUnion,
  applyTagFloor,
  computePruneTagsProposalHash,
  type PruneTagsProposal,
} from "./pruneTags.js";

// Build a minimal CLAUDE.md fixture with N sentinels carrying the supplied
// tag arrays.
function buildClaudeMd(sentinels: { runId: string; issueId: number; tags: string[] }[]): string {
  const lines: string[] = ["# Seed", ""];
  for (const s of sentinels) {
    const tagsPart = s.tags.length > 0 ? ` tags:${[...s.tags].sort().join(",")}` : "";
    lines.push(
      `<!-- run:${s.runId} issue:#${s.issueId} outcome:implement ts:2026-05-07T00:00:00Z${tagsPart} -->`,
    );
    lines.push(`## Lesson ${s.issueId}`);
    lines.push("body");
    lines.push("");
  }
  return lines.join("\n");
}

describe("parseSectionTagsUnion", () => {
  it("returns empty union and zero count for an empty file", () => {
    const { union, sectionCount } = parseSectionTagsUnion("");
    assert.equal(union.size, 0);
    assert.equal(sectionCount, 0);
  });

  it("returns empty union and zero count when no sentinels present", () => {
    const md = "# Seed\n\nSome prose. No sentinels here.\n";
    const { union, sectionCount } = parseSectionTagsUnion(md);
    assert.equal(union.size, 0);
    assert.equal(sectionCount, 0);
  });

  it("collects tags across multiple sentinels", () => {
    const md = buildClaudeMd([
      { runId: "r1", issueId: 100, tags: ["alpha", "beta"] },
      { runId: "r2", issueId: 101, tags: ["beta", "gamma"] },
    ]);
    const { union, sectionCount } = parseSectionTagsUnion(md);
    assert.equal(sectionCount, 2);
    assert.deepEqual([...union].sort(), ["alpha", "beta", "gamma"]);
  });

  it("counts sentinels without tags but contributes nothing to union (legacy)", () => {
    const md = buildClaudeMd([
      { runId: "r1", issueId: 100, tags: [] },
      { runId: "r2", issueId: 101, tags: ["delta"] },
    ]);
    const { union, sectionCount } = parseSectionTagsUnion(md);
    assert.equal(sectionCount, 2);
    assert.deepEqual([...union], ["delta"]);
  });

  it("handles multi-issue (compacted) sentinels without crashing", () => {
    const md = [
      "# Seed",
      "",
      "<!-- run:r1 issue:#100+#101+#102 outcome:compacted ts:2026-05-07T00:00:00Z tags:zeta,eta -->",
      "## Compacted lesson",
      "body",
    ].join("\n");
    const { union, sectionCount } = parseSectionTagsUnion(md);
    assert.equal(sectionCount, 1);
    assert.deepEqual([...union].sort(), ["eta", "zeta"]);
  });
});

describe("applyTagFloor", () => {
  it("returns ['general'] for an empty input set", () => {
    assert.deepEqual(applyTagFloor(new Set()), ["general"]);
  });

  it("preserves a single 'general' tag when alone", () => {
    assert.deepEqual(applyTagFloor(new Set(["general"])), ["general"]);
  });

  it("strips 'general' when other tags survive", () => {
    assert.deepEqual(applyTagFloor(new Set(["general", "alpha", "beta"])), [
      "alpha",
      "beta",
    ]);
  });

  it("preserves the input set when 'general' is absent", () => {
    assert.deepEqual(applyTagFloor(new Set(["alpha", "beta", "gamma"])), [
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("dedupes via Set semantics (input is ReadonlySet so no array dupes)", () => {
    const set = new Set<string>();
    set.add("alpha");
    set.add("beta");
    assert.deepEqual(applyTagFloor(set), ["alpha", "beta"]);
  });
});

// Phase 1 (no-LLM) proposal logic — exercises proposePruneTags via the
// `noGeneralize: true` path so tests stay deterministic and don't require
// the SDK / network.
describe("proposePruneTags (Phase 1 only)", () => {
  // Lazy import to avoid pulling the SDK at module load.
  async function propose(args: {
    tags: string[];
    sentinels: { runId: string; issueId: number; tags: string[] }[];
    noGeneralize?: boolean;
  }) {
    const { proposePruneTags } = await import("./pruneTags.js");
    return proposePruneTags({
      agent: {
        agentId: "agent-test",
        createdAt: "2026-01-01T00:00:00Z",
        tags: args.tags,
        issuesHandled: 0,
        implementCount: 0,
        pushbackCount: 0,
        errorCount: 0,
        lastActiveAt: "2026-01-01T00:00:00Z",
      },
      claudeMd: buildClaudeMd(args.sentinels),
      noGeneralize: args.noGeneralize ?? true,
    });
  }

  it("zero attributable sections: notes set, registry tags untouched", async () => {
    const p = await propose({ tags: ["alpha", "beta"], sentinels: [] });
    assert.equal(p.attributableSections, 0);
    assert.deepEqual(p.orphanTags, []);
    assert.deepEqual(p.finalTags, ["alpha", "beta"]);
    assert.match(p.notes ?? "", /No attributable sections/);
  });

  it("sections present but no tag provenance (post-split children, pre-#142): tags untouched", async () => {
    // Sentinels with empty tags array — exactly the shape post-split
    // children carry from split.ts:458 (no `tags:` field on materialized
    // sentinels) AND pre-#142 legacy sentinels.
    const p = await propose({
      tags: ["alpha", "beta", "gamma"],
      sentinels: [
        { runId: "r1", issueId: 1, tags: [] },
        { runId: "r2", issueId: 2, tags: [] },
      ],
    });
    assert.equal(p.attributableSections, 2);
    assert.equal(p.sectionTagsUnion.length, 0);
    assert.deepEqual(p.orphanTags, []);
    assert.deepEqual(p.finalTags, ["alpha", "beta", "gamma"]);
    assert.match(p.notes ?? "", /lack tag provenance/);
  });

  it("identifies orphans against section-tag union", async () => {
    const p = await propose({
      tags: ["alpha", "beta", "gamma", "general"],
      sentinels: [{ runId: "r1", issueId: 1, tags: ["alpha"] }],
    });
    assert.deepEqual(p.orphanTags, ["beta", "gamma", "general"]);
    assert.deepEqual(p.ungeneralizedKept, ["alpha"]);
    assert.deepEqual(p.finalTags, ["alpha"]);
  });

  it("floor protection: registry of only orphans + general -> ['general']", async () => {
    // Section has tags but none match the registry.
    const p = await propose({
      tags: ["unrelated", "general"],
      sentinels: [{ runId: "r1", issueId: 1, tags: ["alpha"] }],
    });
    assert.deepEqual(p.orphanTags, ["general", "unrelated"]);
    assert.deepEqual(p.ungeneralizedKept, []);
    assert.deepEqual(p.finalTags, ["general"]);
  });

  it("registry exactly matches section-tag union: nothing to prune", async () => {
    const p = await propose({
      tags: ["alpha", "beta"],
      sentinels: [{ runId: "r1", issueId: 1, tags: ["alpha", "beta"] }],
    });
    assert.deepEqual(p.orphanTags, []);
    assert.deepEqual(p.finalTags, ["alpha", "beta"]);
  });

  it("--no-generalize note set when explicit and lesson-backed >= 2", async () => {
    const p = await propose({
      tags: ["alpha", "beta", "orphan"],
      sentinels: [{ runId: "r1", issueId: 1, tags: ["alpha", "beta"] }],
      noGeneralize: true,
    });
    assert.deepEqual(p.orphanTags, ["orphan"]);
    assert.deepEqual(p.generalizationClusters, []);
    assert.match(p.notes ?? "", /Phase 2 skipped/);
  });

  it("idempotent: re-running on a registry already equal to lesson-backed surfaces zero orphans", async () => {
    const sentinels = [{ runId: "r1", issueId: 1, tags: ["alpha", "beta"] }];
    const first = await propose({ tags: ["alpha", "beta", "orphan"], sentinels });
    // Imagine apply happened: tags now equal first.finalTags.
    const second = await propose({ tags: first.finalTags, sentinels });
    assert.deepEqual(second.orphanTags, []);
    assert.deepEqual(second.finalTags, first.finalTags);
  });
});

describe("computePruneTagsProposalHash", () => {
  function makeProposal(overrides: Partial<PruneTagsProposal> = {}): PruneTagsProposal {
    return {
      agentId: "agent-test",
      generatedAt: "2026-05-07T00:00:00Z",
      registryTagsBefore: ["alpha", "beta", "orphan"],
      sectionTagsUnion: ["alpha", "beta"],
      attributableSections: 1,
      orphanTags: ["orphan"],
      generalizationClusters: [],
      ungeneralizedKept: ["alpha", "beta"],
      finalTags: ["alpha", "beta"],
      ...overrides,
    };
  }

  it("stable across reruns with the same inputs", () => {
    const p = makeProposal();
    const tags = ["alpha", "beta", "orphan"];
    const md = "# claudeMd content\n";
    const h1 = computePruneTagsProposalHash(p, tags, md);
    const h2 = computePruneTagsProposalHash(p, tags, md);
    assert.equal(h1, h2);
  });

  it("changes when registry tags change", () => {
    const p = makeProposal();
    const md = "# claudeMd content\n";
    const h1 = computePruneTagsProposalHash(p, ["alpha", "beta", "orphan"], md);
    const h2 = computePruneTagsProposalHash(p, ["alpha", "beta", "orphan", "new"], md);
    assert.notEqual(h1, h2);
  });

  it("changes when CLAUDE.md changes", () => {
    const p = makeProposal();
    const tags = ["alpha", "beta", "orphan"];
    const h1 = computePruneTagsProposalHash(p, tags, "v1");
    const h2 = computePruneTagsProposalHash(p, tags, "v2");
    assert.notEqual(h1, h2);
  });

  it("changes when proposal finalTags differ", () => {
    const tags = ["alpha", "beta", "orphan"];
    const md = "# claudeMd content\n";
    const h1 = computePruneTagsProposalHash(makeProposal({ finalTags: ["alpha", "beta"] }), tags, md);
    const h2 = computePruneTagsProposalHash(makeProposal({ finalTags: ["alpha"] }), tags, md);
    assert.notEqual(h1, h2);
  });

  it("hash is order-independent for input tags (sort before hash)", () => {
    const p = makeProposal();
    const md = "# claudeMd content\n";
    const h1 = computePruneTagsProposalHash(p, ["alpha", "beta", "orphan"], md);
    const h2 = computePruneTagsProposalHash(p, ["orphan", "beta", "alpha"], md);
    assert.equal(h1, h2);
  });
});
