import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// At runtime this module lives at dist/src/distFreshness.js. Repo root is
// two levels up from that. Compiled bin shim is at dist/bin/vp-dev.js, so
// the same `../..` walk works whether the boot path enters via bin/ or src/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const DIST_ENTRYPOINT = join(REPO_ROOT, "dist", "bin", "vp-dev.js");
const SRC_ROOTS = ["src", "bin"];

async function maxTsMtime(dir: string): Promise<number> {
  let max = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const childMax = await maxTsMtime(p);
      if (childMax > max) max = childMax;
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const stat = await fs.stat(p);
      if (stat.mtimeMs > max) max = stat.mtimeMs;
    }
  }
  return max;
}

async function distEntryMtime(): Promise<number | null> {
  // Use the compiled CLI entry as the dist freshness signal: every full
  // `tsc` build refreshes its mtime. If it's missing we're not running
  // from a buildable checkout (e.g. someone yanked dist/ entirely) — let
  // the normal "module not found" boot error speak for itself.
  try {
    const stat = await fs.stat(DIST_ENTRYPOINT);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Detects when the compiled `dist/` is older than the TypeScript sources
 * under `src/` or `bin/`. If so, exits non-zero with a clear instruction
 * to run `npm run build`.
 *
 * Bug history (issue #39): a stale `dist/src/agent/split.js` shipped a
 * regex (`ts:[^-]+-->`) compiled before commit `d622153` widened it to
 * accept ISO-8601 timestamps with hyphenated date separators. After the
 * src-side fix landed, anyone who pulled but skipped `npm run build` got
 * `vp-dev agents split <id> --json` silently reporting `sectionCount: 0`
 * — no error signal, just empty output. The fail-fast check turns that
 * silent-data-corruption failure mode into a loud diagnostic.
 *
 * Why fail-fast over auto-rebuild: keeps the binary's runtime deps narrow
 * (no tsc spawn from inside vp-dev), avoids re-exec gymnastics, and keeps
 * the failure visible. A one-liner `npm run build` is the right user
 * action — surfacing it is more honest than silently rebuilding.
 *
 * Best-effort: skips silently if the `src/` tree is absent (e.g. running
 * from a packaged install with `dist/` only) or if `dist/bin/vp-dev.js`
 * is missing (the boot would already have failed for another reason).
 */
export async function assertDistFresh(): Promise<void> {
  const distM = await distEntryMtime();
  if (distM === null) return;

  let srcMax = 0;
  for (const root of SRC_ROOTS) {
    const m = await maxTsMtime(join(REPO_ROOT, root));
    if (m > srcMax) srcMax = m;
  }
  if (srcMax === 0) return; // no src/ trees — packaged install, skip.

  if (srcMax > distM) {
    process.stderr.write(
      "ERROR: dist/ is older than src/ — your compiled binary is running stale code.\n" +
        "       Run 'npm run build' (or 'npm run dev' for watch mode) before invoking vp-dev.\n",
    );
    process.exit(1);
  }
}
