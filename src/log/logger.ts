import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";
import { ensureDir } from "../state/locks.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  ts: string;
  event: string;
  [key: string]: unknown;
}

export class Logger {
  private stream: WriteStream | null = null;
  private readonly logPath: string;
  private readonly verbose: boolean;

  constructor(opts: { runId: string; verbose: boolean; logsDir?: string }) {
    const dir = opts.logsDir ?? path.resolve(process.cwd(), "logs");
    this.logPath = path.join(dir, `${opts.runId}.jsonl`);
    this.verbose = opts.verbose;
  }

  async open(): Promise<void> {
    await ensureDir(path.dirname(this.logPath));
    this.stream = createWriteStream(this.logPath, { flags: "a" });
  }

  log(event: string, data: Record<string, unknown> = {}): void {
    const line: LogEvent = { ts: new Date().toISOString(), event, ...data };
    const json = JSON.stringify(line);
    if (this.stream) this.stream.write(json + "\n");
    if (this.verbose) {
      const tag = colorize(event);
      const summary = formatVerbose(line);
      process.stderr.write(`${tag} ${summary}\n`);
    }
  }

  info(event: string, data: Record<string, unknown> = {}): void {
    this.log(event, data);
  }

  warn(event: string, data: Record<string, unknown> = {}): void {
    this.log(`warn.${event}`, data);
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.log(`error.${event}`, data);
  }

  async close(): Promise<void> {
    if (!this.stream) return;
    await new Promise<void>((resolve) => this.stream?.end(resolve));
    this.stream = null;
  }

  filePath(): string {
    return this.logPath;
  }
}

const COLORS: Record<string, string> = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function colorize(event: string): string {
  if (event.startsWith("error")) return `${COLORS.red}[${event}]${COLORS.reset}`;
  if (event.startsWith("warn")) return `${COLORS.yellow}[${event}]${COLORS.reset}`;
  if (event.startsWith("agent.completed")) return `${COLORS.green}[${event}]${COLORS.reset}`;
  if (event.startsWith("agent")) return `${COLORS.cyan}[${event}]${COLORS.reset}`;
  if (event.startsWith("tick")) return `${COLORS.magenta}[${event}]${COLORS.reset}`;
  return `${COLORS.dim}[${event}]${COLORS.reset}`;
}

function formatVerbose(line: LogEvent): string {
  const { ts, event, ...rest } = line;
  void ts;
  void event;
  const keys = Object.keys(rest);
  if (keys.length === 0) return "";
  const compact = keys
    .map((k) => `${k}=${truncateValue(rest[k])}`)
    .join(" ");
  return compact;
}

function truncateValue(v: unknown): string {
  if (v == null) return String(v);
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 200 ? s.slice(0, 197) + "..." : s;
}
