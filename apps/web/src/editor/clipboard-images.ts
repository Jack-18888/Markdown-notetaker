import { imageLimits, imageMimeSchema } from '@markdown-note-taker/contracts';
import { Plugin } from '@milkdown/kit/prose/state';
import { closeHistory } from '@milkdown/kit/prose/history';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $nodeSchema, $prose, $view } from '@milkdown/kit/utils';
import { uploadImage } from '../workspace/api.js';
import type { PendingBodyWork } from '../workspace/SaveCoordinator.js';

const imageUpload = $nodeSchema('image_upload', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { id: { default: '' } },
  parseDOM: [],
  toDOM: () => ['span', 'Uploading image…'],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node) => node.type.name === 'image_upload',
    runner: () => {
      throw new Error('Image upload is pending.');
    },
  },
}));

interface UploadTask {
  file: File;
  controller: AbortController;
  failed: boolean;
}
export interface ClipboardImageOptions {
  onBodyWork?: ((work: PendingBodyWork | null) => void) | undefined;
  onMessage?: ((message: string) => void) | undefined;
  upload?: typeof uploadImage;
}

/** One controller per mounted editor; clipboard bytes never enter Markdown. */
export function clipboardImages(options: ClipboardImageOptions) {
  const tasks = new Map<string, UploadTask>();
  const files = new Map<string, File>();
  const renders = new Map<string, () => void>();
  const waiters = new Set<() => void>();
  let view: EditorView;
  let disposed = false;
  const work: PendingBodyWork = {
    async wait() {
      while (!disposed && tasks.size) {
        if ([...tasks.values()].some((task) => task.failed)) return false;
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
      return !disposed;
    },
  };
  const notify = () => {
    for (const render of renders.values()) render();
    for (const resolve of waiters) resolve();
    waiters.clear();
    options.onBodyWork?.(tasks.size ? work : null);
  };
  const position = (id: string) => {
    let found: number | undefined;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image_upload' && node.attrs.id === id)
        found = pos;
    });
    return found;
  };
  const start = async (id: string, task: UploadTask) => {
    task.failed = false;
    notify();
    try {
      const uploaded = await (options.upload ?? uploadImage)(
        task.file,
        task.controller.signal,
      );
      if (disposed || task.controller.signal.aborted || tasks.get(id) !== task)
        return;
      const pos = position(id);
      if (pos === undefined) return;
      view.dispatch(
        view.state.tr
          .replaceWith(
            pos,
            pos + 1,
            view.state.schema.nodes.image!.create({
              src: uploaded.url,
              alt: 'Pasted image',
              title: '',
            }),
          )
          .setMeta('addToHistory', false),
      );
    } catch {
      if (disposed || task.controller.signal.aborted || tasks.get(id) !== task)
        return;
      task.failed = true;
      notify();
    }
  };
  const uploadView = $view(imageUpload.node, () => (node, editor) => {
    const id = node.attrs.id as string;
    const dom = document.createElement('span');
    dom.className = 'image-upload';
    dom.contentEditable = 'false';
    const label = document.createElement('span');
    label.setAttribute('role', 'status');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.setAttribute('aria-label', 'Retry image upload');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove pasted image');
    dom.append(label, retry, remove);
    const render = () => {
      const failed = tasks.get(id)?.failed ?? true;
      label.textContent = failed
        ? 'Image upload failed. '
        : 'Uploading image… ';
      retry.hidden = !failed;
    };
    retry.onclick = () => {
      const old = tasks.get(id);
      if (!old || !editor.editable) return;
      const task = { ...old, controller: new AbortController() };
      tasks.set(id, task);
      void start(id, task);
      editor.focus();
    };
    remove.onclick = () => {
      const pos = position(id);
      if (pos !== undefined && editor.editable) {
        editor.dispatch(closeHistory(editor.state.tr).delete(pos, pos + 1));
        editor.focus();
      }
    };
    renders.set(id, render);
    render();
    return {
      dom,
      stopEvent: (event) =>
        event.target instanceof Element && !!event.target.closest('button'),
      ignoreMutation: () => true,
      selectNode() {
        dom.classList.add('ProseMirror-selectednode');
      },
      deselectNode() {
        dom.classList.remove('ProseMirror-selectednode');
      },
      destroy() {
        renders.delete(id);
      },
    };
  });
  const paste = $prose(
    () =>
      new Plugin({
        props: {
          handlePaste(editor, event) {
            if (editor.state.selection.$from.parent.type.spec.code)
              return false;
            const pasted = Array.from(event.clipboardData?.files ?? []);
            if (!pasted.length) return false;
            const file = pasted[0]!;
            if (
              pasted.length !== 1 ||
              !imageMimeSchema.safeParse(file.type).success ||
              !file.size ||
              file.size > imageLimits.bytes
            ) {
              options.onMessage?.(
                'Paste one PNG, JPEG, or WebP image of 5 MiB or less.',
              );
              return true;
            }
            options.onMessage?.('');
            const id = crypto.randomUUID();
            const task = {
              file,
              controller: new AbortController(),
              failed: false,
            };
            tasks.set(id, task);
            files.set(id, file);
            editor.dispatch(
              closeHistory(editor.state.tr).replaceSelectionWith(
                editor.state.schema.nodes.image_upload!.create({ id }),
              ),
            );
            void start(id, task);
            return true;
          },
        },
        view(editor) {
          view = editor;
          return {
            update(editor) {
              view = editor;
              const ids = new Set<string>();
              editor.state.doc.descendants((node) => {
                if (node.type.name === 'image_upload') ids.add(node.attrs.id);
              });
              let changed = false;
              for (const [id, task] of tasks) {
                if (!ids.has(id)) {
                  task.controller.abort();
                  tasks.delete(id);
                  changed = true;
                }
              }
              for (const id of ids) {
                const file = files.get(id);
                if (!tasks.has(id) && file) {
                  tasks.set(id, {
                    file,
                    controller: new AbortController(),
                    failed: true,
                  });
                  changed = true;
                }
              }
              if (changed) notify();
            },
            destroy() {
              disposed = true;
              for (const task of tasks.values()) task.controller.abort();
              tasks.clear();
              files.clear();
              renders.clear();
              notify();
            },
          };
        },
      }),
  );
  return [imageUpload, uploadView, paste].flat();
}
