// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MarkdownConversionError } from '../markdown.js';
import { supportedFixtures } from './fixtures.js';
import { open, rich } from './editor-fixture.js';

describe('source-retaining conversion boundary', () => {
  it.each(supportedFixtures)(
    'keeps %s editable through load, edit, and reopen',
    async (_name, source) => {
      const { loaded, view, close } = await rich(source);
      try {
        expect(loaded.serialize(view.state.doc)).toBe(source);
        const { doc, schema } = view.state;
        const updated = view.state.tr.insert(
          doc.content.size,
          schema.node('paragraph', null, schema.text('Another paragraph')),
        ).doc;
        const reopened = await rich(loaded.serialize(updated));
        try {
          expect(reopened.loaded.document.toJSON()).toEqual(updated.toJSON());
        } finally {
          reopened.close();
        }
      } finally {
        close();
      }
    },
  );

  it.each([
    '',
    '# Heading\r\n\r\nText.  \r\nNext\r\n',
    '- item\n\n\n- second\n',
    '~~~js\nconst example = 1;\n~~~\n',
    '- Calculate with `$x$`',
    '> - Literal `$x$` in a quote',
  ])('returns untouched original source %#', async (source) => {
    const { loaded, close } = await rich(source);
    try {
      expect(loaded.serialize(loaded.document)).toBe(source);
    } finally {
      close();
    }
  });

  it.each([
    '<script>alert(1)</script>',
    '![image](https://example.com/image.png)',
    '---\r\ntitle: Original\r\n---\r\nBody',
    '[unsafe](javascript:alert%281%29)',
    '\ufeff# Preserved',
    '> ```mermaid\n> A --> B\n> ```',
    '```mermaid\nA --> B',
  ])(
    'retains fallback bytes and exposes no lossy document %#',
    async (source) => {
      const instance = await open(source);
      try {
        expect(instance.loaded.mode).toBe('source');
        expect(instance.loaded.source).toBe(source);
        expect(instance.loaded).not.toHaveProperty('document');
        expect(instance.loaded).not.toHaveProperty('serialize');
      } finally {
        instance.close();
      }
    },
  );

  it.each(['\n', '\r\n', '\r'])(
    'retains exact diagram payloads across other body edits (%j)',
    async (ending) => {
      const diagram = ['flowchart LR', '  A --> B  ', ''].join(ending);
      const source = ['Before', '', '~~~mermaid', diagram, '~~~', ''].join(
        ending,
      );
      const { loaded, view, close } = await rich(source);
      try {
        expect(loaded.document.child(1).attrs.source).toBe(diagram);
        const saved = loaded.serialize(
          view.state.tr.insertText('After ', 1).doc,
        );
        expect(saved).not.toBe(source);
        const reopened = await rich(saved);
        try {
          expect(reopened.loaded.document.child(1).attrs.source).toBe(diagram);
        } finally {
          reopened.close();
        }
      } finally {
        close();
      }
    },
  );

  it('preserves multiple diagrams and embedded fences after a text edit', async () => {
    const { loaded, view, close } = await rich(
      '````mermaid\nA["```"] --> B\n````\n\nBetween\n\n```mermaid\nsequenceDiagram\nA->>B: Hi\n```',
    );
    try {
      const updated = view.state.tr.insertText(
        'Edited ',
        view.state.doc.child(0).nodeSize + 1,
      ).doc;
      const reopened = await rich(loaded.serialize(updated));
      try {
        expect(reopened.loaded.document.child(0).attrs.source).toBe(
          'A["```"] --> B',
        );
        expect(reopened.loaded.document.child(2).attrs.source).toBe(
          'sequenceDiagram\nA->>B: Hi',
        );
      } finally {
        reopened.close();
      }
    } finally {
      close();
    }
  });

  it.each([
    ['# Heading', 0, 'level', 2],
    ['- [ ] task', 1, 'checked', true],
    ['```mermaid\nA --> B\n```', 0, 'source', 'A --> C'],
    ['```text\nLiteral code\n```', 0, 'language', 'js'],
  ] as const)(
    'serializes attribute-only edits: %s',
    async (source, pos, attribute, value) => {
      const { loaded, view, close } = await rich(source);
      try {
        const updated = view.state.tr.setNodeAttribute(
          pos,
          attribute,
          value,
        ).doc;
        const saved = loaded.serialize(updated);
        expect(saved).not.toBe(source);
        const reopened = await rich(saved);
        try {
          expect(reopened.loaded.document.toJSON()).toEqual(updated.toJSON());
        } finally {
          reopened.close();
        }
        expect(loaded.serialize(loaded.document)).toBe(source);
      } finally {
        close();
      }
    },
  );

  it('refuses unsafe links, invalid attributes, unsupported nodes, and excessive nesting', async () => {
    const { loaded, view, close } = await rich('Original');
    try {
      const { schema } = view.state;
      const unsafe = schema.node(
        'paragraph',
        null,
        schema.text('Unsafe', [
          schema.mark('link', { href: 'javascript:alert(1)' }),
        ]),
      );
      let nested = schema.node('paragraph');
      for (let depth = 0; depth < 40; depth++)
        nested = schema.node('blockquote', null, nested);
      for (const node of [
        schema.node(
          'paragraph',
          null,
          schema.node('image', { src: 'https://example.com/image.png' }),
        ),
        unsafe,
        schema.node(
          'blockquote',
          null,
          schema.node('mermaid', { source: 'A --> B' }),
        ),
        schema.node('code_block', { language: 'js\n```' }),
        nested,
      ])
        expect(() => loaded.serialize(schema.node('doc', null, node))).toThrow(
          MarkdownConversionError,
        );
      expect(loaded.serialize(loaded.document)).toBe('Original');
    } finally {
      close();
    }
  });
});
