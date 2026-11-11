// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLoad } from '../useLoad.js';

afterEach(() => vi.unstubAllGlobals());
function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Probe({ load }: { load(signal: AbortSignal): Promise<string> }) {
  const { state, retry } = useLoad(load);
  return createElement(
    'button',
    { onClick: retry },
    state.status === 'ready' ? state.value : state.status,
  );
}

describe('workspace request lifecycle', () => {
  it('ignores old completions even when the transport ignores cancellation', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    const first = deferred();
    const second = deferred();
    const oldLoad = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockReturnValue(first.promise);
    const newLoad = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockReturnValue(second.promise);
    try {
      await act(() => root.render(createElement(Probe, { load: oldLoad })));
      expect(host.textContent).toBe('loading');
      await act(() => root.render(createElement(Probe, { load: newLoad })));
      expect(oldLoad.mock.calls[0]![0].aborted).toBe(true);
      await act(() => second.resolve('Selected note'));
      expect(host.textContent).toBe('Selected note');
      await act(() => first.resolve('Stale note'));
      expect(host.textContent).toBe('Selected note');
    } finally {
      await act(() => root.unmount());
    }
    expect(newLoad.mock.calls[0]![0].aborted).toBe(true);
  });
  it('retries failures without displaying exception diagnostics', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('private source'))
      .mockResolvedValueOnce('Recovered');
    try {
      await act(() => root.render(createElement(Probe, { load })));
      expect(host.textContent).toBe('error');
      await act(() => host.querySelector('button')!.click());
      expect(host.textContent).toBe('Recovered');
    } finally {
      await act(() => root.unmount());
    }
  });
});
