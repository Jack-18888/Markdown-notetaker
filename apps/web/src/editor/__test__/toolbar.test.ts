// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { expect, it } from 'vitest';
import EditorToolbar from '../EditorToolbar.js';
import { editorExtensions } from '../extensions.js';

it('tracks selection, formatting, block type, and history using the mounted editor', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({
    extensions: editorExtensions(),
    content: '<p>Write here</p>',
  });
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(createElement(EditorToolbar, { editor }));
    });
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find(
        (item) => item.getAttribute('aria-label') === label,
      )!;
    expect(button('Undo').disabled).toBe(true);
    await act(async () => {
      editor.commands.selectAll();
      button('Bold').click();
    });
    expect(editor.isActive('bold')).toBe(true);
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(button('Undo').disabled).toBe(false);
    await act(async () => {
      button('Undo').click();
    });
    expect(editor.isActive('bold')).toBe(false);
    await act(async () => {
      button('Redo').click();
      editor.commands.toggleTaskList();
    });
    expect(editor.isActive('bold')).toBe(true);
    expect(host.querySelector('select')!.value).toBe('task-list');
    await act(async () => {
      editor.commands.setTextSelection(1);
    });
    expect(host.querySelector('[aria-label="Text formatting"]')).not.toBeNull();
  } finally {
    await act(async () => {
      root.unmount();
    });
    editor.destroy();
    host.remove();
  }
});
