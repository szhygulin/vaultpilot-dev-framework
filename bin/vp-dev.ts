#!/usr/bin/env node
import { ensureFreshDist } from "../src/preflight.js";
import { ensureNodeModules } from "../src/util/preflightNodeModules.js";

// Bug #264: a tracked-empty `node_modules` placeholder could be silently
// restored by `git checkout` / `git reset --hard`, leaving every subsequent
// vp-dev invocation crashing with `ERR_MODULE_NOT_FOUND: 'commander'` from
// the dynamic cli.js import below. Probe a known runtime dep here so the
// failure mode reduces to a one-line "run npm ci" message + clean exit
// instead of an opaque module-resolution stack trace. (The structural fix
// — untracking the placeholder so .gitignore actually applies — ships in
// the same PR.) Cheap to keep imported (pure stdlib + a require.resolve).
ensureNodeModules();

// Bug #39: stale dist/ silently runs old code. Rebuild + re-exec before any
// further imports so the freshly-compiled module graph is what actually
// services the CLI invocation. Skipped on the re-exec leg via the env flag
// to prevent a rebuild loop if mtime comparison is borderline.
if (!process.env.VP_DEV_PREFLIGHT_REEXEC) {
  await ensureFreshDist();
}

const { buildCli } = await import("../src/cli.js");
const program = buildCli();
program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
