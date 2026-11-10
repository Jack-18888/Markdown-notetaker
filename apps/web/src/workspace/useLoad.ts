import { useEffect, useState } from 'react';
import { WorkspaceRequestError } from './api.js';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: WorkspaceRequestError | null };

/** Cleanup also ignores late completions from transports that do not honor abort. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void load(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ status: 'ready', value });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            error: error instanceof WorkspaceRequestError ? error : null,
          });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}
