import { createRoot } from 'react-dom/client';
import { closeHistory } from '@tiptap/pm/history';
import { MermaidBlock } from './code-blocks.js';
import MermaidView from './MermaidView.js';

/** Adds browser UI without changing the conversion schema or Markdown representation. */
export const MermaidEditorBlock = MermaidBlock.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
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
              if (typeof pos === 'number' && editor.isEditable)
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...current.attrs,
                    source,
                  }),
                );
            }}
            onHistory={(redo) => {
              if (redo) editor.commands.redo();
              else editor.commands.undo();
            }}
            onRemove={() => {
              const pos = getPos();
              if (typeof pos === 'number' && editor.isEditable) {
                editor.view.dispatch(closeHistory(editor.state.tr));
                editor
                  .chain()
                  .focus()
                  .deleteRange({ from: pos, to: pos + current.nodeSize })
                  .run();
              }
            }}
          />,
        );
      render();
      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          render();
          return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy() {
          queueMicrotask(() => root.unmount());
        },
      };
    };
  },
});
