// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { diagramIssue, diagramLimits } from '../diagram-policy.js';

it('bounds preview work and rejects diagram-supplied configuration without changing source', () => {
  expect(diagramIssue('flowchart LR\n A --> B')).toBeNull();
  expect(diagramIssue('')).toContain('Write Mermaid');
  expect(diagramIssue('é'.repeat(diagramLimits.bytes / 2))).toBeNull();
  expect(diagramIssue('é'.repeat(diagramLimits.bytes / 2) + 'x')).toContain(
    'too large',
  );
  expect(diagramIssue('A;'.repeat(diagramLimits.statements))).toContain(
    'too large',
  );
  for (const source of [
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A --> B',
    '---\nconfig:\n securityLevel: loose\n---\nflowchart LR',
    'flowchart LR\n classDef a fill:url(https://example.com)',
  ])
    expect(diagramIssue(source)).toContain('disabled');
});
