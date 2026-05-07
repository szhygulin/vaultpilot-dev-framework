import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("prepare_marginfi_borrow does not surface the upstream buffer-layout TypeError signature", async () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = ["prepareMarginfiBorrow", "handlePrepareMarginfiBorrow", "prepare_marginfi_borrow"];
  const handlerKey = candidates.find((k) => typeof mod[k] === "function");
  expect(handlerKey).toBeDefined();
  const handler = mod[handlerKey!] as (args: Record<string, unknown>) => Promise<unknown> | unknown;
  let result: unknown;
  let err: unknown = null;
  try {
    result = await handler({ symbol: "USDT", amount: "1" });
  } catch (e) {
    err = e;
  }
  const text = JSON.stringify({ result, err: err instanceof Error ? err.message : err });
  expect(/Cannot read properties of null \(reading 'property'\)/.test(text)).toBe(false);
  expect(/Union\.decode/.test(text)).toBe(false);
});
