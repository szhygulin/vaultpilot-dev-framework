// Per-agent section-tags sidecar.
//
// Tags used to live inside the sentinel header of each section in
// `agents/<id>/CLAUDE.md` (`<!-- run:R issue:#N outcome:O ts:T tags:t1,t2 -->`),
// which meant every dispatch loaded ~150 bytes of tag metadata per section
// into the agent's prompt context — pure metadata that the agent never
// reads. This module stores tags out-of-band in `agents/<id>/section-tags.json`
// keyed by the section's stable ID (`deriveStableSectionId(runId, issueIds)`),
// so sentinels stay minimal and tags are visible only to operator tooling.
//
// Concurrency: each write goes through `withFileLock` on the sidecar path,
// independent of the CLAUDE.md lock. `appendBlock` holds both locks (CLAUDE.md
// outer, sidecar inner) so a parallel `pruneTags --confirm` can't observe a
// half-written pair.

import { promises as fs } from "node:fs";
import path from "node:path";
import { withFileLock, ensureDir } from "./locks.js";
import { agentClaudeMdPath } from "../agent/specialization.js";
import { deriveStableSectionId } from "./lessonUtility.js";
import type { SentinelHeader } from "../util/sentinels.js";

export const SECTION_TAGS_FILE_VERSION = 1;

export interface SectionTagsFile {
  version: number;
  sections: Record<string, string[]>;
}

export function sectionTagsPath(agentId: string): string {
  return path.join(path.dirname(agentClaudeMdPath(agentId)), "section-tags.json");
}

export function stableIdForHeader(header: SentinelHeader): string {
  const ids = header.issueIds && header.issueIds.length > 0
    ? header.issueIds
    : [header.issueId];
  return deriveStableSectionId(header.runId, ids);
}

export async function readSectionTags(agentId: string): Promise<SectionTagsFile> {
  const filePath = sectionTagsPath(agentId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SectionTagsFile>;
    if (typeof parsed !== "object" || parsed === null) {
      return { version: SECTION_TAGS_FILE_VERSION, sections: {} };
    }
    return {
      version:
        typeof parsed.version === "number" ? parsed.version : SECTION_TAGS_FILE_VERSION,
      sections:
        parsed.sections && typeof parsed.sections === "object"
          ? (parsed.sections as Record<string, string[]>)
          : {},
    };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ENOENT") {
      return { version: SECTION_TAGS_FILE_VERSION, sections: {} };
    }
    throw err;
  }
}

async function writeSidecarAtomic(
  filePath: string,
  data: SectionTagsFile,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await fs.rename(tmp, filePath);
}

export async function writeSectionTagsEntry(
  agentId: string,
  stableId: string,
  tags: string[],
): Promise<void> {
  const filePath = sectionTagsPath(agentId);
  await withFileLock(filePath, async () => {
    const current = await readSectionTags(agentId);
    current.sections[stableId] = [...new Set(tags)].sort();
    await writeSidecarAtomic(filePath, current);
  });
}

export async function replaceSectionTags(
  agentId: string,
  entries: Record<string, string[]>,
): Promise<void> {
  const filePath = sectionTagsPath(agentId);
  await withFileLock(filePath, async () => {
    const out: SectionTagsFile = {
      version: SECTION_TAGS_FILE_VERSION,
      sections: {},
    };
    for (const [stableId, tags] of Object.entries(entries)) {
      out.sections[stableId] = [...new Set(tags)].sort();
    }
    await writeSidecarAtomic(filePath, out);
  });
}

export async function dropSectionTagsEntries(
  agentId: string,
  stableIds: Iterable<string>,
): Promise<void> {
  const drop = new Set(stableIds);
  if (drop.size === 0) return;
  const filePath = sectionTagsPath(agentId);
  await withFileLock(filePath, async () => {
    const current = await readSectionTags(agentId);
    let changed = false;
    for (const id of drop) {
      if (id in current.sections) {
        delete current.sections[id];
        changed = true;
      }
    }
    if (!changed) return;
    await writeSidecarAtomic(filePath, current);
  });
}

export function tagsByHeaderIndex(
  headers: ReadonlyArray<SentinelHeader>,
  sidecar: SectionTagsFile,
): string[][] {
  return headers.map((h) => sidecar.sections[stableIdForHeader(h)] ?? []);
}
