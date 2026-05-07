import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("postinstall script is non-empty and runs patch-package as the (or a) command", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const post: string = pkg.scripts?.postinstall ?? "";
  expect(post.length).toBeGreaterThan(0);
  // Must invoke patch-package as a standalone command (not just mention it in a comment).
  // Accept either bare `patch-package` or `npx patch-package`.
  expect(/(^|[\s&;|])(npx\s+)?patch-package(\s|$)/.test(post)).toBe(true);
});
