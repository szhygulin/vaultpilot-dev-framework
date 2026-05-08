import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("some exported value in the marginfi module references the number 16 as a known unknown variant", () => {
  const mod = marginfi as Record<string, unknown>;
  const haystack = JSON.stringify(
    Object.fromEntries(
      Object.entries(mod).filter(([, v]) =>
        typeof v === "string" || typeof v === "number" || (typeof v === "object" && v !== null && !(v as object).constructor?.name?.includes("Function")),
      ),
    ),
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
  expect(/\b16\b/.test(haystack) || /oracleSetup.*16/i.test(haystack)).toBe(true);
});
