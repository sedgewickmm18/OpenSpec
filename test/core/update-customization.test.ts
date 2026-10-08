import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  isCustomizedArtifact,
  bufferStockArtifact,
  stockBufferDir,
} from '../../src/core/update-customization.js';

const STOCK_SKILL = `---
name: openspec-propose
description: Stock generated skill.
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.14.1"
---

Stock body.
`;

const CUSTOMIZED_SKILL = `---
name: openspec-propose
description: Customized skill.
allowed-tools: Bash(node:*), mcp__FalkorDB__query_graph
metadata:
  author: openspec
  version: "2.0"
  generatedBy: "1.13.2"
  backend: falkordb
---

Customized body.
`;

const CUSTOMIZED_COMMAND = `---
name: "OPSX: Propose"
description: "Customized command"
metadata:
  backend: falkordb
---

Customized body.
`;

describe('update-customization', () => {
  describe('isCustomizedArtifact', () => {
    it('rejects missing or frontmatter-free content', () => {
      expect(isCustomizedArtifact(null)).toBe(false);
      expect(isCustomizedArtifact('')).toBe(false);
      expect(isCustomizedArtifact('No frontmatter at all.\n')).toBe(false);
    });

    it('treats stock generator metadata as not customized', () => {
      expect(isCustomizedArtifact(STOCK_SKILL)).toBe(false);
    });

    it('detects an unknown metadata key in a skill', () => {
      expect(isCustomizedArtifact(CUSTOMIZED_SKILL)).toBe(true);
    });

    it('detects an unknown metadata key in a command', () => {
      expect(isCustomizedArtifact(CUSTOMIZED_COMMAND)).toBe(true);
    });

    it('detects flow-style metadata maps', () => {
      const flow = '---\nname: x\nmetadata: {backend: falkordb}\n---\nbody\n';
      expect(isCustomizedArtifact(flow)).toBe(true);
      const stockFlow = '---\nname: x\nmetadata: {author: openspec}\n---\nbody\n';
      expect(isCustomizedArtifact(stockFlow)).toBe(false);
    });

    it('ends the metadata block at the next top-level key', () => {
      const content = '---\nname: x\nmetadata:\n  author: openspec\ncompatibility: Requires CLI\n  backend: falkordb\n---\nbody\n';
      // `backend` appears after `compatibility:` re-opened top-level scope, so
      // it is not a metadata child and must not mark the file customized.
      expect(isCustomizedArtifact(content)).toBe(false);
    });

    it('handles CRLF frontmatter', () => {
      const crlf = CUSTOMIZED_SKILL.replace(/\n/g, '\r\n');
      expect(isCustomizedArtifact(crlf)).toBe(true);
    });
  });

  describe('bufferStockArtifact', () => {
    let projectDir: string;

    beforeEach(async () => {
      projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-buffer-'));
      vi.stubEnv('HOME', path.join(projectDir, 'home'));
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      await fs.rm(projectDir, { recursive: true, force: true });
    });

    it('buffers stock content at the mirrored update-buffer path', async () => {
      const artifact = path.join(projectDir, '.zcode', 'skills', 'openspec-propose', 'SKILL.md');
      expect(await bufferStockArtifact(projectDir, artifact, STOCK_SKILL)).toBe(true);
      const buffered = path.join(stockBufferDir(projectDir), '.zcode', 'skills', 'openspec-propose', 'SKILL.md');
      await expect(fs.readFile(buffered, 'utf-8')).resolves.toBe(STOCK_SKILL);
    });

    it('does not rewrite an identical buffer', async () => {
      const artifact = path.join(projectDir, '.zcode', 'commands', 'opsx', 'propose.md');
      await bufferStockArtifact(projectDir, artifact, STOCK_SKILL);
      expect(await bufferStockArtifact(projectDir, artifact, STOCK_SKILL)).toBe(false);
      expect(await bufferStockArtifact(projectDir, artifact, STOCK_SKILL + 'changed\n')).toBe(true);
    });

    it('skips buffering for artifacts outside the project', async () => {
      const outside = path.join(os.tmpdir(), 'elsewhere', 'SKILL.md');
      expect(await bufferStockArtifact(projectDir, outside, STOCK_SKILL)).toBe(false);
    });
  });
});
