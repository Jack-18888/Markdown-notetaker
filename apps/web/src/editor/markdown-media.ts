import { decodeHtmlEntities, Node } from '@tiptap/core';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Selection } from '@tiptap/pm/state';
import type { EditorProps } from '@tiptap/pm/view';
import { isSafeLink } from './links.js';
import { anchorId } from './markdown-lexer.js';

export function isSafeImageSource(source: string): boolean {
  return isSafeLink(source) && !/^(mailto:|#)|[<>]/i.test(source);
}

// Tiptap's paragraph handler unwraps standalone images for block image schemas.
export const ImageParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    if (token.tokens?.length === 1 && token.tokens[0]?.type === 'image')
      return helpers.createNode(
        this.name,
        {},
        helpers.parseInline(token.tokens),
      );
    return this.parent?.(token, helpers) ?? [];
  },
});

// Raw notes carry a URL, not the file's directory or its sibling attachments.
// These two references have matching, bundled assets in the project.
const bundledImages = new Map([
  [
    'editor-ui-redesign/desktop.png',
    new URL(
      '../../../../roadmaps/editor-ui-redesign/desktop.png',
      import.meta.url,
    ).href,
  ],
  [
    'editor-ui-redesign/mobile.png',
    new URL(
      '../../../../roadmaps/editor-ui-redesign/mobile.png',
      import.meta.url,
    ).href,
  ],
]);

export const MarkdownImage = Node.create({
  name: 'markdownImage',
  group: 'inline',
  inline: true,
  atom: true,
  markdownTokenName: 'image',
  addAttributes() {
    return {
      src: { default: '', rendered: false },
      alt: { default: '', rendered: false },
      title: { default: null, rendered: false },
    };
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode(this.name, {
      src: token.href,
      alt: token.text ?? '',
      title: token.title || null,
    });
  },
  renderMarkdown(node) {
    const { src, alt, title } = node.attrs!;
    const label = alt.replace(/[\\[\]]/g, '\\$&');
    const caption = title ? ` "${title.replace(/[\\"]/g, '\\$&')}"` : '';
    return `![${label}](<${src}>${caption})`;
  },
  renderHTML({ node }) {
    const { src, alt, title } = node.attrs;
    const description = decodeHtmlEntities(alt);
    const image = bundledImages.get(src);
    return image
      ? [
          'img',
          { class: 'markdown-image', src: image, alt: description, title },
        ]
      : [
          'span',
          {
            class: 'markdown-image-reference',
            role: 'img',
            'aria-label': description || 'Image reference',
          },
          description || src,
        ];
  },
});

export const MarkdownAnchor = Node.create({
  name: 'markdownAnchor',
  group: 'block',
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: '', rendered: false } };
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode(this.name, { id: token.id });
  },
  renderMarkdown(node) {
    return `<a id="${node.attrs?.id}"></a>`;
  },
  renderHTML({ node }) {
    const id = node.attrs.id;
    return [
      'div',
      {
        'data-markdown-anchor': anchorId.test(id) ? id : '',
        'aria-hidden': 'true',
      },
    ];
  },
});

/** Follow named fragments within this editor without changing the app URL. */
export const followMarkdownAnchor: NonNullable<
  NonNullable<EditorProps['handleDOMEvents']>['click']
> = (view, event) => {
  if (
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !(event.target instanceof Element)
  )
    return false;
  const href = event.target.closest('a')?.getAttribute('href');
  if (!href?.startsWith('#') || !anchorId.test(href.slice(1))) return false;
  const target = view.dom.querySelector(
    `[data-markdown-anchor="${href.slice(1)}"]`,
  );
  if (!target) return false;
  event.preventDefault();
  const position = view.posAtDOM(target, 0);
  const selection = Selection.near(view.state.doc.resolve(position + 1));
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
  return true;
};
