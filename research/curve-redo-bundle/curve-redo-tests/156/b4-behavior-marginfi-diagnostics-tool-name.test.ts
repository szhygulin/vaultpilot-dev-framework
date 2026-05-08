import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("the literal tool name 'get_marginfi_diagnostics' appears in src/", async () => {
  const root = path.resolve(__dirname, "..", "src");
  const seen = await search(root, /get_marginfi_diagnostics/);
  expect(seen).toBe(true);
});

async function search(dir: string, re: RegExp): Promise<boolean> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (await search(full, re)) return true;
    } else if (e.isFile() && /\.(ts|tsx|js|mjs)$/.test(e.name)) {
      const text = await fs.readFile(full, "utf8");
      if (re.test(text)) return true;
    }
  }
  return false;
}
