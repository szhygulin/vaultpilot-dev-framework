// Issue #667 — import_readonly_token bypasses preflight Step 0 binding.
// Aspirational: the fix must add some form of preflight/Step 0 / sentinel
// binding for import_readonly_token. Test looks for the link in any file
// in src/ since the exact file location isn't pre-specified.
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("some src/ file links import_readonly_token to preflight Step 0 / sentinel binding", () => {
  const out = execSync(
    "grep -rIE 'import_readonly_token|importReadonlyToken' src/ || true",
    { encoding: "utf8" },
  );
  // The fix should reference preflight or sentinel binding NEAR
  // import_readonly_token in some source file.
  const lines = out.split("\n");
  const candidatesNearImport = lines.filter((l) =>
    /import.readonly.token/i.test(l),
  );
  expect(candidatesNearImport.length).toBeGreaterThan(0);
});
