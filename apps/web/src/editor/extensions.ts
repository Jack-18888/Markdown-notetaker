import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { codeBlockConfig } from '@milkdown/kit/component/code-block';
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
  insertImageInputRule,
  linkSchema,
  syncHeadingIdPlugin,
} from '@milkdown/kit/preset/commonmark';
import type { EditorView } from '@milkdown/kit/prose/view';
import { literalCodeBlock, mermaidSchema } from './code-blocks.js';
import {
  crepePlaygroundBridge,
  diagramIcon,
  insertMermaidDiagram,
} from './crepe-bridge.js';
import { isSafeLink } from './links.js';
import { loadMarkdown, type LoadedMarkdown } from './markdown.js';
import {
  parseMarkdownPaste,
  shouldParseClipboardAsMarkdown,
} from './markdown-paste.js';
import { mermaidView } from './mermaid-node-view.js';
import { assessSource } from './source-policy.js';
import { localImage, localImageView } from './images.js';
import {
  clipboardImages,
  type ClipboardImageOptions,
} from './clipboard-images.js';

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

type RichDocument = Extract<LoadedMarkdown, { mode: 'rich' }>;

export function openEditor({
  root,
  source,
  interactive = false,
  onTransaction,
  onBodyWork,
  onMessage,
}: {
  root: HTMLElement;
  source: string;
  interactive?: boolean;
  onTransaction?: (view: EditorView, previous: EditorView['state']) => void;
} & Pick<ClipboardImageOptions, 'onBodyWork' | 'onMessage'>) {
  const reason = assessSource(source);
  if (reason) {
    const loaded = { mode: 'source', source, reason } as const;
    return { ready: Promise.resolve({ loaded }), close() {} };
  }
  const host = document.createElement('div');
  root.append(host);
  const crepe = new Crepe({
    root: host,
    features: {
      [CrepeFeature.Cursor]: interactive,
      [CrepeFeature.ListItem]: interactive,
      [CrepeFeature.LinkTooltip]: interactive,
      [CrepeFeature.ImageBlock]: false,
      [CrepeFeature.BlockEdit]: interactive,
      [CrepeFeature.Placeholder]: interactive,
      [CrepeFeature.Toolbar]: interactive,
      [CrepeFeature.CodeMirror]: true,
      [CrepeFeature.Table]: interactive,
      [CrepeFeature.Latex]: true,
      [CrepeFeature.TopBar]: false,
      [CrepeFeature.AI]: false,
    },
    featureConfigs: {
      [CrepeFeature.Placeholder]: {
        text: 'Start writing, or type / for blocks',
        mode: 'doc',
      },
      [CrepeFeature.BlockEdit]: {
        advancedGroup: { image: null },
        buildMenu(builder) {
          builder.getGroup('advanced').addItem('diagram', {
            label: 'Mermaid Diagram',
            icon: diagramIcon,
            onRun: insertMermaidDiagram,
          });
        },
      },
      [CrepeFeature.CodeMirror]: {
        previewToggleText: (previewOnly) => (previewOnly ? 'Edit' : 'Hide'),
      },
      [CrepeFeature.Latex]: {
        katexOptions: { trust: false },
      },
    },
  });
  const editor = crepe.editor;
  const initial: { loaded: LoadedMarkdown } = {
    loaded: { mode: 'source', source, reason: 'conversion-failed' },
  };
  if (interactive) editor.use(mermaidView);
  if (interactive) editor.use(clipboardImages({ onBodyWork, onMessage }));
  editor
    .use([
      mermaidSchema,
      ...literalCodeBlock,
      ...safeLink,
      ...localImage,
      localImageView,
      crepePlaygroundBridge,
    ])
    .config((ctx) => {
      // Remove Crepe's default dark theme extension while retaining keymaps and highlight styles.
      ctx.update(codeBlockConfig.key, (config) => ({
        ...config,
        extensions: config.extensions.slice(0, 2),
      }));
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
          onTransaction?.(this, previous);
        },
        handlePaste(view, event) {
          if (view.state.selection.$from.parent.type.spec.code) return false;
          const clipboard = event.clipboardData;
          if (!clipboard) return false;
          const text = shouldParseClipboardAsMarkdown(clipboard);
          if (!text) return false;
          const slice = parseMarkdownPaste(text, ctx, {
            allowTopLevelMermaid: view.state.selection.$from.depth <= 1,
          });
          if (!slice) return false;
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
