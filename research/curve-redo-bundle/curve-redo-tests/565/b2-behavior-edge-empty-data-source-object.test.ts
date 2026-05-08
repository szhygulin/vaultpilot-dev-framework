import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects response whose data_source is an empty object", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({ data_source: {} });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
