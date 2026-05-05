// Line-by-line diff helper for the `vp-dev run --confirm` divergence error
// (issue #137). When the preview at confirm-time hashes differently from the
// preview at plan-time, the legacy error blamed the operator with generic
// prose ("Registry, open-issue set, or triage outcome changed"). The actual
// drift is almost always a single line — for example, the `Triage cost:`
// line going from `$0.0241` to `$0.0000` because triage cache hits returned
// `costUsd: 0`. A unified diff identifies the drifted line directly.
//
// Pure: no I/O, no logging. Bounded output: caps the number of diff lines
// shown so a wildly different preview (e.g. operator filed 30 new issues)
// doesn't flood the console.

export interface PreviewDiffOptions {
  // Cap on emitted diff lines. The output is truncated with a `... (N more)`
  // marker once exceeded. 40 fits a typical terminal viewport without
  // scrolling and reliably surfaces single-line drifts.
  maxLines?: number;
}

const DEFAULT_MAX_LINES = 40;

/**
 * Returns a unified-style line diff between `expected` and `actual`. Each
 * line is prefixed with one of:
 *   - `  ` (unchanged context — only emitted on either side of a hunk)
 *   - `- ` (only in expected)
 *   - `+ ` (only in actual)
 *
 * The algorithm is intentionally simple: longest-common-subsequence on the
 * line sequences, rendered as a unified diff with single-line context. It's
 * fine for the gate preview (a few dozen lines); it is NOT a general-purpose
 * diff library.
 */
export function diffPreview(
  expected: string,
  actual: string,
  opts: PreviewDiffOptions = {},
): string {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const a = expected.split("\n");
  const b = actual.split("\n");

  // Build LCS table.
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  // Walk the LCS table to emit a unified-style diff with one line of
  // context on either side of each change.
  const ops: Array<{ kind: "ctx" | "del" | "add"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: "ctx", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ kind: "del", text: a[i] });
      i++;
    } else {
      ops.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "del", text: a[i] });
    i++;
  }
  while (j < n) {
    ops.push({ kind: "add", text: b[j] });
    j++;
  }

  // Render: keep all change lines, plus one context line on either side of
  // a hunk. Drop interior runs of unchanged context entirely.
  const out: string[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.kind === "ctx") {
      const prevIsChange = k > 0 && ops[k - 1].kind !== "ctx";
      const nextIsChange = k < ops.length - 1 && ops[k + 1].kind !== "ctx";
      if (prevIsChange || nextIsChange) {
        out.push(`  ${op.text}`);
      }
    } else if (op.kind === "del") {
      out.push(`- ${op.text}`);
    } else {
      out.push(`+ ${op.text}`);
    }
    if (out.length >= maxLines) {
      const remaining = ops.slice(k + 1).filter((o) => o.kind !== "ctx").length;
      if (remaining > 0) {
        out.push(`... (${remaining} more changed line(s) elided)`);
      }
      break;
    }
  }

  return out.join("\n");
}
