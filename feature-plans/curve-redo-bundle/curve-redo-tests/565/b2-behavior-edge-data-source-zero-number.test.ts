import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects response where data_source is the number 0", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({ data_source: 0 });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
