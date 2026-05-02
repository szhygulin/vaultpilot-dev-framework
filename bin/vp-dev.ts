#!/usr/bin/env node
import { assertDistFresh } from "../src/distFreshness.js";
import { buildCli } from "../src/cli.js";

async function main(): Promise<void> {
  await assertDistFresh();
  const program = buildCli();
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
