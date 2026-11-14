import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { limits } from '@markdown-note-taker/contracts';

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const noteFile = new RegExp(`^${uuid}-([a-f0-9]{64})\\.md$`);
const stagingFile = new RegExp(`^\\.pending-${uuid}$`);
const pendingBody = /^\.pending-body-(.+)$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

function syncDirectory(path: string) {
  // Node cannot open directory handles for fsync on Windows.
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function noteFiles(dataDirectory: string) {
  const directory = join(dataDirectory, 'notes');

  function checkDirectory() {
    const info = lstatSync(directory, { throwIfNoEntry: false });
    if (info && !info.isDirectory())
      throw new Error('Invalid notes directory.');
    return info !== undefined;
  }

  function readBytes(path: string) {
    const checksum = noteFile.exec(path)?.[1];
    if (!checksum || !checkDirectory()) throw new Error('Invalid note path.');
    const target = join(directory, path);
    const info = lstatSync(target);
    if (!info.isFile() || info.size > limits.markdownBytes)
      throw new Error('Invalid note file.');
    const bytes = readFileSync(target);
    if (bytes.length > limits.markdownBytes || digest(bytes) !== checksum)
      throw new Error('Note file contents do not match the saved body.');
    return bytes;
  }

  function remove(path: string) {
    const target = join(directory, path);
    if (lstatSync(target, { throwIfNoEntry: false })?.isFile())
      unlinkSync(target);
  }

  return {
    read: (path: string) => decoder.decode(readBytes(path)),

    /** Caller holds the SQLite writer lock until the path is committed. */
    stage(id: string, bytes: Buffer) {
      const path = `${id}-${digest(bytes)}.md`;
      if (!noteFile.test(path) || bytes.length > limits.markdownBytes)
        throw new Error('Invalid note body or ID.');
      decoder.decode(bytes);
      if (!checkDirectory()) {
        mkdirSync(directory, { mode: 0o700 });
        syncDirectory(dataDirectory);
      }
      const target = join(directory, path);
      const alreadyExists = lstatSync(target, { throwIfNoEntry: false });
      // A prior attempt may already have written this body. Check it before claiming the path.
      if (alreadyExists) readBytes(path);
      const marker = join(directory, `.pending-body-${path}`);
      if (!lstatSync(marker, { throwIfNoEntry: false }))
        writeFileSync(marker, '', { flag: 'wx', mode: 0o600, flush: true });
      if (!alreadyExists) {
        const temporary = join(directory, `.pending-${randomUUID()}`);
        try {
          writeFileSync(temporary, bytes, {
            flag: 'wx',
            mode: 0o600,
            flush: true,
          });
          renameSync(temporary, target);
        } finally {
          // If removal fails, startup can pick up the staging file.
          try {
            unlinkSync(temporary);
          } catch {
            /* The rename may already have consumed it. */
          }
        }
      }
      syncDirectory(directory);
      return path;
    },

    pending() {
      if (!checkDirectory()) return [];
      const pending = [];
      for (const entry of readdirSync(directory)) {
        const path = pendingBody.exec(entry)?.[1];
        if (path && noteFile.test(path)) pending.push(path);
        if (stagingFile.test(entry)) remove(entry);
      }
      return pending;
    },

    finish(path: string, referenced: boolean) {
      if (!noteFile.test(path) || !checkDirectory()) return;
      if (!referenced) remove(path);
      remove(`.pending-body-${path}`);
    },

    hasBodies: () =>
      checkDirectory() &&
      readdirSync(directory).some((path) => noteFile.test(path)),
  };
}
