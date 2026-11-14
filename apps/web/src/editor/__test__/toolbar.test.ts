// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { blockCommands, formatCommands, runCommand } from '../commands.js';
import { expect, it } from 'vitest';
import EditorToolbar from '../EditorToolbar.js';
import { rich, select } from './editor-fixture.js';

it('tracks selection, formatting, block type, and history using the mounted editor', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const { view: editor, close } = await rich('Write here');
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(createElement(EditorToolbar, { editor }));
    });
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find(
        (item) => item.textContent === label,
      )!;
    expect(button('Undo').disabled).toBe(true);
    await act(async () => {
      select(editor);
      button('Bold').click();
    });
    expect(formatCommands[0]!.active?.(editor)).toBe(true);
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(button('Undo').disabled).toBe(false);
    await act(async () => {
      button('Undo').click();
    });
    expect(formatCommands[0]!.active?.(editor)).toBe(false);
    await act(async () => {
      button('Redo').click();
      runCommand(
        editor,
        blockCommands.find((command) => command.id === 'task-list')!,
      );
    });
    expect(formatCommands[0]!.active?.(editor)).toBe(true);
    expect(host.querySelector('select')!.value).toBe('task-list');
    await act(async () => {
      select(editor, 3);
    });
    expect(host.querySelector('[aria-label="Text formatting"]')).not.toBeNull();
  } finally {
    await act(async () => {
      root.unmount();
    });
    close();
    host.remove();
  }
});
