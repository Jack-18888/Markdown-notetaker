import { AllSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { openEditor } from '../extensions.js';

export async function open(source: string) {
  const host = document.createElement('div');
  document.body.append(host);
  let updates = 0;
  const instance = openEditor({
    root: host,
    source,
    onTransaction(view, previous) {
      if (!view.state.doc.eq(previous.doc)) updates++;
    },
  });
  const result = (await instance.ready)!;
  return {
    ...result,
    host,
    updates: () => updates,
    close: () => {
      instance.close();
      host.remove();
    },
  };
}

export async function rich(source = 'Original text') {
  const instance = await open(source);
  if (!('view' in instance)) {
    instance.close();
    throw new Error(`Expected editable fixture: ${instance.loaded.reason}`);
  }
  return instance;
}

export function select(view: EditorView, from?: number, to = from) {
  view.dispatch(
    view.state.tr.setSelection(
      from === undefined
        ? new AllSelection(view.state.doc)
        : TextSelection.create(view.state.doc, from, to),
    ),
  );
}
