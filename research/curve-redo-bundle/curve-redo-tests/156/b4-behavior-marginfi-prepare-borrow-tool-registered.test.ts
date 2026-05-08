import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("prepare_marginfi_borrow tool literal exists in source", async () => {
  expect(await contains("prepare_marginfi_borrow")).toBe(true);
});

async function contains(s: string): Promise<boolean> {
  return walk(path.resolve(__dirname, "..", "src"), s);
}
async function walk(dir: string, s: string): Promise<boolean> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (await walk(full, s)) return true;
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      const t = await fs.readFile(full, "utf8");
      if (t.includes(s)) return true;
    }
  }
  return false;
}
