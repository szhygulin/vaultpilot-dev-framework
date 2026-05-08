// One-shot migration that moves legacy `tags:t1,t2` from sentinel headers
// in `agents/<id>/CLAUDE.md` into the per-agent sidecar
// (`agents/<id>/section-tags.json`). Idempotent — re-running on an
// already-migrated CLAUDE.md is a no-op (the regex finds no `tags:` and the
// sidecar already holds whatever was there).
//
// Strategy: read CLAUDE.md, walk every line; for any sentinel line that
// matches the legacy regex, capture the tags, derive a stable section ID
// from `(runId, issueIds)`, accumulate `{stableId: tags}`, then rewrite
// the line with `tags:...` stripped. After the walk, replace the sidecar
// with the merged accumulator and atomic-rename the rewritten CLAUDE.md.
//
// Holds `withFileLock` on CLAUDE.md throughout so a parallel `appendBlock`
// can't observe a half-rewritten file. The sidecar write goes through its
// own lock per `replaceSectionTags`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { withFileLock } from "../state/locks.js";
import { agentClaudeMdPath, AGENTS_ROOT } from "./specialization.js";
import {
  extractLegacySentinelTags,
  parseSentinelHeader,
} from "../util/sentinels.js";
import { stableIdForHeader, replaceSectionTags, readSectionTags } from "../state/sectionTags.js";

export interface MigrateResult {
  agentId: string;
  /** Number of sentinel lines that carried legacy `tags:`. */
  legacySentinelsFound: number;
  /** Number of distinct stable IDs written to the sidecar. */
  stableIdsWritten: number;
  /** True if CLAUDE.md was rewritten (any legacy `tags:` removed). */
  claudeMdRewritten: boolean;
  /** Pre-migration byte size of CLAUDE.md. */
  bytesBefore: number;
  /** Post-migration byte size of CLAUDE.md. */
  bytesAfter: number;
}

/** Strip ` tags:t1,t2` from a single sentinel line; return the cleaned line. */
export function stripLegacyTagsFromLine(line: string): string {
  // Anchor on the `tags:t1,t2` segment that sits immediately before the
  // closing ` -->`. Only fires on lines that match the sentinel shape.
  const m = line.match(
    /^(<!--\s+run:\S+\s+issue:#\d+(?:\+#\d+)*\s+outcome:[\w-]+\s+ts:\S+?)\s+tags:\S+(\s+-->)$/,
  );
  if (!m) return line;
  return `${m[1]}${m[2]}`;
}

export interface MigrateContentResult {
  rewritten: string;
  /** stable-ID → tag list extracted from legacy sentinels. */
  sidecarEntries: Record<string, string[]>;
  /** Number of sentinel lines that carried legacy `tags:`. */
  legacySentinelsFound: number;
}

/** Pure migration over a CLAUDE.md string. Used directly by tests. */
export function migrateContent(claudeMd: string): MigrateContentResult {
  const lines = claudeMd.split("\n");
  const sidecarEntries: Record<string, string[]> = {};
  let legacySentinelsFound = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tags = extractLegacySentinelTags(line.trim());
    if (tags.length === 0) continue;
    const header = parseSentinelHeader(line.trim());
    if (!header) continue;
    legacySentinelsFound++;
    const id = stableIdForHeader(header);
    sidecarEntries[id] = [...new Set([...(sidecarEntries[id] ?? []), ...tags])].sort();
    lines[i] = stripLegacyTagsFromLine(line);
  }

  return {
    rewritten: lines.join("\n"),
    sidecarEntries,
    legacySentinelsFound,
  };
}

export async function migrateAgentTagsToSidecar(
  agentId: string,
): Promise<MigrateResult> {
  const filePath = agentClaudeMdPath(agentId);

  return withFileLock(filePath, async () => {
    let current: string;
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT") {
        return {
          agentId,
          legacySentinelsFound: 0,
          stableIdsWritten: 0,
          claudeMdRewritten: false,
          bytesBefore: 0,
          bytesAfter: 0,
        };
      }
      throw err;
    }
    const bytesBefore = Buffer.byteLength(current, "utf-8");
    const { rewritten, sidecarEntries, legacySentinelsFound } = migrateContent(current);

    if (legacySentinelsFound === 0) {
      return {
        agentId,
        legacySentinelsFound: 0,
        stableIdsWritten: 0,
        claudeMdRewritten: false,
        bytesBefore,
        bytesAfter: bytesBefore,
      };
    }

    // Merge into the sidecar rather than overwrite — preserves any entries
    // appendBlock has written post-deploy that aren't in the legacy file.
    const sidecar = await readSectionTags(agentId);
    const merged: Record<string, string[]> = { ...sidecar.sections };
    for (const [id, tags] of Object.entries(sidecarEntries)) {
      const combined = new Set([...(merged[id] ?? []), ...tags]);
      merged[id] = [...combined].sort();
    }
    await replaceSectionTags(agentId, merged);

    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, rewritten);
    await fs.rename(tmp, filePath);

    return {
      agentId,
      legacySentinelsFound,
      stableIdsWritten: Object.keys(sidecarEntries).length,
      claudeMdRewritten: true,
      bytesBefore,
      bytesAfter: Buffer.byteLength(rewritten, "utf-8"),
    };
  });
}

/** Walk `agents/` and migrate every directory that has a CLAUDE.md. */
export async function migrateAllAgentsTagsToSidecar(): Promise<MigrateResult[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(AGENTS_ROOT);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ENOENT") return [];
    throw err;
  }
  const results: MigrateResult[] = [];
  for (const name of entries.sort()) {
    const claudePath = path.join(AGENTS_ROOT, name, "CLAUDE.md");
    try {
      await fs.access(claudePath);
    } catch {
      continue;
    }
    results.push(await migrateAgentTagsToSidecar(name));
  }
  return results;
}
