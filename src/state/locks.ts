import { promises as fs } from "node:fs";
import path from "node:path";

const ACQUIRE_TIMEOUT_MS = 5_000;
const RETRY_INTERVAL_MS = 50;

export class FileLock {
  private readonly lockPath: string;
  private acquired = false;

  constructor(filePath: string) {
    this.lockPath = `${filePath}.lock`;
  }

  async acquire(): Promise<void> {
    const start = Date.now();
    while (true) {
      try {
        const handle = await fs.open(this.lockPath, "wx");
        await handle.writeFile(String(process.pid));
        await handle.close();
        this.acquired = true;
        return;
      } catch (err: unknown) {
        if (!isENoEntOrEExist(err)) throw err;
        if (Date.now() - start > ACQUIRE_TIMEOUT_MS) {
          const stale = await this.staleHolder();
          if (stale) {
            await fs.rm(this.lockPath, { force: true });
            continue;
          }
          throw new Error(`Timeout acquiring ${this.lockPath}`);
        }
        await sleep(RETRY_INTERVAL_MS);
      }
    }
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    await fs.rm(this.lockPath, { force: true });
    this.acquired = false;
  }

  private async staleHolder(): Promise<boolean> {
    try {
      const pidStr = await fs.readFile(this.lockPath, "utf-8");
      const pid = Number(pidStr.trim());
      if (!Number.isInteger(pid) || pid <= 0) return true;
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }
}

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await ensureDir(path.dirname(filePath));
  const lock = new FileLock(filePath);
  await lock.acquire();
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isENoEntOrEExist(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "EEXIST" || code === "ENOENT";
}
