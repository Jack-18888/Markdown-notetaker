import { describe, expect, it } from 'vitest';
import { mermaidSources } from '../mermaid-source.js';

describe('diagram payload recovery from top-level tokens', () => {
  it.each(['\n', '\r\n', '\r'])(
    'ignores fence-looking code inside a list and retains original payload bytes (%j)',
    (ending) => {
      const payload = ['flowchart LR', '  RIGHT --> B  ', ''].join(ending);
      const source = [
        '# Before 😀',
        '',
        '- ~~~text',
        '  ```mermaid',
        '  WRONG',
        '  ```',
        '  ~~~',
        '',
        '```mermaid',
        payload,
        '```',
      ].join(ending);
      expect(mermaidSources(source)).toEqual([payload]);
    },
  );
  it('does not promote a literal diagram inside a list', () => {
    expect(
      mermaidSources('- ~~~text\n  ```mermaid\n  WRONG\n  ```\n  ~~~'),
    ).toEqual([]);
  });
  it('maps mixed line endings and repeated code payloads to their own positions', () => {
    const source =
      'Before\r\n\n```text\rA --> B\r```\n\n~~~mermaid\r\nA --> B  \r\n~~~\r\n\n```mermaid\rA --> C\r```';
    expect(mermaidSources(source)).toEqual(['A --> B  ', 'A --> C']);
  });
});
