import { describe, expect, it } from 'vitest';
import { limits } from '@markdown-note-taker/contracts';
import {
  importTitle,
  readMarkdownFile,
  validImportTitle,
} from '../markdown-files.js';

describe('Markdown file input', () => {
  it.each([
    '',
    '\ufeff# BOM\r\n\r\n',
    'a\rb\r\nc\n',
    '雪 😀\n\0',
    '<script>alert(1)</script>',
  ])('preserves exact UTF-8 source %j', async (source) => {
    expect(await readMarkdownFile(new File([source], 'note.MD'))).toBe(source);
  });
  it('accepts the inclusive byte limit and rejects larger files before reading', async () => {
    expect(
      (
        await readMarkdownFile(
          new File(['é'.repeat(limits.markdownImportBytes / 2)], 'note.md'),
        )
      ).length,
    ).toBe(limits.markdownImportBytes / 2);
    await expect(
      readMarkdownFile(
        new File(['x'.repeat(limits.markdownImportBytes + 1)], 'large.md'),
      ),
    ).rejects.toThrow('256 KiB');
  });
  it.each([[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]])(
    'rejects malformed UTF-8 %j',
    async (...bytes) => {
      await expect(
        readMarkdownFile(new File([new Uint8Array(bytes)], 'bad.md')),
      ).rejects.toThrow('valid UTF-8');
    },
  );
  it('rejects other extensions and unreadable files', async () => {
    await expect(
      readMarkdownFile(new File(['text'], 'note.txt')),
    ).rejects.toThrow('.md');
    await expect(
      readMarkdownFile({
        name: 'note.md',
        size: 1,
        arrayBuffer: async () => {
          throw new Error('unavailable');
        },
      }),
    ).rejects.toThrow('could not be read');
  });
  it('derives titles and applies shared name rules without truncation', () => {
    expect(importTitle('  First.note.MD')).toBe('First.note');
    expect(importTitle('.md')).toBe('Untitled');
    expect(validImportTitle(importTitle('😀'.repeat(200) + '.md'))).toBe(true);
    expect(validImportTitle(importTitle('😀'.repeat(201) + '.md'))).toBe(false);
    expect(validImportTitle(importTitle('bad\u0001.md'))).toBe(false);
  });
});
