// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOperation, type OperationCallbacks } from '../useOperation.js';
import type { Selection } from '../tree.js';

afterEach(() => vi.unstubAllGlobals());
function Probe({
  execute,
  callbacks,
}: {
  execute(signal: AbortSignal): Promise<Selection>;
  callbacks: OperationCallbacks;
}) {
  const operation = useOperation(execute, callbacks);
  return createElement(
    'button',
    {
      onClick: () => {
        void operation.run();
      },
    },
    operation.error || (operation.saved ? 'saved' : 'new'),
  );
}
describe('lifecycle mutation ordering', () => {
  it('retries a failed refresh without repeating an accepted mutation', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    const next: Selection = { kind: 'folder', id: null };
    const execute = vi.fn().mockResolvedValue(next);
    const callbacks = {
      onCommit: vi
        .fn()
        .mockRejectedValueOnce(new Error('private diagnostic'))
        .mockResolvedValueOnce(undefined),
      onClose: vi.fn(),
    };
    try {
      await act(() =>
        root.render(createElement(Probe, { execute, callbacks })),
      );
      await act(() => host.querySelector('button')!.click());
      expect(host.textContent).toContain('The change was saved');
      expect(host.textContent).not.toContain('private diagnostic');
      await act(() => host.querySelector('button')!.click());
      expect(execute).toHaveBeenCalledTimes(1);
      expect(callbacks.onCommit).toHaveBeenCalledTimes(2);
      expect(callbacks.onClose).toHaveBeenCalledOnce();
    } finally {
      await act(() => root.unmount());
    }
  });
  it('prevents concurrent submission before React commits the pending state', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    let resolve!: (selection: Selection) => void;
    const execute = vi.fn().mockReturnValue(
      new Promise<Selection>((done) => {
        resolve = done;
      }),
    );
    const callbacks = {
      onCommit: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
    };
    try {
      await act(() =>
        root.render(createElement(Probe, { execute, callbacks })),
      );
      await act(() => {
        host.querySelector('button')!.click();
        host.querySelector('button')!.click();
      });
      expect(execute).toHaveBeenCalledTimes(1);
      await act(() => resolve({ kind: 'folder', id: null }));
    } finally {
      await act(() => root.unmount());
    }
  });
});
