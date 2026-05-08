import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects response where data_source is explicitly null", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({ data_source: null });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
