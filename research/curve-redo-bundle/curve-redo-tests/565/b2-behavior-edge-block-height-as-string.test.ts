import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects data_source where block_height is a string instead of a number", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({
      data_source: { provider: "alchemy", block_height: "100" as unknown as number, signature: "0xsig" },
    });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
