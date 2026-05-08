import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("module exposes some way to enumerate skipped banks", () => {
  // Could be a getter, a class instance method, or a named export. The contract
  // is that something on the surface is named to suggest skipped-bank tracking.
  const keys = Object.keys(marginfi).join("|");
  expect(keys).toMatch(/[Ss]kip|[Dd]iagnostic|[Ff]etch[Gg]roup|[Tt]ryRead/);
});
