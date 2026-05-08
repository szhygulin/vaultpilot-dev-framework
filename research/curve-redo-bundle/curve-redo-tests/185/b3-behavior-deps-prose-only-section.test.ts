import { test } from "node:test";
import assert from "node:assert/strict";
import * as depsModule from "./dependencies.js";

const PARSER_NAMES = ["parseDependencies","extractDependencies","parseDependencyRefs","extractDependencyRefs","findDependencies","parseDependencyBlock","parseDeps"];

function getParser(): (body: string) => unknown {
  for (const name of PARSER_NAMES) {
    const fn = (depsModule as Record<string, unknown>)[name];
    if (typeof fn === "function") return fn as (body: string) => unknown;
  }
  throw new Error("No parser export. Available: " + Object.keys(depsModule).join(", "));
}

function nums(refs: unknown): number[] {
  let arr: unknown = refs;
  if (refs instanceof Set) arr = Array.from(refs);
  else if (refs && typeof refs === "object" && !Array.isArray(refs)) {
    const obj = refs as Record<string, unknown>;
    arr = obj.refs ?? obj.dependencies ?? obj.deps ?? obj.issues ?? [];
    if (arr instanceof Set) arr = Array.from(arr);
  }
  if (!Array.isArray(arr)) return [];
  const out: number[] = [];
  for (const r of arr as unknown[]) {
    if (typeof r === "number") out.push(r);
    else if (r && typeof r === "object") {
      const obj = r as Record<string, unknown>;
      const n = obj.issue ?? obj.number ?? obj.id ?? obj.num;
      if (typeof n === "number") out.push(n);
    }
  }
  return out;
}

test("'## Dependencies' with only prose (no #refs) yields no refs", () => {
  const parse = getParser();
  const body = "## Dependencies\n\nWaiting on the parser fix to land before this can proceed.\n";
  assert.deepEqual(nums(parse(body)), []);
});
