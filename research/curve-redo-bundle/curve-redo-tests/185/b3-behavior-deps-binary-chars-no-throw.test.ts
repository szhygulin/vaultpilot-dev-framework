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

test("body with NUL/control chars does not throw", () => {
  const parse = getParser();
  const body = "## Dependencies\n\n- #100\n\u0000\u0007\u001b binary noise here\n";
  assert.doesNotThrow(() => parse(body));
});
