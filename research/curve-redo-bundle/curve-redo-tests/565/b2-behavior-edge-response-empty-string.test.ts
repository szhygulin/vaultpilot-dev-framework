import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects an empty-string response", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })("");
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
