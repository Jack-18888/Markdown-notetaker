import { expect, it } from 'vitest';
import {
  temporaryWorkspace,
  seedWorkspace,
} from '../../../__test__/temporary-workspace.js';
import { workspaceMigrations } from '../../migrations.js';

it('upgrades schema 2 without changing notes, hierarchy, or metadata and reopens', () => {
  const temp = temporaryWorkspace();
  try {
    const old = temp.open({ migrations: workspaceMigrations.slice(0, 2) });
    seedWorkspace(old);
    const notes = old.prepare('SELECT * FROM notes').all();
    const folders = old.prepare('SELECT * FROM folders').all();
    old.close();
    const upgraded = temp.open();
    expect(upgraded.pragma('user_version', { simple: true })).toBe(3);
    expect(upgraded.prepare('SELECT * FROM images').all()).toEqual([]);
    upgraded.close();
    const reopened = temp.open();
    expect(reopened.prepare('SELECT * FROM notes').all()).toEqual(notes);
    expect(reopened.prepare('SELECT * FROM folders').all()).toEqual(folders);
  } finally {
    temp.cleanup();
  }
});
