// Shared utility calibration anchor — the 0.0–1.0 scale that grounds both
// (a) write-time `predictedUtility` self-rating in `summarizer.ts` (PR #193),
// and (b) audit-time `intrinsicUtility` scoring in `auditLessons.ts`. Both
// paths must use the same scale so scores remain comparable.
//
// If we ever tune the bands, update them HERE — both write-time and
// audit-time prompts pick up the change without drift.

export const UTILITY_CALIBRATION_ANCHOR = `0.0–0.2: restates an existing rule; generic platitude ("verify before merging"); applies-to-everything; adds little beyond rules already in the file.
0.3–0.5: useful but partially redundant or could be inferred from existing sections; modest sharpening of an already-known principle.
0.6–0.8: introduces a specific rule with a named failure mode the agent has hit before or would hit again; cites concrete files / tools / protocols.
0.9–1.0: names a specific past incident (date / PR / file path / function name) with a concrete failure mode the agent would otherwise repeat; high-leverage rule with narrow tells.`;

/**
 * The four band labels keyed by the `[low, high]` boundary, useful for
 * tests asserting all bands appear and for any future programmatic mapping
 * (e.g., colorizing CLI output by band).
 */
export const UTILITY_CALIBRATION_BANDS: ReadonlyArray<{
  low: number;
  high: number;
  label: string;
}> = [
  { low: 0.0, high: 0.2, label: "platitude" },
  { low: 0.3, high: 0.5, label: "borderline" },
  { low: 0.6, high: 0.8, label: "specific" },
  { low: 0.9, high: 1.0, label: "past-incident-anchored" },
];

/**
 * Render the calibration anchor with each line indented by `indent` spaces.
 * Used by prompts that nest the anchor inside a bulleted list (the
 * summarizer wraps each band line with "  - ", the audit prompt uses none).
 */
export function indentCalibration(indent: string): string {
  return UTILITY_CALIBRATION_ANCHOR.split("\n")
    .map((line) => indent + line)
    .join("\n");
}
