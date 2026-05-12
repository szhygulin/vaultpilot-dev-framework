// Ensure the file remains a valid TS module — no obvious syntax breakage
// from the small edit. Vitest will refuse to load it if syntax errors.
import { test, expect } from "vitest";

test("curve/actions module loads without import-time error", async () => {
  const mod: any = await import("../src/modules/curve/actions.js");
  expect(mod).toBeDefined();
});
