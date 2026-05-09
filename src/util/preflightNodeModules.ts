/**
 * Issue #264: detect a missing/empty `node_modules` BEFORE the bin shim
 * dynamically imports `../src/cli.js` (which immediately imports
 * `commander`). When `node_modules` has been wiped — most reliably reproduced
 * after a `git checkout` / `git reset --hard` accidentally restoring a
 * tracked-empty placeholder — every subsequent `vp-dev <subcommand>` invocation
 * crashes with a `ERR_MODULE_NOT_FOUND: 'commander' from dist/src/cli.js` stack
 * trace. The trace is technically accurate but unhelpful: the operator's next
 * action is `npm ci`, and the stack does not say so.
 *
 * Strategy: pick a small, always-imported runtime dependency (`commander`),
 * try to resolve it from the bin shim's directory, and on miss surface a
 * one-line "run `npm ci`" message + clean non-zero exit. Keeps the failure
 * mode self-explanatory without changing the build / dispatch semantics.
 *
 * Defense in depth, not a fix for the wipe itself. The structural fix
 * — untracking `node_modules` so it can no longer be silently restored to
 * a tracked-empty state — ships in the same PR.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export interface PreflightNodeModulesDeps {
  resolveProbe?: (spec: string) => string | null;
  write?: (s: string) => void;
  exit?: (code: number) => never;
}

export type PreflightNodeModulesResult = { ok: true } | { ok: false; reason: string };

/** The probe dependency. `commander` is the first npm package the CLI imports
 * (via `src/cli.ts`), so its presence is a sufficient proxy for "node_modules
 * is populated enough for vp-dev to start." Use the bare package name (the
 * main entry) — `commander/package.json` is not in commander's `exports` map
 * and would always fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` even when
 * commander is correctly installed. */
export const PROBE_PACKAGE = "commander";

export function ensureNodeModules(deps: PreflightNodeModulesDeps = {}): PreflightNodeModulesResult {
  const resolve = deps.resolveProbe ?? defaultResolveProbe;
  const write = deps.write ?? ((s) => process.stderr.write(s));
  const exit = deps.exit ?? ((c) => process.exit(c) as never);

  const resolved = resolve(PROBE_PACKAGE);
  if (resolved !== null) return { ok: true };

  const reason =
    `vp-dev: dependencies missing — could not resolve '${PROBE_PACKAGE}' from node_modules.\n` +
    `  Run 'npm ci' from the repo root to install dependencies, then re-run vp-dev.\n` +
    `  (See issue #264: a tracked-empty node_modules placeholder could be restored by\n` +
    `   'git checkout' / 'git reset --hard'; this PR also untracks the placeholder.)\n`;
  write(reason);
  exit(1);
  return { ok: false, reason };
}

function defaultResolveProbe(spec: string): string | null {
  try {
    // Anchor resolution at this module's directory so the probe walks the
    // same node_modules chain that the dynamic `import("../src/cli.js")`
    // would walk a moment later. createRequire on import.meta.url gives a
    // local resolver attached to dist/src/util/preflightNodeModules.js.
    const here = fileURLToPath(import.meta.url);
    const req = createRequire(here);
    return req.resolve(spec);
  } catch {
    return null;
  }
}
