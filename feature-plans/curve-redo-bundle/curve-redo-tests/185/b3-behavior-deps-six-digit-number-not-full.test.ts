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

test("6-digit '#1234567' is never extracted as the full 1234567 value (regex caps at 5)", () => {
  const parse = getParser();
  const body = "## Dependencies\n\n- #1234567\n";
  const got = nums(parse(body));
  assert.ok(!got.includes(1234567), "7-digit value 1234567 must not be extracted");
  assert.ok(!got.includes(123456), "6-digit value 123456 must not be extracted");
});
