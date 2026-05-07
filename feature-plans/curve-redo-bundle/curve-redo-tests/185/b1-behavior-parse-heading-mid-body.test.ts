import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref under heading positioned mid-body", () => {
  const body = `# Issue title

Long preamble paragraph describing the problem.

## Background

Some context.

## Dependencies

- #178 — Phase 1

## Implementation plan

Steps:
1. Do the thing
`;
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
