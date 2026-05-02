#!/usr/bin/env node
import { ensureFreshDist } from "../src/preflight.js";

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
