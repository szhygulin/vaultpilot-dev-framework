import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("prepare_marginfi_supply tool literal exists in source", async () => {
  expect(await haveLiteral("prepare_marginfi_supply")).toBe(true);
});

async function haveLiteral(needle: string): Promise<boolean> {
  return walk(path.resolve(__dirname, "..", "src"), needle);
}
async function walk(dir: string, needle: string): Promise<boolean> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (await walk(full, needle)) return true;
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      const t = await fs.readFile(full, "utf8");
      if (t.includes(needle)) return true;
    }
  }
  return false;
}
