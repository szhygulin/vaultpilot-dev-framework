import { promises as fs } from "node:fs";
import path from "node:path";
import type { Cell, Decision } from "./types.js";

/**
 * Locate the LAST top-level JSON object in a spawn log. Logs end with a
 * `{"envelope": ...}` block once a research agent finishes a cell; everything
 * before is npm/spawn chatter we don't care about.
 */
export function extractEnvelope(text: string): unknown | null {
  for (const anchor of ["\n{\n", "{\n"]) {
    let idx = text.lastIndexOf(anchor);
    while (idx >= 0) {
      const candidate = text.slice(idx).trimStart();
      try {
        // raw_decode equivalent: parse a prefix and ignore trailing junk
        const obj = JSON.parse(candidate);
        return obj;
      } catch {
        // try a shorter prefix ending at the next `\n}`
        const end = text.lastIndexOf("\n}", idx === 0 ? text.length : -1);
        if (end > idx) {
          try {
            return JSON.parse(text.slice(idx, end + 2));
          } catch {
            /* fall through */
          }
        }
      }
      idx = text.lastIndexOf(anchor, idx - 1);
    }
  }
  return null;
}

interface ParsedLogPayload {
  envelope?: { decision?: string; reason?: string };
  costUsd?: number;
  durationMs?: number;
  isError?: boolean;
  errorReason?: string;
}

/**
 * Read a single spawn log and produce a Cell, or null if the log doesn't
 * contain a parseable envelope (e.g. spawn-stub failures from worktree races).
 */
export async function aggregateLog(opts: {
  logPath: string;
  agentId: string;
  agentSizeBytes: number;
  issueId: number;
}): Promise<Cell | null> {
  const text = await fs.readFile(opts.logPath, "utf8");
  const obj = extractEnvelope(text) as ParsedLogPayload | null;
  if (!obj || !obj.envelope) return null;
  const env = obj.envelope;
  const decision = (env.decision ?? null) as Decision | null;
  return {
    agentId: opts.agentId,
    agentSizeBytes: opts.agentSizeBytes,
    issueId: opts.issueId,
    decision,
    reason: env.reason ?? null,
    costUsd: obj.costUsd ?? 0,
    durationMs: obj.durationMs ?? 0,
    isError: obj.isError ?? decision === "error",
    errorReason: obj.errorReason ?? null,
    log: opts.logPath,
  };
}

/**
 * Walk a logs directory and produce a Cell per matching `<prefix><agent>-<issue>.log`.
 * Sizes are looked up from the agent→size map. Logs that don't match the
 * filename pattern or don't contain a parseable envelope are silently skipped.
 */
export async function aggregateLogsDir(opts: {
  logsDir: string;
  prefix: string;
  agentSizes: Map<string, number>;
}): Promise<Cell[]> {
  const files = await fs.readdir(opts.logsDir);
  const re = new RegExp(`^${opts.prefix}(agent-[a-z0-9-]+)-(\\d+)\\.log$`);
  const cells: Cell[] = [];
  for (const f of files.sort()) {
    const m = re.exec(f);
    if (!m) continue;
    const agentId = m[1];
    const issueId = Number(m[2]);
    const size = opts.agentSizes.get(agentId);
    if (size == null) continue;
    const cell = await aggregateLog({
      logPath: path.join(opts.logsDir, f),
      agentId,
      agentSizeBytes: size,
      issueId,
    });
    if (cell) cells.push(cell);
  }
  return cells;
}
