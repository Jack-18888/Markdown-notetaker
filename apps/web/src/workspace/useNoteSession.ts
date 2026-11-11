import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { NoteDetail } from '@markdown-note-taker/contracts';
import { SaveCoordinator } from './SaveCoordinator.js';

export function useNoteSession(
  initial: NoteDetail,
  onSaved: (note: NoteDetail) => void,
  onDirty: (dirty: boolean) => void,
) {
  const [session] = useState(() => new SaveCoordinator(initial));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const lifetime = useRef<object>(null);
  useEffect(() => {
    const current = {};
    lifetime.current = current;
    let acknowledged: NoteDetail | null = null;
    const report = () => {
      const snapshot = session.getSnapshot();
      onDirty(snapshot.dirty);
      if (snapshot.note !== acknowledged) {
        acknowledged = snapshot.note;
        onSaved(snapshot.note);
      }
    };
    const unsubscribe = session.subscribe(report);
    report();
    return () => {
      unsubscribe();
      onDirty(false);
      // Strict Mode reconnects effects immediately; an actual unmount retires the session.
      queueMicrotask(() => {
        if (lifetime.current === current) session.dispose();
      });
    };
  }, [session, onSaved, onDirty]);
  return { session, state };
}
