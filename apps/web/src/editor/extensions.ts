import { CrepeBuilder } from '@milkdown/crepe/builder';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import {
  editorStateOptionsCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { listener } from '@milkdown/kit/plugin/listener';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { uploadConfig, uploadPlugin } from '@milkdown/kit/plugin/upload';
import {
  imageSchema,
  insertImageInputRule,
  linkSchema,
  syncHeadingIdPlugin,
} from '@milkdown/kit/preset/commonmark';
import { Slice } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { literalCodeBlock, mermaidSchema } from './code-blocks.js';
import { isSafeLink } from './links.js';
import { loadMarkdown, type LoadedMarkdown } from './markdown.js';
import { mermaidView } from './mermaid-node-view.js';
import { taskItemView } from './task-item.js';
import { notifyEditorTransaction } from './useEditorTransaction.js';
import { assessSource } from './source-policy.js';

const safeLink = linkSchema.extendSchema((base) => (ctx) => {
  const spec = base(ctx);
  return {
    ...spec,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = dom.getAttribute('href') ?? '';
          return isSafeLink(href)
            ? { href, title: dom.getAttribute('title') }
            : false;
        },
      },
    ],
    toDOM: (mark) =>
      isSafeLink(mark.attrs.href) ? spec.toDOM!(mark, true) : ['span', 0],
  };
});

const inertImage = imageSchema.extendSchema((base) => (ctx) => ({
  ...base(ctx),
  parseDOM: [],
  toDOM: () => ['span', { hidden: 'hidden' }],
}));

type RichDocument = Extract<LoadedMarkdown, { mode: 'rich' }>;

export function openEditor({
  root,
  source,
  interactive = false,
  onTransaction,
}: {
  root: HTMLElement;
  source: string;
  interactive?: boolean;
  onTransaction?: (view: EditorView, previous: EditorView['state']) => void;
}) {
  const reason = assessSource(source);
  if (reason) {
    const loaded = { mode: 'source', source, reason } as const;
    return { ready: Promise.resolve({ loaded }), close() {} };
  }
  const host = document.createElement('div');
  root.append(host);
  const crepe = new CrepeBuilder({ root: host });
  const editor = crepe.editor;
  const initial: { loaded: LoadedMarkdown } = {
    loaded: { mode: 'source', source, reason: 'conversion-failed' },
  };
  if (interactive) {
    crepe
      .addFeature(placeholder, {
        text: 'Your next idea starts here…',
        mode: 'doc',
      })
      .addFeature(table, {
        addRowIcon: '<span aria-label="Add table row">+</span>',
        addColIcon: '<span aria-label="Add table column">+</span>',
        deleteRowIcon: '<span aria-label="Delete table row">×</span>',
        deleteColIcon: '<span aria-label="Delete table column">×</span>',
        alignLeftIcon: '<span aria-label="Align table column left">←</span>',
        alignCenterIcon: '<span aria-label="Center table column">↔</span>',
        alignRightIcon: '<span aria-label="Align table column right">→</span>',
      });
    editor.use(mermaidView);
  }
  editor
    .use([
      mermaidSchema,
      ...literalCodeBlock,
      ...safeLink,
      ...inertImage,
      taskItemView,
    ])
    .config((ctx) => {
      ctx.update(remarkStringifyOptionsCtx, (options) => ({
        ...options,
        bullet: '-' as const,
        fences: true,
      }));
      ctx.update(uploadConfig.key, (options) => ({
        ...options,
        uploader: async () => [],
      }));
      ctx.set(editorStateOptionsCtx, (options) => {
        initial.loaded = loadMarkdown(source, ctx);
        return initial.loaded.mode === 'rich'
          ? { ...options, doc: initial.loaded.document }
          : options;
      });
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        editable: () => initial.loaded.mode === 'rich',
        attributes: {
          role: 'textbox',
          'aria-label': 'Note content',
          'aria-multiline': 'true',
          'aria-describedby': 'writing-help',
        },
        dispatchTransaction(this: EditorView, tr) {
          const previous = this.state;
          this.updateState(previous.apply(tr));
          notifyEditorTransaction(this);
          onTransaction?.(this, previous);
        },
        handlePaste(view, event) {
          if (view.state.selection.$from.parent.type.spec.code) return false;
          const clipboard = event.clipboardData;
          if (!clipboard) return false;
          const markdown = clipboard.getData('text/markdown');
          const text = markdown || clipboard.getData('text/plain');
          if (!text || (!markdown && clipboard.getData('text/html')))
            return false;
          const loaded = loadMarkdown(text, ctx);
          if (loaded.mode === 'source') return false;
          const content = loaded.document.content;
          const only = loaded.document.firstChild;
          const slice =
            loaded.document.childCount === 1 && only?.type.name === 'paragraph'
              ? new Slice(only.content, 0, 0)
              : new Slice(content, 0, 0);
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        },
      }));
    });

  let closed = false;
  const ready = (async () => {
    // The application owns safe paste and avoids synthetic trailing content.
    await editor.remove(
      [
        clipboard,
        uploadPlugin,
        trailing,
        syncHeadingIdPlugin,
        listener,
        insertImageInputRule,
      ].flat(),
    );
    if (closed) return null;
    await crepe.create();
    if (closed) return null;
    return editor.action(
      (
        ctx,
      ):
        | { loaded: RichDocument; view: EditorView }
        | { loaded: Extract<LoadedMarkdown, { mode: 'source' }> } =>
        initial.loaded.mode === 'rich'
          ? { loaded: initial.loaded, view: ctx.get(editorViewCtx) }
          : { loaded: initial.loaded },
    );
  })();

  return {
    ready,
    close() {
      if (closed) return;
      closed = true;
      host.remove();
      void ready.then(
        () => crepe.destroy(),
        () => undefined,
      );
    },
  };
}
