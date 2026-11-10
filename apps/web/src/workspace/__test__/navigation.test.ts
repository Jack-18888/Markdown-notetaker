// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FolderTree from '../FolderTree.js';
import { indexTree } from '../tree.js';
import { folder, ids, note } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());
describe('folder navigation controls', () => {
  it('uses accessible disclosure and separate folder/note selection by ID', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    const tree = indexTree({
      folders: [folder],
      notes: [{ ...note, folderId: folder.id }],
    });
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    const render = (expanded: Set<string>) =>
      root.render(
        createElement(FolderTree, {
          tree,
          selection: { kind: 'note', id: note.id },
          expanded,
          onToggle,
          onSelect,
        }),
      );
    try {
      await act(() => render(new Set()));
      const toggle = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(
        host.querySelector(`#children-${ids.folder}`)?.hasAttribute('hidden'),
      ).toBe(true);
      await act(() => toggle.click());
      expect(onToggle).toHaveBeenCalledWith(folder.id);
      await act(() => render(new Set([folder.id])));
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const selected = host.querySelector<HTMLButtonElement>(
        '[aria-current="page"]',
      )!;
      expect(selected.textContent).toContain(note.title);
      await act(() => selected.click());
      expect(onSelect).toHaveBeenCalledWith({ kind: 'note', id: note.id });
      await act(() =>
        host.querySelector<HTMLButtonElement>('.folder-link')!.click(),
      );
      expect(onSelect).toHaveBeenCalledWith({ kind: 'folder', id: folder.id });
    } finally {
      await act(() => root.unmount());
    }
  });
});
