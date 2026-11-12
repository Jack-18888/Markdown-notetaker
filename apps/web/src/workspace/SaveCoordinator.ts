import type { Node } from '@tiptap/pm/model';
import {
  ApiErrorCode,
  nameSchema,
  type NoteDetail,
  type UpdateNoteRequest,
} from '@markdown-note-taker/contracts';
import { updateNote, WorkspaceRequestError } from './api.js';

export interface BodySnapshot {
  node: Node;
  serialize(): string;
}
export interface SaveState {
  note: NoteDetail;
  title: string;
  dirty: boolean;
  hasBody: boolean;
  status: 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
  message: string;
}
type Writer = (
  id: NoteDetail['id'],
  input: UpdateNoteRequest,
  signal: AbortSignal,
) => Promise<NoteDetail>;
export const saveDelay = 750;

/** Owns one note/revision. Editor snapshots are immutable and serialized only when submitted. */
export class SaveCoordinator {
  private state: SaveState;
  private body: BodySnapshot | null = null;
  private savedBody: BodySnapshot | null = null;
  private uncertain = false;
  private disposed = false;
  private changedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;
  private inFlight: Promise<boolean> | null = null;
  private flushing: Promise<NoteDetail | null> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    note: NoteDetail,
    private write: Writer = updateNote,
  ) {
    this.state = {
      note,
      title: note.title,
      dirty: false,
      hasBody: false,
      status: 'saved',
      message: '',
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private dirty() {
    return (
      this.uncertain ||
      this.state.title !== this.state.note.title ||
      !!(this.body && this.savedBody && !this.body.node.eq(this.savedBody.node))
    );
  }
  private publish(patch: Partial<SaveState> = {}) {
    this.state = {
      ...this.state,
      ...patch,
      dirty: this.dirty(),
      hasBody: this.body !== null,
    };
    for (const listener of this.listeners) listener();
  }
  attachBody(body: BodySnapshot) {
    if (this.disposed) return;
    // Editor reattachment can create a new schema. A pending title/request must
    // not keep the old schema's baseline when the body itself is unchanged.
    const unchanged =
      this.body && this.savedBody && this.body.node.eq(this.savedBody.node);
    if (!this.body || !this.state.dirty || unchanged) this.savedBody = body;
    this.body = body;
    this.publish();
  }
  setBody(body: BodySnapshot) {
    if (!this.disposed) {
      this.body = body;
      this.edited();
    }
  }
  setTitle(title: string) {
    if (!this.disposed) {
      this.state = { ...this.state, title };
      this.edited();
    }
  }
  private edited() {
    this.changedAt = Date.now();
    const blocked = this.state.status === 'conflict';
    this.publish(
      blocked || this.inFlight
        ? {}
        : { status: this.dirty() ? 'pending' : 'saved', message: '' },
    );
    this.schedule();
  }
  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private schedule() {
    this.clearTimer();
    if (
      this.disposed ||
      !this.dirty() ||
      this.inFlight ||
      this.flushing ||
      ['error', 'conflict'].includes(this.state.status)
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.saveOnce().then((ok) => {
          if (ok) this.schedule();
        });
      },
      Math.max(0, this.changedAt + saveDelay - Date.now()),
    );
  }
  private saveOnce(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (this.disposed || this.state.status === 'conflict')
      return Promise.resolve(false);
    const { note, title } = this.state;
    const body = this.body;
    const bodyChanged = !!(
      body &&
      this.savedBody &&
      !body.node.eq(this.savedBody.node)
    );
    if (!nameSchema.safeParse(title).success) {
      this.publish({
        status: 'error',
        message:
          'Use 1–200 characters without surrounding spaces or control characters.',
      });
      return Promise.resolve(false);
    }
    let input: UpdateNoteRequest;
    try {
      input = {
        expectedRevision: note.revision,
        ...(title !== note.title ? { title } : {}),
        ...(bodyChanged ? { content: body!.serialize() } : {}),
      };
      // An ambiguous failed write still needs a revision-checked acknowledgement.
      if (this.uncertain && !bodyChanged && title === note.title)
        input.title = title;
    } catch {
      this.publish({
        status: 'error',
        message:
          'This edit cannot be saved safely. Your writing is still here; undo the last change and try again.',
      });
      return Promise.resolve(false);
    }
    const controller = new AbortController();
    this.request = controller;
    this.uncertain = true;
    this.inFlight = Promise.resolve().then(async () => {
      try {
        const saved = await this.write(note.id, input, controller.signal);
        if (this.disposed || controller.signal.aborted) return false;
        if (bodyChanged) this.savedBody = body;
        this.uncertain = false;
        this.state = { ...this.state, note: saved };
        this.publish({
          status: this.dirty() ? 'pending' : 'saved',
          message: '',
        });
        return true;
      } catch (error) {
        if (!this.disposed && !controller.signal.aborted) {
          const conflict =
            error instanceof WorkspaceRequestError &&
            [ApiErrorCode.REVISION_CONFLICT, ApiErrorCode.NOT_FOUND].includes(
              error.code as ApiErrorCode,
            );
          this.publish({
            status: conflict ? 'conflict' : 'error',
            message:
              error instanceof WorkspaceRequestError
                ? error.message
                : 'The note could not be saved. Your changes are still here.',
          });
        }
        return false;
      } finally {
        if (!this.disposed) {
          this.request = null;
          this.inFlight = null;
        }
      }
    });
    this.publish({ status: 'saving', message: '' });
    return this.inFlight;
  }
  /** Shared by explicit save and navigation: wait for the request, then drain every newer snapshot. */
  flush = (): Promise<NoteDetail | null> => {
    this.clearTimer();
    if (this.flushing) return this.flushing;
    const drain = async () => {
      while (!this.disposed && (this.dirty() || this.inFlight)) {
        if (!(await (this.inFlight ?? this.saveOnce()))) return null;
      }
      return this.disposed ? null : this.state.note;
    };
    this.flushing = drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  };
  localContent() {
    return this.body &&
      this.savedBody &&
      !this.body.node.eq(this.savedBody.node)
      ? this.body.serialize()
      : this.state.note.content;
  }
  dispose() {
    this.disposed = true;
    this.clearTimer();
    this.request?.abort();
    this.listeners.clear();
  }
}
