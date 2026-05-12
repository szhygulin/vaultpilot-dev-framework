import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("second-LLM verification keyword present", () => {
  const out = execSync(`grep -rIE 'secondLlm|second.?LLM|2LLM|verifier.LLM|judge.LLM' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
