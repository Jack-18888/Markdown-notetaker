// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { undo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  insertMermaidDiagram,
  normalizeCodeBlockLanguage,
} from '../crepe-bridge.js';
import { rich } from './editor-fixture.js';

describe('Crepe playground bridge', () => {
  it('normalizes multi-word CodeMirror language names into safe fence tokens', async () => {
    expect(normalizeCodeBlockLanguage('MariaDB SQL')).toMatch(
      /^[a-z\d_+#.-]+$/i,
    );
    expect(normalizeCodeBlockLanguage('Properties files')).toMatch(
      /^[a-z\d_+#.-]+$/i,
    );
    expect(normalizeCodeBlockLanguage('mermaid')).toBe('text');

    const { loaded, view, close } = await rich('```js\nconst a = 1;\n```');
    try {
      view.dispatch(
        view.state.tr.setNodeAttribute(0, 'language', 'MariaDB SQL'),
      );
      expect(view.state.doc.child(0).attrs.language).toMatch(
        /^[a-z\d_+#.-]+$/i,
      );
      expect(loaded.serialize(view.state.doc)).toContain('const a = 1;');

      view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'mermaid'));
      expect(view.state.doc.child(0).attrs.language).toBe('text');
    } finally {
      close();
    }
  });

  it('rejects pasted slices containing unsafe links', async () => {
    const { loaded, view, close } = await rich('Original text');
    try {
      const { schema } = view.state;
      const unsafeNode = schema.node(
        'paragraph',
        null,
        schema.text('Bad', [
          schema.marks.link!.create({ href: 'javascript:alert(1)' }),
        ]),
      );
      view.dispatch(
        view.state.tr.insert(view.state.doc.content.size, unsafeNode),
      );
      expect(loaded.serialize(view.state.doc)).toBe('Original text');
    } finally {
      close();
    }
  });

  it('adds native accessible task checkboxes in interactive Crepe mode', async () => {
    const { loaded, view, host, close } = await rich(
      '- [ ] Review task\n- [x] Done task',
      { interactive: true },
    );
    try {
      await Promise.resolve();
      const boxes = host.querySelectorAll<HTMLInputElement>(
        'input.crepe-task-checkbox',
      );
      expect(boxes).toHaveLength(2);
      expect(boxes[0]?.getAttribute('aria-label')).toBe(
        'Task item checkbox for Review task',
      );
      expect(boxes[0]?.checked).toBe(false);
      expect(boxes[1]?.checked).toBe(true);

      boxes[0]!.checked = true;
      boxes[0]!.dispatchEvent(new Event('change', { bubbles: true }));
      expect(loaded.serialize(view.state.doc)).toBe(
        '- [x] Review task\n- [x] Done task',
      );

      undo(view.state, view.dispatch);
      expect(loaded.serialize(view.state.doc)).toBe(
        '- [ ] Review task\n- [x] Done task',
      );
    } finally {
      close();
    }
  });

  it('labels interactive Crepe table and code block controls cleanly', async () => {
    const { view, host, close } = await rich(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nlet x = 1;\n```',
      { interactive: true },
    );
    try {
      await Promise.resolve();
      expect(
        host
          .querySelector('[data-role="x-line-drag-handle"] > button.add-button')
          ?.getAttribute('aria-label'),
      ).toBe('Add row');
      expect(
        host
          .querySelector('[data-role="y-line-drag-handle"] > button.add-button')
          ?.getAttribute('aria-label'),
      ).toBe('Add column');
      const colButtons = host.querySelectorAll(
        '[data-role="col-drag-handle"] .button-group button',
      );
      expect(
        [...colButtons].map((button) => button.getAttribute('aria-label')),
      ).toEqual([
        'Align column left',
        'Align column center',
        'Align column right',
        'Delete column',
      ]);
      expect(
        host
          .querySelector('[data-role="row-drag-handle"] .button-group button')
          ?.getAttribute('aria-label'),
      ).toBe('Delete row');

      // Validate inline error feedback on Crepe's link edit popup.
      const linkEdit = host.querySelector<HTMLElement>('.milkdown-link-edit');
      const input =
        linkEdit?.querySelector<HTMLInputElement>('input.input-area');
      if (linkEdit && input) {
        input.value = 'javascript:alert(1)';
        input.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(linkEdit.querySelector('[role="alert"]')?.textContent).toContain(
          'http, https, mailto',
        );
        expect(input.getAttribute('aria-invalid')).toBe('true');

        input.value = 'https://example.com';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(linkEdit.querySelector('[role="alert"]')).toBeNull();
      }

      // Check safe document selection remains valid.
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)),
      );
    } finally {
      close();
    }
  });

  it('inserts Mermaid diagrams only at document top level and supports undo', async () => {
    const { loaded, view, close } = await rich('> Quoted /mermaid');
    try {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)),
      );
      const fakeCtx = {
        get(slice: unknown) {
          if (slice === editorViewCtx) return view;
          if (slice === commandsCtx) return { call() {} };
          throw new Error('Unexpected slice');
        },
      } as Parameters<typeof insertMermaidDiagram>[0];

      insertMermaidDiagram(fakeCtx);
      expect(view.state.doc.child(0).type.name).toBe('blockquote');
      expect(view.state.doc.child(1).type.name).toBe('mermaid');
      expect(loaded.serialize(view.state.doc)).toContain('```mermaid');

      undo(view.state, view.dispatch);
      expect(loaded.serialize(view.state.doc)).toBe('> Quoted /mermaid');
    } finally {
      close();
    }
  });
});
