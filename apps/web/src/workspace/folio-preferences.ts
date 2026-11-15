import { useEffect, useState } from 'react';

export const noteIcons = ['✦', '◈', '✎', '✓', '◇', '☷'] as const;
export type NoteIcon = (typeof noteIcons)[number];
export type NoteAppearance = {
  favorite?: boolean;
  icon?: NoteIcon;
  font?: 'sans' | 'serif';
};
type Preferences = {
  theme: 'light' | 'dark';
  notes: Record<string, NoteAppearance>;
};
const preferencesKey = 'markdown-note-taker.folio.appearance.v1';

function preferences(): Preferences {
  const fallback: Preferences = {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
    notes: {},
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(preferencesKey) ?? 'null',
    ) as Partial<Preferences> | null;
    if (saved?.theme === 'light' || saved?.theme === 'dark')
      fallback.theme = saved.theme;
    if (!saved?.notes || typeof saved.notes !== 'object') return fallback;
    const notes = Object.entries(saved.notes).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object') return [];
      const appearance: NoteAppearance = {};
      if (value.favorite === true) appearance.favorite = true;
      if (value.font === 'serif') appearance.font = 'serif';
      if (value.icon && noteIcons.includes(value.icon))
        appearance.icon = value.icon;
      return [[id, appearance]] as const;
    });
    return { ...fallback, notes: Object.fromEntries(notes) };
  } catch {
    return fallback;
  }
}

export function useFolioPreferences() {
  const [state, setState] = useState(preferences);
  useEffect(() => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(state));
    } catch {
      // These preferences can remain in memory in private or restricted browsers.
    }
  }, [state]);
  return {
    state,
    toggleTheme() {
      setState((current) => ({
        ...current,
        theme: current.theme === 'light' ? 'dark' : 'light',
      }));
    },
    updateNoteAppearance(id: string, update: NoteAppearance) {
      setState((current) => ({
        ...current,
        notes: { ...current.notes, [id]: { ...current.notes[id], ...update } },
      }));
    },
  };
}
