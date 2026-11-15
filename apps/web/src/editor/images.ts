import { isLocalImageUrl } from '@markdown-note-taker/contracts';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { $view } from '@milkdown/kit/utils';

export const localImage = imageSchema.extendSchema((base) => (ctx) => ({
  ...base(ctx),
  draggable: false,
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom) => {
        const src = dom.getAttribute('src');
        return isLocalImageUrl(src)
          ? {
              src,
              alt: dom.getAttribute('alt') ?? '',
              title: dom.getAttribute('title') ?? '',
            }
          : false;
      },
    },
  ],
  toDOM: (node) =>
    isLocalImageUrl(node.attrs.src)
      ? [
          'img',
          { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title },
        ]
      : ['span', 'Image unavailable'],
}));

export const localImageView = $view(imageSchema.node, () => (node) => {
  const dom = document.createElement('span');
  dom.className = 'note-image';
  dom.contentEditable = 'false';
  const img = document.createElement('img');
  const error = document.createElement('span');
  error.className = 'note-image-error';
  error.hidden = true;
  dom.append(img, error);
  const render = (current: typeof node) => {
    img.alt = current.attrs.alt;
    img.title = current.attrs.title;
    error.textContent = `Image unavailable: ${current.attrs.alt || 'Pasted image'}`;
    const src = current.attrs.src;
    if (isLocalImageUrl(src)) {
      if (img.getAttribute('src') !== src) {
        img.hidden = false;
        error.hidden = true;
        img.src = src;
      }
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      error.hidden = false;
    }
  };
  img.addEventListener('error', () => {
    img.hidden = true;
    error.hidden = false;
  });
  render(node);
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      render(next);
      return true;
    },
    selectNode() {
      dom.classList.add('ProseMirror-selectednode');
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode');
    },
    ignoreMutation: () => true,
  };
});
