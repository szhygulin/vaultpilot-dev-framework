import type { IssueRangeSpec } from "../types.js";

export function parseRangeSpec(input: string): IssueRangeSpec {
  const trimmed = input.trim();
  if (trimmed === "all-open") return { kind: "all-open" };

  if (trimmed.includes(",")) {
    const ids = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(parsePositiveInt);
    return { kind: "csv", ids };
  }

  if (trimmed.includes("-")) {
    const [fromStr, toStr] = trimmed.split("-");
    const from = parsePositiveInt(fromStr);
    const to = parsePositiveInt(toStr);
    if (to < from) throw new Error(`Invalid range "${input}": to (${to}) < from (${from})`);
    return { kind: "range", from, to };
  }

  return { kind: "csv", ids: [parsePositiveInt(trimmed)] };
}

function parsePositiveInt(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Not a positive integer: "${s}"`);
  return n;
}

export function describeRange(spec: IssueRangeSpec): string {
  switch (spec.kind) {
    case "range":
      return `${spec.from}-${spec.to}`;
    case "csv":
      return spec.ids.join(",");
    case "all-open":
      return "all-open";
  }
}
