import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue's central claim is that variant 15 has been observed and is now
 * tracked. Some exported constant or helper must reference variant 15 so
 * downstream tests, fixtures, and error messages can pivot off it.
 */
test("some exported value in the marginfi module references the number 15 as a known unknown variant", () => {
  const mod = marginfi as Record<string, unknown>;
  const haystack = JSON.stringify(
    Object.fromEntries(
      Object.entries(mod).filter(([, v]) =>
        typeof v === "string" || typeof v === "number" || (typeof v === "object" && v !== null && !(v as object).constructor?.name?.includes("Function")),
      ),
    ),
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
  // Either an explicit `15` token in some constant, or `oracleSetup` enumeration mentioning 15.
  expect(/\b15\b/.test(haystack) || /oracleSetup.*15/i.test(haystack)).toBe(true);
});
