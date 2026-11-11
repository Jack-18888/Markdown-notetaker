// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  blockCommands,
  canRunCommand,
  formatCommands,
  matchingBlocks,
  runCommand,
  setEditorLink,
} from '../commands.js';
import { editorExtensions } from '../extensions.js';
import { loadMarkdown } from '../markdown.js';

function open(source = 'Original text') {
  const loaded = loadMarkdown(source);
  if (loaded.mode !== 'rich') throw new Error('Expected a rich fixture.');
  const editor = new Editor({
    extensions: editorExtensions(),
    content: loaded.document,
  });
  editor.commands.selectAll();
  return { editor, loaded };
}

describe('shared writing commands', () => {
  it.each([
    '- **item**',
    '1. **item**',
    '- [ ] **item**',
    '> **item**',
    '> - **item**',
    '- first\n  - **nested**',
  ])(
    'turns selected containers into plain blocks without losing marks or undo: %s',
    (source) => {
      const { editor, loaded } = open(source);
      try {
        const before = editor.state.doc;
        expect(runCommand(editor, blockCommands[0]!)).toBe(true);
        expect(
          editor.getJSON().content!.every((node) => node.type === 'paragraph'),
        ).toBe(true);
        expect(loaded.serialize(editor.getJSON())).toContain(
          source.includes('nested') ? '**nested**' : '**item**',
        );
        expect(editor.commands.undo()).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
      } finally {
        editor.destroy();
      }
    },
  );

  it('removes only the selected list item and leaves the other items in their list', () => {
    const { editor, loaded } = open('- first\n- second');
    try {
      editor.commands.setTextSelection(3);
      const before = editor.state.doc;
      expect(runCommand(editor, blockCommands[0]!)).toBe(true);
      expect(editor.getJSON().content!.map((node) => node.type)).toEqual([
        'paragraph',
        'bulletList',
      ]);
      expect(loaded.serialize(editor.getJSON())).toBe('first\n\n- second');
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it.each(blockCommands)(
    'converts $label with a single update and reversible history',
    (command) => {
      const { editor, loaded } = open(
        command.id === 'paragraph' ? '# Original text' : 'Original text',
      );
      try {
        const before = editor.state.doc;
        let updates = 0;
        editor.on('update', () => updates++);
        expect(canRunCommand(editor, command)).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
        expect(runCommand(editor, command)).toBe(true);
        const changed = editor.state.doc;
        expect(changed.eq(before)).toBe(false);
        expect(updates).toBe(1);
        const serialized = loaded.serialize(editor.getJSON());
        expect(loadMarkdown(serialized).mode).toBe('rich');
        expect(editor.commands.undo()).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
        expect(editor.commands.redo()).toBe(true);
        expect(editor.state.doc.eq(changed)).toBe(true);
      } finally {
        editor.destroy();
      }
    },
  );

  it.each(
    formatCommands.filter((command) => !['undo', 'redo'].includes(command.id)),
  )('applies and reverses $label', (command) => {
    const { editor, loaded } = open();
    try {
      const before = editor.state.doc;
      expect(runCommand(editor, command)).toBe(true);
      expect(command.active?.(editor)).toBe(true);
      expect(loadMarkdown(loaded.serialize(editor.getJSON())).mode).toBe(
        'rich',
      );
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('consumes a slash query and inserts a diagram as one undo step', () => {
    const { editor, loaded } = open('/diagram');
    try {
      const before = editor.state.doc;
      const command = blockCommands.find(
        (command) => command.id === 'mermaid',
      )!;
      expect(runCommand(editor, command, { from: 1, to: 9 })).toBe(true);
      expect(editor.getText()).not.toContain('/diagram');
      expect(
        editor.getJSON().content?.some((node) => node.type === 'mermaid'),
      ).toBe(true);
      expect(loaded.serialize(editor.getJSON())).toContain(
        'flowchart LR\n  A --> B',
      );
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('leaves nested slash text intact when a diagram is unavailable', () => {
    const { editor } = open('- /diagram');
    try {
      const before = editor.state.doc;
      const selection = editor.state.selection;
      const command = blockCommands.find(
        (command) => command.id === 'mermaid',
      )!;
      expect(runCommand(editor, command, { from: 3, to: 11 })).toBe(false);
      expect(editor.state.doc.eq(before)).toBe(true);
      expect(editor.state.selection.eq(selection)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('rejects invalid trigger ranges and read-only commands without mutation', () => {
    const { editor } = open();
    try {
      const before = editor.state.doc;
      for (const range of [
        { from: -1, to: 1 },
        { from: 2, to: 1 },
        { from: 1, to: 1000 },
        { from: 1.5, to: 2 },
      ])
        expect(runCommand(editor, blockCommands[0]!, range)).toBe(false);
      editor.setEditable(false);
      expect(runCommand(editor, formatCommands[0]!)).toBe(false);
      expect(setEditorLink(editor, 'https://example.com')).toBe(false);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('validates links before changing marks and removes a link explicitly', () => {
    const { editor, loaded } = open();
    try {
      expect(setEditorLink(editor, 'https://example.com/path')).toBe(true);
      const linked = editor.state.doc;
      for (const href of [
        '',
        'javascript:alert(1)',
        '//evil.example',
        'data:text/html,x',
      ]) {
        expect(setEditorLink(editor, href)).toBe(false);
        expect(editor.state.doc.eq(linked)).toBe(true);
      }
      expect(loaded.serialize(editor.getJSON())).toContain(
        'https://example.com/path',
      );
      expect(setEditorLink(editor, null)).toBe(true);
      expect(editor.isActive('link')).toBe(false);
      expect(loaded.serialize(editor.getJSON())).toBe('Original text');
    } finally {
      editor.destroy();
    }
  });

  it('filters discoverable block labels and aliases without reordering', () => {
    expect(matchingBlocks('')).toEqual(blockCommands);
    expect(matchingBlocks('  TODO  ').map((command) => command.id)).toEqual([
      'task-list',
    ]);
    expect(matchingBlocks('h6').map((command) => command.id)).toEqual([
      'heading-6',
    ]);
    expect(matchingBlocks('no such block')).toEqual([]);
  });

  it('exposes undo and redo availability without changing history', () => {
    const { editor } = open();
    try {
      const undo = formatCommands.find((command) => command.id === 'undo')!;
      const redo = formatCommands.find((command) => command.id === 'redo')!;
      expect(canRunCommand(editor, undo)).toBe(false);
      expect(runCommand(editor, formatCommands[0]!)).toBe(true);
      const bold = editor.state.doc;
      expect(canRunCommand(editor, undo)).toBe(true);
      expect(editor.state.doc.eq(bold)).toBe(true);
      expect(runCommand(editor, undo)).toBe(true);
      expect(canRunCommand(editor, redo)).toBe(true);
      expect(runCommand(editor, redo)).toBe(true);
      expect(editor.state.doc.eq(bold)).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
