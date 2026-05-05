import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { resolveRenderMode, watchStatus, type WatcherTick } from "./statusWatcher.js";

class CollectStream extends Writable {
  chunks: string[] = [];
  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
    cb();
  }
  get text(): string {
    return this.chunks.join("");
  }
}

function ticker(plan: WatcherTick[]): () => Promise<WatcherTick> {
  let i = 0;
  return async () => {
    const t = plan[Math.min(i, plan.length - 1)];
    i += 1;
    return t;
  };
}

const noopSleep = async (): Promise<void> => {};

test("watchStatus: stream-text mode appends separator each tick and exits on done", async () => {
  const out = new CollectStream();
  const fixedNow = () => new Date("2026-05-05T13:00:00Z");
  const result = await watchStatus({
    tickFn: ticker([
      { done: false, output: "snapshot A\n" },
      { done: false, output: "snapshot B\n" },
      { done: true, output: "snapshot C\n" },
    ]),
    intervalMs: 10,
    mode: "stream-text",
    out,
    sleep: noopSleep,
    now: fixedNow,
  });

  assert.equal(result.iterations, 3);
  assert.equal(result.reason, "complete");
  // All three snapshots present in chronological order
  const idxA = out.text.indexOf("snapshot A");
  const idxB = out.text.indexOf("snapshot B");
  const idxC = out.text.indexOf("snapshot C");
  assert.ok(idxA >= 0 && idxB > idxA && idxC > idxB, "snapshots ordered chronologically");
  // Separator format: "--- tick N <iso> ---"
  assert.match(out.text, /--- tick 1 2026-05-05T13:00:00\.000Z ---/);
  assert.match(out.text, /--- tick 3 2026-05-05T13:00:00\.000Z ---/);
  // Stream-text never emits clear-and-home
  assert.equal(out.text.includes("\x1b[2J"), false);
});

test("watchStatus: tty-text mode emits clear-and-home each tick, no separator", async () => {
  const out = new CollectStream();
  const result = await watchStatus({
    tickFn: ticker([
      { done: false, output: "snap1\n" },
      { done: true, output: "snap2\n" },
    ]),
    intervalMs: 10,
    mode: "tty-text",
    out,
    sleep: noopSleep,
  });

  assert.equal(result.iterations, 2);
  // Two clear-and-home sequences (one per tick)
  const clears = (out.text.match(/\x1b\[2J\x1b\[H/g) ?? []).length;
  assert.equal(clears, 2);
  // No "--- tick" separators in TTY mode
  assert.equal(out.text.includes("--- tick"), false);
});

test("watchStatus: json mode emits NDJSON, one object per line, no clear/separator", async () => {
  const out = new CollectStream();
  const result = await watchStatus({
    tickFn: ticker([
      { done: false, output: '{"tick":1}' },
      { done: false, output: '{"tick":2}' },
      { done: true, output: '{"tick":3}' },
    ]),
    intervalMs: 10,
    mode: "json",
    out,
    sleep: noopSleep,
  });

  assert.equal(result.iterations, 3);
  // Each line is parseable JSON; exactly 3 lines
  const lines = out.text.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
  assert.deepEqual(JSON.parse(lines[0]), { tick: 1 });
  assert.deepEqual(JSON.parse(lines[2]), { tick: 3 });
  // No clear-and-home, no separator
  assert.equal(out.text.includes("\x1b[2J"), false);
  assert.equal(out.text.includes("--- tick"), false);
});

test("watchStatus: max-iterations halts before run completes", async () => {
  const out = new CollectStream();
  const result = await watchStatus({
    tickFn: ticker([
      { done: false, output: "x\n" },
      { done: false, output: "x\n" },
      { done: false, output: "x\n" },
      { done: false, output: "x\n" },
    ]),
    intervalMs: 10,
    mode: "tty-text",
    maxIterations: 2,
    out,
    sleep: noopSleep,
  });

  assert.equal(result.reason, "max-iterations");
  assert.equal(result.iterations, 2);
});

test("watchStatus: aborted signal exits after current tick renders", async () => {
  const out = new CollectStream();
  const ac = new AbortController();
  // Sleep cancels on abort
  const cancelableSleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });

  const tickFn = async (): Promise<WatcherTick> => {
    // Trip the signal during the first tick — subsequent sleep should
    // resolve immediately and the loop should exit "aborted" before
    // a second render.
    if (!ac.signal.aborted) ac.abort();
    return { done: false, output: "x\n" };
  };

  const result = await watchStatus({
    tickFn,
    intervalMs: 1,
    mode: "tty-text",
    signal: ac.signal,
    out,
    sleep: cancelableSleep,
  });

  assert.equal(result.reason, "aborted");
  assert.equal(result.iterations, 1);
});

test("watchStatus: aborted before first tick renders nothing", async () => {
  const out = new CollectStream();
  const ac = new AbortController();
  ac.abort();

  const result = await watchStatus({
    tickFn: async () => ({ done: false, output: "should not render\n" }),
    intervalMs: 10,
    mode: "tty-text",
    signal: ac.signal,
    out,
    sleep: noopSleep,
  });

  assert.equal(result.reason, "aborted");
  assert.equal(result.iterations, 0);
  assert.equal(out.text, "");
});

test("watchStatus: stream-text leading separator has no preceding blank line", async () => {
  const out = new CollectStream();
  const result = await watchStatus({
    tickFn: ticker([{ done: true, output: "x\n" }]),
    intervalMs: 10,
    mode: "stream-text",
    out,
    sleep: noopSleep,
    now: () => new Date("2026-05-05T13:00:00Z"),
  });

  assert.equal(result.reason, "complete");
  assert.ok(out.text.startsWith("--- tick 1"), "first separator on first byte");
});

test("watchStatus: tick output without trailing newline still renders cleanly", async () => {
  const out = new CollectStream();
  await watchStatus({
    tickFn: ticker([{ done: true, output: "no-trailing-newline" }]),
    intervalMs: 10,
    mode: "tty-text",
    out,
    sleep: noopSleep,
  });
  assert.ok(out.text.endsWith("no-trailing-newline\n"));
});

test("resolveRenderMode: json wins over isTty", () => {
  assert.equal(resolveRenderMode({ json: true, isTty: true }), "json");
  assert.equal(resolveRenderMode({ json: true, isTty: false }), "json");
});

test("resolveRenderMode: text branches on isTty", () => {
  assert.equal(resolveRenderMode({ json: false, isTty: true }), "tty-text");
  assert.equal(resolveRenderMode({ json: false, isTty: false }), "stream-text");
});
