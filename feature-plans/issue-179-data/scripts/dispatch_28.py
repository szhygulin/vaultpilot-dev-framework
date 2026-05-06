#!/usr/bin/env python3
"""Dispatch 28 (dev-agent, issue) cells against vaultpilot-mcp-smoke-test.
Concurrency: 4 research agents at most; one research agent per dev-agent at a time
(dev-agent's dedicated clone protected from worktree races).
"""
import os, subprocess, threading, time, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path("/Users/s/dev/vaultpilot/vaultpilot-development-agents")
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# 28 cells: 8×#50 + 10×#52 + 10×#54
CELLS = []
for ag in [f"agent-918{n}" for n in range(2, 10)]:  # 9182..9189
    CELLS.append((ag, 50))
for ag in [f"agent-918{n}" for n in range(0, 10)]:
    CELLS.append((ag, 52))
for ag in [f"agent-918{n}" for n in range(0, 10)]:
    CELLS.append((ag, 54))

assert len(CELLS) == 28, f"expected 28, got {len(CELLS)}"

# Per dev-agent lock: ensures one research agent per dev-agent at a time.
# Combined with a 4-worker pool, gives 4-way parallelism with per-agent serialization.
agent_locks = {ag: threading.Lock() for ag, _ in CELLS}

def clone_path(agent_id: str) -> str:
    n = int(agent_id[-1])  # 9180 → 0 → clone-1
    return f"/tmp/study-clones/clone-{n + 1}"

def run_cell(agent: str, issue: int) -> str:
    with agent_locks[agent]:
        path = clone_path(agent)
        log = LOG_DIR / f"smoke10-{agent}-{issue}.log"
        ts = time.strftime("%H:%M:%S")
        msg = f"[{ts}] {agent} #{issue} start (clone={path})"
        print(msg, flush=True)
        cmd = [
            "npm", "run", "vp-dev", "--", "spawn",
            "--agent", agent,
            "--issue", str(issue),
            "--target-repo", "szhygulin/vaultpilot-mcp-smoke-test",
            "--target-repo-path", path,
            "--dry-run", "--skip-summary",
        ]
        with open(log, "w") as f:
            rc = subprocess.run(cmd, cwd=str(REPO_ROOT), stdout=f, stderr=subprocess.STDOUT).returncode
        ts = time.strftime("%H:%M:%S")
        result = f"[{ts}] {agent} #{issue} done (rc={rc}, log={log.name})"
        print(result, flush=True)
        return result

def main():
    print(f"Dispatching {len(CELLS)} cells, max 4 concurrent, per-agent mutex.")
    print(f"Cells:")
    for ag, iss in CELLS:
        print(f"  {ag} #{iss}")
    print()
    start = time.time()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(run_cell, ag, iss) for ag, iss in CELLS]
        for f in futures:
            f.result()
    elapsed = time.time() - start
    print(f"\nAll {len(CELLS)} cells done in {elapsed:.0f}s ({elapsed/60:.1f}min)")

if __name__ == "__main__":
    main()
