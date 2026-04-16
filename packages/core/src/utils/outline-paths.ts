/**
 * Phase 5 (v13) path resolution — prefer the new prose outline files, fall
 * back to legacy paths so older books keep working during transition.
 *
 * Maps:
 *   story/outline/story_frame.md  →  preferred replacement for story_bible.md
 *   story/outline/volume_map.md   →  preferred replacement for volume_outline.md
 *   story/roles/主要角色/*.md +
 *   story/roles/次要角色/*.md    →  preferred replacement for character_matrix.md
 *
 * All helpers accept a bookDir (path to a book root, containing `story/`)
 * and return a string — either the new-file content when it exists, or the
 * legacy file content, or an empty default placeholder.
 */

import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

/**
 * Detect whether a book uses the Phase 5 new layout (outline/story_frame.md
 * exists on disk). If yes, story_bible.md / book_rules.md are compat shims.
 * If no, those files ARE the authoritative source.
 */
export async function isNewLayoutBook(bookDir: string): Promise<boolean> {
  try {
    await access(join(bookDir, "story", "outline", "story_frame.md"));
    return true;
  } catch {
    return false;
  }
}

async function readOr(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return fallback;
  }
}

/** Read story_frame.md, falling back to legacy story_bible.md. */
export async function readStoryFrame(
  bookDir: string,
  fallbackPlaceholder: string = "",
): Promise<string> {
  const newPath = join(bookDir, "story", "outline", "story_frame.md");
  const legacyPath = join(bookDir, "story", "story_bible.md");

  const newContent = await readOr(newPath, "");
  if (newContent.trim()) return newContent;

  return readOr(legacyPath, fallbackPlaceholder);
}

/** Read volume_map.md, falling back to legacy volume_outline.md. */
export async function readVolumeMap(
  bookDir: string,
  fallbackPlaceholder: string = "",
): Promise<string> {
  const newPath = join(bookDir, "story", "outline", "volume_map.md");
  const legacyPath = join(bookDir, "story", "volume_outline.md");

  const newContent = await readOr(newPath, "");
  if (newContent.trim()) return newContent;

  return readOr(legacyPath, fallbackPlaceholder);
}

/** Read the rhythm principles file (zh or en variant). */
export async function readRhythmPrinciples(bookDir: string): Promise<string> {
  const zhPath = join(bookDir, "story", "outline", "节奏原则.md");
  const enPath = join(bookDir, "story", "outline", "rhythm_principles.md");

  const zh = await readOr(zhPath, "");
  if (zh.trim()) return zh;
  return readOr(enPath, "");
}

export interface RoleCard {
  readonly tier: "major" | "minor";
  readonly name: string;
  readonly content: string;
}

/**
 * Read the roles/ directory. Returns [] when no roles are present (e.g. old
 * books still on character_matrix.md).
 */
export async function readRoleCards(bookDir: string): Promise<ReadonlyArray<RoleCard>> {
  const rolesRoot = join(bookDir, "story", "roles");
  const majorDirZh = join(rolesRoot, "主要角色");
  const minorDirZh = join(rolesRoot, "次要角色");
  const majorDirEn = join(rolesRoot, "major");
  const minorDirEn = join(rolesRoot, "minor");

  const cards: RoleCard[] = [];
  await Promise.all([
    collectRoleDir(majorDirZh, "major", cards),
    collectRoleDir(minorDirZh, "minor", cards),
    collectRoleDir(majorDirEn, "major", cards),
    collectRoleDir(minorDirEn, "minor", cards),
  ]);
  return cards;
}

async function collectRoleDir(
  dir: string,
  tier: "major" | "minor",
  out: RoleCard[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const reads = entries
    .filter((entry) => entry.endsWith(".md"))
    .map(async (entry) => {
      const content = await readOr(join(dir, entry), "");
      if (!content.trim()) return;
      out.push({
        tier,
        name: entry.replace(/\.md$/, ""),
        content,
      });
    });
  await Promise.all(reads);
}

/**
 * Render role cards in a format compatible with downstream consumers that
 * previously expected character_matrix.md prose. When no role cards exist,
 * returns the legacy character_matrix.md content or the placeholder.
 */
export async function readCharacterContext(
  bookDir: string,
  fallbackPlaceholder: string = "",
): Promise<string> {
  const cards = await readRoleCards(bookDir);
  if (cards.length > 0) {
    const groups: Record<"major" | "minor", RoleCard[]> = { major: [], minor: [] };
    for (const card of cards) groups[card.tier].push(card);

    const render = (tierCards: RoleCard[], heading: string): string => {
      if (tierCards.length === 0) return "";
      const sections = tierCards.map((card) => `### ${card.name}\n\n${card.content.trim()}`);
      return `## ${heading}\n\n${sections.join("\n\n")}`;
    };

    const blocks = [
      render(groups.major, "主要角色 / Major characters"),
      render(groups.minor, "次要角色 / Minor characters"),
    ].filter(Boolean);

    return blocks.join("\n\n");
  }

  // Fallback: legacy character_matrix.md (may itself be a shim pointer).
  const legacyPath = join(bookDir, "story", "character_matrix.md");
  return readOr(legacyPath, fallbackPlaceholder);
}
