/**
 * Customized-artifact preservation for `openspec update`.
 *
 * `update` regenerates every managed skill and command file from templates.
 * A file the user rewrote after generation (for example the FalkorDB-backed
 * workflow skills stamped `metadata.backend: falkordb`) would be silently
 * clobbered even by a same-version run, because drift detection compares
 * against generated content and refreshes on any mismatch.
 *
 * This module recognizes such files by a frontmatter marker and lets callers
 * preserve them: the file stays untouched while the freshly generated stock
 * content is buffered under `openspec/update-buffer/` for review, so upstream
 * improvements remain visible without destroying the customization.
 *
 * Marker convention: a YAML frontmatter `metadata:` mapping that contains at
 * least one key the skill/command generators never emit. The generators
 * produce only `author`, `version`, and `generatedBy`; any additional key
 * (e.g. `backend:`) marks the file as customized. A missing frontmatter or a
 * metadata block made only of generator keys means "stock, safe to overwrite".
 */

import * as fs from 'fs';
import path from 'path';
import { OPENSPEC_DIR_NAME } from './config.js';

/** Metadata keys the skill and command generators emit themselves. */
const GENERATOR_METADATA_KEYS = new Set(['author', 'version', 'generatedBy']);

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Reports whether an artifact's content marks it as user-customized.
 *
 * Accepts `null` (missing file) and returns `false` so callers can pass a
 * read result directly.
 */
export function isCustomizedArtifact(content: string | null): boolean {
  if (!content) return false;
  const frontmatter = content.match(FRONTMATTER_PATTERN);
  if (!frontmatter) return false;

  const lines = frontmatter[1].split(/\r?\n/);
  let inMetadata = false;
  for (const line of lines) {
    if (/^metadata:\s*\{/.test(line)) {
      // Flow style: metadata: {backend: falkordb}
      const keys = line.match(/\{(.*)\}/)?.[1] ?? '';
      return keys.split(',').some((entry) => {
        const key = entry.match(/^\s*([A-Za-z0-9_-]+):/);
        return key !== null && !GENERATOR_METADATA_KEYS.has(key[1]);
      });
    }
    if (/^metadata:\s*(?:#.*)?$/.test(line)) {
      inMetadata = true;
      continue;
    }
    if (/^\S/.test(line)) {
      // Any top-level key ends the metadata block.
      inMetadata = false;
      continue;
    }
    if (!inMetadata) continue;
    const key = line.match(/^\s+([A-Za-z0-9_-]+):/);
    if (key !== null && !GENERATOR_METADATA_KEYS.has(key[1])) return true;
  }
  return false;
}

/** The project-relative directory buffered stock artifacts are written to. */
export function stockBufferDir(projectPath: string): string {
  return path.join(projectPath, OPENSPEC_DIR_NAME, 'update-buffer');
}

/**
 * Buffers freshly generated stock content for a preserved artifact at
 * `openspec/update-buffer/<artifact-relative-path>`.
 *
 * Returns `true` when a buffer file was (re)written, `false` when the buffered
 * content already matches (no churn) or the artifact lives outside the project
 * (global skill targets are preserved but not buffered).
 */
export async function bufferStockArtifact(
  projectPath: string,
  artifactPath: string,
  stockContent: string
): Promise<boolean> {
  const relative = path.relative(projectPath, artifactPath);
  if (relative.startsWith('..')) return false;

  const bufferFile = path.join(stockBufferDir(projectPath), relative);
  try {
    if (fs.readFileSync(bufferFile, 'utf-8') === stockContent) return false;
  } catch {
    // Not buffered yet.
  }
  await fs.promises.mkdir(path.dirname(bufferFile), { recursive: true });
  await fs.promises.writeFile(bufferFile, stockContent, 'utf-8');
  return true;
}
