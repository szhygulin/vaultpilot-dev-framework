import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Detect a dev-checkout where `dist/` is older than `src/` (or `bin/`) and
 * rebuild + re-exec before the CLI starts running compiled code.
 *
 * Why: bug #39 — `dist/src/agent/split.js` carried a regex compiled from a
 * pre-fix version of `src/agent/split.ts`. Users who pulled the fix without
 * `npm run build` got `sectionCount: 0` from the splitter with no signal
 * that anything was wrong. The CLI silently used stale code.
 *
 * Strategy: walk `src/` + `bin/` for the newest `.ts` mtime, walk `dist/`
 * for the newest `.js` mtime. If src is newer, run `npm run build` then
 * re-exec node so the in-process import cache is dropped and the fresh dist
 * is loaded. No-ops outside a dev checkout (so the same shim stays safe if
 * vp-dev is ever shipped without `src/`).
 */
export async function ensureFreshDist(): Promise<void> {
  // import.meta.url resolves to dist/src/preflight.js when running compiled.
  // Repo root is two levels up from dirname(here):
  //   dirname = dist/src ; dist/src/.. = dist ; dist/.. = repo root.
  const here = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(here), "..", "..");
  const srcDir = path.join(root, "src");
  const binDir = path.join(root, "bin");
  const distDir = path.join(root, "dist");
  const pkgJson = path.join(root, "package.json");

  // Confirm the dev-checkout shape. If src/ or dist/ or package.json isn't
  // where we expect (e.g. running under tsx, or a packaged distribution),
  // bail rather than guess. Wrong-rooted rebuilds are worse than no check.
  if (!(await exists(srcDir)) || !(await exists(distDir)) || !(await exists(pkgJson))) {
    return;
  }

  const newestSrc = await newestMtime([srcDir, binDir], /\.ts$/);
  const newestDist = await newestMtime([distDir], /\.js$/);
  if (newestSrc === null || newestDist === null) return;
  if (newestSrc <= newestDist) return;

  process.stderr.write(
    `vp-dev: dist/ is older than src/ — rebuilding via 'npm run build' before continuing.\n` +
      `  newest src .ts: ${new Date(newestSrc).toISOString()}\n` +
      `  newest dist .js: ${new Date(newestDist).toISOString()}\n`,
  );

  // Synchronous build so the spawn-then-exec sequence stays tight; user sees
  // tsc output inline. tsc is in devDependencies, so a dev checkout always
  // has it available; we shell through `npm` (cross-platform launcher) rather
  // than calling tsc's binary directly.
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npmCmd, ["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) {
    process.stderr.write(
      "vp-dev: build failed. Run 'npm run build' manually and retry.\n",
    );
    process.exit(build.status ?? 1);
  }

  // Re-exec the same node + script + args. The current process already
  // imported (and cached) stale modules; the only way to pick up the fresh
  // dist is to start a new process.
  const child = spawn(process.argv[0], process.argv.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, VP_DEV_PREFLIGHT_REEXEC: "1" },
  });
  await new Promise<void>((resolve) => {
    child.on("close", (code, signal) => {
      if (signal) {
        // Forward fatal signals (Ctrl-C etc.) — kill ourselves with the same
        // signal so the parent shell sees the exit status it expects.
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
      resolve();
    });
    child.on("error", (err) => {
      process.stderr.write(`vp-dev: re-exec failed: ${err.message}\n`);
      process.exit(1);
    });
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function newestMtime(dirs: string[], match: RegExp): Promise<number | null> {
  let max: number | null = null;
  for (const dir of dirs) {
    await walk(dir, (file, stat) => {
      if (!match.test(file)) return;
      if (max === null || stat.mtimeMs > max) max = stat.mtimeMs;
    });
  }
  return max;
}

async function walk(
  dir: string,
  visit: (file: string, stat: Stats) => void,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip node_modules + dotfiles — they're not source-of-truth for this
      // check and walking node_modules would be very expensive.
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      await walk(full, visit);
    } else if (e.isFile()) {
      try {
        const stat = await fs.stat(full);
        visit(full, stat);
      } catch {
        // ignore unreadable
      }
    }
  }
}
