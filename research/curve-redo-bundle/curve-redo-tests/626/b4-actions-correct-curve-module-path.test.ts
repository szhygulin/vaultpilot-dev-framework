import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

test("src/modules/curve/actions.ts file exists at canonical path", () => {
  const path = resolve(process.cwd(), "src/modules/curve/actions.ts");
  expect(existsSync(path)).toBe(true);
});
