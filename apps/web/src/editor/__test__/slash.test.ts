// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { slashQuery } from '../slash.js';
import { rich, select } from './editor-fixture.js';

it('offers slash insertion only at the start of an editable paragraph', async () => {
  const { view, close } = await rich(
    '/heading 2\n\ntext /quote\n\n```\n/code\n```\n\n`/inline`',
  );
  try {
    select(view, 11);
    expect(slashQuery(view)).toEqual({
      query: 'heading 2',
      range: { from: 1, to: 11 },
    });
    select(view, 24);
    expect(slashQuery(view)).toBeNull();
    select(view, view.state.doc.content.size - 1);
    expect(slashQuery(view)).toBeNull();
    select(view, 1, 3);
    expect(slashQuery(view)).toBeNull();
    select(view, 11);
    view.setProps({ editable: () => false });
    expect(slashQuery(view)).toBeNull();
  } finally {
    close();
  }
});
