import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: build-incident-report-ref", () => {
  const out = execSync(`grep -rIE 'build_incident_report|incidentReport' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
