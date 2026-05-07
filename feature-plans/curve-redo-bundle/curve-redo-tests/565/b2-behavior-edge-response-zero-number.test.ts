import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects a number 0 response", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })(0);
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
