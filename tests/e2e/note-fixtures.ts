import { test as base } from '@playwright/test';
import {
  noteDetailSchema,
  type NoteDetail,
} from '@markdown-note-taker/contracts';

interface Notes {
  create(title: string, content?: string): Promise<NoteDetail>;
  read(id: string): Promise<NoteDetail>;
  track(id: string): void;
}
export const test = base.extend<{ notes: Notes }>({
  notes: async ({ request }, use) => {
    const owned = new Set<string>();
    const read = async (id: string) =>
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${id}`)).json(),
      );
    try {
      await use({
        async create(title, content = 'Original') {
          const note = noteDetailSchema.parse(
            await (
              await request.post('/api/notes', {
                data: { title, folderId: null, content },
              })
            ).json(),
          );
          owned.add(note.id);
          return note;
        },
        read,
        track: (id) => {
          owned.add(id);
        },
      });
    } finally {
      for (const id of owned) {
        const response = await request.get(`/api/notes/${id}`);
        if (response.status() === 404) continue;
        const note = noteDetailSchema.parse(await response.json());
        await request.delete(`/api/notes/${id}`, {
          data: { expectedRevision: note.revision },
        });
      }
    }
  },
});
export { expect } from '@playwright/test';
