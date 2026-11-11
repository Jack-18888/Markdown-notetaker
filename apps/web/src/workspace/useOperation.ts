import { useEffect, useRef, useState } from 'react';
import { WorkspaceRequestError } from './api.js';
import type { Selection } from './tree.js';

export interface OperationCallbacks {
  onCommit(next: Selection, signal: AbortSignal): Promise<void>;
  onClose(refreshSelection?: Selection): void;
}

/** After a known commit, retries refresh metadata without repeating the mutation. */
export function useOperation(
  execute: (signal: AbortSignal) => Promise<Selection>,
  callbacks: OperationCallbacks,
) {
  const committed = useRef<Selection | null>(null);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  async function run() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      if (!committed.current) {
        committed.current = await execute(controller.signal);
        if (controller.signal.aborted) return;
        setSaved(true);
      }
      await callbacks.onCommit(committed.current, controller.signal);
      if (!controller.signal.aborted) callbacks.onClose();
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          committed.current
            ? 'The change was saved, but the workspace could not be refreshed. Retry the refresh.'
            : error instanceof WorkspaceRequestError
              ? error.message
              : 'The action could not be completed. Your values are still here.',
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
      }
    }
  }
  function dismiss() {
    if (!request.current) callbacks.onClose(committed.current ?? undefined);
  }
  return { pending, saved, error, run, dismiss };
}
