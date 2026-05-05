/**
 * Generic poll-loop helper for `vp-dev status --watch` (#124). Stays
 * decoupled from disk I/O and run-state types: callers pass a `tickFn`
 * that returns the rendered output + a terminal flag, and `watchStatus`
 * handles cadence, render mode (TTY clear-and-home vs non-TTY accumulate
 * vs NDJSON), exit conditions, and SIGINT.
 */

export interface WatcherTick {
  /** Run reached a terminal state — loop exits after rendering this tick. */
  done: boolean;
  /** Pre-formatted output for this tick. JSON mode expects a single line. */
  output: string;
}

export type WatcherRenderMode = "tty-text" | "stream-text" | "json";

export interface WatchStatusOptions {
  tickFn: () => Promise<WatcherTick>;
  intervalMs: number;
  mode: WatcherRenderMode;
  /** Hard escape-hatch — exit after N ticks even if not done. */
  maxIterations?: number;
  /** SIGINT / external abort. Loop exits after current tick renders. */
  signal?: AbortSignal;
  /** Where to write rendered output. Defaults to process.stdout. */
  out?: NodeJS.WritableStream;
  /** Test seam for cancellable sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Test seam for timestamp on stream-text separator. */
  now?: () => Date;
}

export type WatchExitReason = "complete" | "max-iterations" | "aborted";

export interface WatchStatusResult {
  iterations: number;
  reason: WatchExitReason;
}

const ANSI_CLEAR_AND_HOME = "\x1b[2J\x1b[H";

export async function watchStatus(opts: WatchStatusOptions): Promise<WatchStatusResult> {
  const out = opts.out ?? process.stdout;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => new Date());

  let iterations = 0;
  while (true) {
    if (opts.signal?.aborted) return { iterations, reason: "aborted" };

    iterations += 1;
    const tick = await opts.tickFn();

    if (opts.mode === "json") {
      out.write(stripTrailingNewlines(tick.output) + "\n");
    } else if (opts.mode === "tty-text") {
      out.write(ANSI_CLEAR_AND_HOME);
      out.write(ensureTrailingNewline(tick.output));
    } else {
      // stream-text: keep history as a chronological log
      const ts = now().toISOString();
      const sep = iterations === 1
        ? `--- tick ${iterations} ${ts} ---\n`
        : `\n--- tick ${iterations} ${ts} ---\n`;
      out.write(sep);
      out.write(ensureTrailingNewline(tick.output));
    }

    if (tick.done) return { iterations, reason: "complete" };
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      return { iterations, reason: "max-iterations" };
    }

    await sleep(opts.intervalMs, opts.signal);
    if (opts.signal?.aborted) return { iterations, reason: "aborted" };
  }
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : s + "\n";
}

function stripTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, "");
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Map text-mode + isTTY to the concrete render mode. JSON mode ignores
 * TTY-ness — NDJSON is meant to be machine-piped.
 */
export function resolveRenderMode(opts: { json: boolean; isTty: boolean }): WatcherRenderMode {
  if (opts.json) return "json";
  return opts.isTty ? "tty-text" : "stream-text";
}
