// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { expect, it } from 'vitest';
import { editorExtensions } from '../extensions.js';
import { slashQuery } from '../slash.js';

it('offers slash insertion only at the start of an editable paragraph', () => {
  const editor = new Editor({
    extensions: editorExtensions(),
    content:
      '<p>/heading 2</p><p>text /quote</p><pre><code>/code</code></pre><p><code>/inline</code></p>',
  });
  try {
    editor.commands.setTextSelection(11);
    expect(slashQuery(editor)).toEqual({
      query: 'heading 2',
      range: { from: 1, to: 11 },
    });
    editor.commands.setTextSelection(24);
    expect(slashQuery(editor)).toBeNull();
    editor.commands.focus('end');
    expect(slashQuery(editor)).toBeNull();
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(slashQuery(editor)).toBeNull();
    editor.commands.setTextSelection(11);
    editor.setEditable(false);
    expect(slashQuery(editor)).toBeNull();
  } finally {
    editor.destroy();
  }
});
