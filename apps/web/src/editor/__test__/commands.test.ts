// @vitest-environment happy-dom
import { redo, undo } from '@milkdown/kit/prose/history';
import { describe, expect, it } from 'vitest';
import {
  blockCommands,
  canRunCommand,
  formatCommands,
  matchingBlocks,
  runCommand,
  setEditorLink,
} from '../commands.js';
import { rich, select } from './editor-fixture.js';

async function open(source?: string) {
  const instance = await rich(source);
  select(instance.view);
  return { ...instance, editor: instance.view };
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
    async (source) => {
      const { editor, loaded, close } = await open(source);
      try {
        const before = editor.state.doc;
        expect(runCommand(editor, blockCommands[0]!)).toBe(true);
        expect(
          editor.state.doc
            .toJSON()
            .content.every(
              (node: { type: string }) => node.type === 'paragraph',
            ),
        ).toBe(true);
        expect(loaded.serialize(editor.state.doc)).toContain(
          source.includes('nested') ? '**nested**' : '**item**',
        );
        expect(undo(editor.state, editor.dispatch)).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
      } finally {
        close();
      }
    },
  );

  it('removes only the selected list item and leaves the other items in their list', async () => {
    const { editor, loaded, close } = await open('- first\n- second');
    try {
      select(editor, 3);
      const before = editor.state.doc;
      expect(runCommand(editor, blockCommands[0]!)).toBe(true);
      expect(
        editor.state.doc
          .toJSON()
          .content.map((node: { type: string }) => node.type),
      ).toEqual(['paragraph', 'bullet_list']);
      expect(loaded.serialize(editor.state.doc)).toBe('first\n\n- second');
      expect(undo(editor.state, editor.dispatch)).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      close();
    }
  });

  it.each(blockCommands)(
    'converts $label with a single update and reversible history',
    async (command) => {
      const { editor, loaded, close, updates } = await open(
        command.id === 'paragraph' ? '# Original text' : 'Original text',
      );
      try {
        const before = editor.state.doc;
        expect(canRunCommand(editor, command)).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
        expect(runCommand(editor, command)).toBe(true);
        const changed = editor.state.doc;
        expect(changed.eq(before)).toBe(false);
        expect(updates()).toBe(1);
        const serialized = loaded.serialize(editor.state.doc);
        const reopened = await rich(serialized);
        reopened.close();
        expect(undo(editor.state, editor.dispatch)).toBe(true);
        expect(editor.state.doc.eq(before)).toBe(true);
        expect(redo(editor.state, editor.dispatch)).toBe(true);
        expect(editor.state.doc.eq(changed)).toBe(true);
      } finally {
        close();
      }
    },
  );

  it.each(
    formatCommands.filter((command) => !['undo', 'redo'].includes(command.id)),
  )('applies and reverses $label', async (command) => {
    const { editor, loaded, close } = await open();
    try {
      const before = editor.state.doc;
      expect(runCommand(editor, command)).toBe(true);
      expect(command.active?.(editor)).toBe(true);
      const reopened = await rich(loaded.serialize(editor.state.doc));
      reopened.close();
      expect(undo(editor.state, editor.dispatch)).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      close();
    }
  });

  it('consumes a slash query and inserts a diagram as one undo step', async () => {
    const { editor, loaded, close } = await open('/diagram');
    try {
      const before = editor.state.doc;
      const command = blockCommands.find(
        (command) => command.id === 'mermaid',
      )!;
      expect(runCommand(editor, command, { from: 1, to: 9 })).toBe(true);
      expect(editor.state.doc.textContent).not.toContain('/diagram');
      expect(
        editor.state.doc
          .toJSON()
          .content?.some((node: { type: string }) => node.type === 'mermaid'),
      ).toBe(true);
      expect(loaded.serialize(editor.state.doc)).toContain(
        'flowchart LR\n  A --> B',
      );
      expect(undo(editor.state, editor.dispatch)).toBe(true);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      close();
    }
  });

  it('leaves nested slash text intact when a diagram is unavailable', async () => {
    const { editor, close } = await open('- /diagram');
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
      close();
    }
  });

  it('rejects invalid trigger ranges and read-only commands without mutation', async () => {
    const { editor, close } = await open();
    try {
      const before = editor.state.doc;
      for (const range of [
        { from: -1, to: 1 },
        { from: 2, to: 1 },
        { from: 1, to: 1000 },
        { from: 1.5, to: 2 },
      ])
        expect(runCommand(editor, blockCommands[0]!, range)).toBe(false);
      editor.setProps({ editable: () => false });
      expect(runCommand(editor, formatCommands[0]!)).toBe(false);
      expect(setEditorLink(editor, 'https://example.com')).toBe(false);
      expect(editor.state.doc.eq(before)).toBe(true);
    } finally {
      close();
    }
  });

  it('validates links before changing marks and removes a link explicitly', async () => {
    const { editor, loaded, close } = await open();
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
      expect(loaded.serialize(editor.state.doc)).toContain(
        'https://example.com/path',
      );
      expect(setEditorLink(editor, null)).toBe(true);
      expect(
        editor.state.doc.rangeHasMark(
          0,
          editor.state.doc.content.size,
          editor.state.schema.marks.link!,
        ),
      ).toBe(false);
      expect(loaded.serialize(editor.state.doc)).toBe('Original text');
    } finally {
      close();
    }
  });

  it('filters discoverable block labels and aliases without reordering', async () => {
    expect(matchingBlocks('')).toEqual(blockCommands);
    expect(matchingBlocks('  TODO  ').map((command) => command.id)).toEqual([
      'task-list',
    ]);
    expect(matchingBlocks('h6').map((command) => command.id)).toEqual([
      'heading-6',
    ]);
    expect(matchingBlocks('no such block')).toEqual([]);
  });

  it('exposes undo and redo availability without changing history', async () => {
    const { editor, close } = await open();
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
      close();
    }
  });
});
