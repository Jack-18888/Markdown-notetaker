import type { PhrasingContent } from 'mdast';
import katex from 'katex';

export function mathElement(source: string, display = false) {
  const root = document.createElement(display ? 'div' : 'span');
  root.className = 'folio-math';
  // A fresh macro map prevents one formula from mutating another.
  katex.render(source, root, {
    displayMode: display,
    trust: false,
    throwOnError: false,
    maxExpand: 200,
    maxSize: 20,
    macros: {},
  });
  return root;
}

export function inlineText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if ('value' in node) return node.value;
      if ('children' in node) return inlineText(node.children);
      if ('alt' in node) return node.alt ?? '';
      return '';
    })
    .join('');
}
