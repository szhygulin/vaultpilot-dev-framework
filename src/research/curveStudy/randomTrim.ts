/**
 * Random-sampled CLAUDE.md trim planner.
 *
 * Operator-curated trims (drop-by-utility) confound size with which-sections-
 * survive: any "factor changes with size" finding could be the section
 * identity rather than the byte count. Random sampling at each target size
 * across multiple replicates breaks the confound — every section appears in
 * some small trims and is absent from others, so the regression learns
 * size's effect averaged over section identity.
 *
 * Methodology note: K replicates per size are required (K ≥ 5 recommended)
 * for the section-identity variance to average out in the regression. Single-
 * replicate runs reintroduce the confound.
 */

export interface ParsedSection {
  /** Stable slug identifier from the heading; used for preserve-list matching and reporting. */
  id: string;
  heading: string;
  /** Section body, NOT including the heading line. */
  body: string;
  /** Total bytes of `<heading-line>\n<body>` as it appears in the file. */
  bytes: number;
}

export interface ParseResult {
  /** Everything before the first ## heading — preserved verbatim in every trim. */
  preamble: string;
  preambleBytes: number;
  sections: ParsedSection[];
}

/**
 * Parse a CLAUDE.md into a preamble + top-level (## prefix) sections.
 * Sub-headings (### or deeper) stay inside their parent ## section.
 */
export function parseSections(md: string): ParseResult {
  const lines = md.split(/\r?\n/);
  let preambleEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      preambleEnd = i;
      break;
    }
  }
  const preamble = lines.slice(0, preambleEnd).join("\n") + (preambleEnd > 0 ? "\n" : "");
  const sections: ParsedSection[] = [];
  let cur: { heading: string; bodyLines: string[] } | null = null;
  const flush = (): void => {
    if (!cur) return;
    const body = cur.bodyLines.join("\n");
    const text = cur.heading + "\n" + body;
    sections.push({
      id: slugify(cur.heading),
      heading: cur.heading,
      body,
      bytes: Buffer.byteLength(text, "utf8") + 1, // +1 for trailing newline between sections
    });
  };
  for (let i = preambleEnd; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) {
      flush();
      cur = { heading: line, bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  flush();
  return {
    preamble,
    preambleBytes: Buffer.byteLength(preamble, "utf8"),
    sections,
  };
}

/** Strip "## " prefix, lowercase, replace runs of non-alphanum with hyphens, trim. */
export function slugify(heading: string): string {
  return heading
    .replace(/^##+\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mulberry32 — a tiny seedable PRNG for reproducibility. Public-domain;
 * good enough for shuffling a few dozen sections.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface RandomTrimOptions {
  parent: string;
  /** Optional section IDs that MUST stay in every trim. Any preserved section is a
   *  confounder — the study should report what was preserved. Empty by default. */
  preserve?: ReadonlyArray<string>;
  /** Approximate output size in bytes. Algorithm aims for ≤ targetBytes. */
  targetBytes: number;
  /** RNG seed for reproducibility. */
  seed: number;
}

export interface RandomTrimResult {
  trimmed: string;
  /** Section IDs included in this trim, in original order. */
  selectedIds: string[];
  /** Section IDs in the parent that this trim dropped. */
  droppedIds: string[];
  /** Actual byte size of `trimmed`. */
  actualBytes: number;
  /** Difference from target (negative = under, positive = over). */
  bytesOverTarget: number;
}

/**
 * Greedy random-fill subset selection: shuffle the eligible sections, then
 * iterate through the shuffled list, adding each if it fits the remaining
 * budget. Stops when no more fit. Preserved sections are added unconditionally
 * (their bytes count toward the budget).
 *
 * Output ordering: selected sections are emitted in their PARENT-FILE order,
 * not shuffled order — keeps the trimmed CLAUDE.md readable.
 *
 * Determinism: with the same parent + preserve + targetBytes + seed, returns
 * byte-identical trimmed content.
 */
export function randomTrim(opts: RandomTrimOptions): RandomTrimResult {
  const parsed = parseSections(opts.parent);
  const preserveSet = new Set(opts.preserve ?? []);
  const preserved = parsed.sections.filter((s) => preserveSet.has(s.id));
  const eligible = parsed.sections.filter((s) => !preserveSet.has(s.id));
  const floor =
    parsed.preambleBytes +
    preserved.reduce((sum, s) => sum + s.bytes, 0);
  let budget = opts.targetBytes - floor;

  const rng = mulberry32(opts.seed);
  const shuffled = shuffle(eligible, rng);
  const chosenSet = new Set<string>();
  for (const s of shuffled) {
    if (s.bytes <= budget) {
      chosenSet.add(s.id);
      budget -= s.bytes;
    }
  }
  // Re-emit in parent order so the file reads naturally
  const selectedInOrder = parsed.sections.filter((s) => preserveSet.has(s.id) || chosenSet.has(s.id));
  const droppedIds = parsed.sections.filter((s) => !preserveSet.has(s.id) && !chosenSet.has(s.id)).map((s) => s.id);

  const trimmed =
    parsed.preamble +
    selectedInOrder.map((s) => s.heading + "\n" + s.body).join("\n") +
    (selectedInOrder.length > 0 ? "\n" : "");
  const actualBytes = Buffer.byteLength(trimmed, "utf8");
  return {
    trimmed,
    selectedIds: selectedInOrder.map((s) => s.id),
    droppedIds,
    actualBytes,
    bytesOverTarget: actualBytes - opts.targetBytes,
  };
}

export interface TrimPlan {
  size: number;
  seed: number;
  result: RandomTrimResult;
}

/**
 * Plan K replicates at each target size, each with a deterministic seed
 * derived from `seedBase` so the entire plan is reproducible.
 *   seed(size, k) = seedBase + size + (k * 1000003)
 *
 * Returns one TrimPlan per (size, replicate) pair — `sizes.length × replicates`
 * total. Caller materializes each into a temp dev-agent dir and dispatches.
 */
export function planRandomTrims(opts: {
  parent: string;
  preserve?: ReadonlyArray<string>;
  sizes: ReadonlyArray<number>;
  replicates: number;
  seedBase: number;
}): TrimPlan[] {
  if (opts.replicates <= 0) {
    throw new Error(`planRandomTrims: replicates must be positive, got ${opts.replicates}`);
  }
  const out: TrimPlan[] = [];
  for (const size of opts.sizes) {
    for (let k = 0; k < opts.replicates; k++) {
      const seed = opts.seedBase + size + k * 1000003;
      const result = randomTrim({
        parent: opts.parent,
        preserve: opts.preserve,
        targetBytes: size,
        seed,
      });
      out.push({ size, seed, result });
    }
  }
  return out;
}
