import { createRoot } from 'react-dom/client';
import { closeHistory, redo, undo } from '@milkdown/kit/prose/history';
import { Selection } from '@milkdown/kit/prose/state';
import { $view } from '@milkdown/kit/utils';
import { mermaidSchema } from './code-blocks.js';
import MermaidView from './MermaidView.js';

export const mermaidView = $view(mermaidSchema, () => (node, view, getPos) => {
  const dom = document.createElement('div');
  dom.contentEditable = 'false';
  dom.dataset.mermaidEditor = '';
  const root = createRoot(dom);
  let current = node;
  const render = () =>
    root.render(
      <MermaidView
        source={current.attrs.source}
        onChange={(source) => {
          const pos = getPos();
          if (pos !== undefined && view.editable)
            view.dispatch(
              view.state.tr.setNodeAttribute(pos, 'source', source),
            );
        }}
        onHistory={(forward) =>
          (forward ? redo : undo)(view.state, view.dispatch)
        }
        onRemove={() => {
          const pos = getPos();
          if (pos === undefined || !view.editable) return;
          const tr = closeHistory(view.state.tr).delete(
            pos,
            pos + current.nodeSize,
          );
          view.dispatch(
            tr
              .setSelection(
                Selection.near(
                  tr.doc.resolve(Math.min(pos, tr.doc.content.size)),
                ),
              )
              .scrollIntoView(),
          );
          view.focus();
        }}
      />,
    );
  render();
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      if (!next.eq(current)) {
        current = next;
        render();
      }
      return true;
    },
    stopEvent: () => true,
    ignoreMutation: () => true,
    destroy: () => queueMicrotask(() => root.unmount()),
  };
});
