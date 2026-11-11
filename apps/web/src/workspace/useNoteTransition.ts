import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDetail } from '@markdown-note-taker/contracts';
import type { SaveCoordinator } from './SaveCoordinator.js';

/** The most recent requested destination wins while a shared flush drains the active note. */
export function useNoteTransition() {
  const active = useRef<SaveCoordinator | null>(null);
  const version = useRef(0);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  const register = useCallback((session: SaveCoordinator | null) => {
    active.current = session;
    version.current++;
    setState('idle');
  }, []);
  const run = useCallback(
    async (proceed: (saved: NoteDetail | null) => void) => {
      const request = ++version.current;
      const session = active.current;
      if (!session || !session.getSnapshot().dirty) {
        setState('idle');
        proceed(session?.getSnapshot().note ?? null);
        return;
      }
      setState('saving');
      const saved = await session.flush();
      if (request !== version.current || session !== active.current) return;
      if (!saved) {
        setState('error');
        return;
      }
      setState('idle');
      proceed(saved);
    },
    [],
  );
  return { register, run, state };
}
