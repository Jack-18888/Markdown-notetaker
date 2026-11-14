import { listItemSchema } from '@milkdown/kit/preset/commonmark';
import { $view } from '@milkdown/kit/utils';

export const taskItemView = $view(
  listItemSchema.node,
  () => (node, view, getPos) => {
    const dom = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.contentEditable = 'false';
    const task = node.attrs.checked != null;
    const contentDOM = task ? document.createElement('div') : dom;
    if (task) {
      dom.dataset.taskItem = '';
      dom.append(checkbox, contentDOM);
    }

    const updateCheckbox = () => {
      checkbox.checked = node.attrs.checked;
      checkbox.setAttribute(
        'aria-label',
        `Task item checkbox for ${node.firstChild?.textContent || 'untitled task'}`,
      );
    };
    if (task) updateCheckbox();
    checkbox.addEventListener('change', () => {
      const pos = getPos();
      if (pos === undefined || !view.editable) return updateCheckbox();
      view.dispatch(
        view.state.tr.setNodeAttribute(pos, 'checked', checkbox.checked),
      );
    });

    return {
      dom,
      contentDOM,
      update(next) {
        if (next.type !== node.type || (next.attrs.checked != null) !== task)
          return false;
        node = next;
        if (task) updateCheckbox();
        return true;
      },
      stopEvent: (event) => event.target === checkbox,
      ignoreMutation: (mutation) => mutation.target === checkbox,
    };
  },
);
