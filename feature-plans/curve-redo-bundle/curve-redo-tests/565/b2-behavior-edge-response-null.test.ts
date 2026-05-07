import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects a null response value", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })(null);
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
