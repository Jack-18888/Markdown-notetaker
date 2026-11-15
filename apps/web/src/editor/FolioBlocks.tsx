import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  List,
  PhrasingContent,
  RootContent,
  Table,
  TableCell,
} from 'mdast';
import { FolioCode } from './FolioCode.js';
import { InlineEditor, RenameField, type References } from './FolioInline.js';
import { inlineText, mathElement } from './folio-inline-model.js';
import { isSafeLink } from './links.js';

function replacing<T>(list: readonly T[], index: number, next: T) {
  return list.map((item, position) => (position === index ? next : item));
}
const emptyCell = (): TableCell => ({ type: 'tableCell', children: [] });
const emptyParagraph = () => ({
  type: 'paragraph' as const,
  children: [] as PhrasingContent[],
});

function ListBlock({
  node,
  onChange,
  references,
  readonly,
}: {
  node: List;
  onChange(node: List, typing?: boolean): void;
  references: References;
  readonly: boolean;
}) {
  const Tag = node.ordered ? 'ol' : 'ul';
  return (
    <Tag start={node.ordered ? (node.start ?? 1) : undefined}>
      {node.children.map((item, index) => {
        const update = (next: typeof item, typing?: boolean) =>
          onChange(
            { ...node, children: replacing(node.children, index, next) },
            typing,
          );
        const first = item.children[0];
        const taskText =
          first?.type === 'paragraph'
            ? inlineText(first.children).trim().slice(0, 160)
            : '';
        return (
          <li
            key={index}
            className={
              typeof item.checked === 'boolean' ? 'folio-task' : undefined
            }
          >
            {typeof item.checked === 'boolean' && (
              <input
                type="checkbox"
                aria-label={
                  taskText
                    ? 'Task item checkbox for ' + taskText
                    : 'Task ' + (index + 1)
                }
                checked={item.checked}
                disabled={readonly}
                onChange={(event) =>
                  update({ ...item, checked: event.currentTarget.checked })
                }
              />
            )}
            <div className="folio-list-content">
              {item.children.map((child, position) => (
                <AstBlock
                  key={position}
                  node={child}
                  references={references}
                  readonly={readonly}
                  onChange={(value, typing) =>
                    update(
                      {
                        ...item,
                        children: replacing(
                          item.children,
                          position,
                          value as typeof child,
                        ),
                      },
                      typing,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key !== 'Enter' ||
                      event.shiftKey ||
                      readonly ||
                      child.type !== 'paragraph'
                    )
                      return;
                    event.preventDefault();
                    const items = node.children.slice();
                    items.splice(index + 1, 0, {
                      type: 'listItem',
                      checked: typeof item.checked === 'boolean' ? false : null,
                      children: [{ type: 'html', value: '<br />' }],
                    });
                    onChange({ ...node, children: items });
                    const current = event.currentTarget.closest('li');
                    requestAnimationFrame(() =>
                      current?.nextElementSibling
                        ?.querySelector<HTMLElement>('[role="textbox"]')
                        ?.focus(),
                    );
                  }}
                />
              ))}
              {item.children.length === 0 && (
                <InlineEditor
                  label="List item"
                  nodes={[]}
                  references={references}
                  readonly={readonly}
                  onChange={(children, typing) =>
                    update(
                      {
                        ...item,
                        children: [{ ...emptyParagraph(), children }],
                      },
                      typing,
                    )
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </Tag>
  );
}

function TableBlock({
  table,
  onChange,
  references,
  readonly,
}: {
  table: Table;
  onChange(table: Table, typing?: boolean): void;
  references: References;
  readonly: boolean;
}) {
  const width = table.children[0]?.children.length ?? 1;
  const rows = table.children;
  function rowView(row: (typeof rows)[number], r: number) {
    const Cell = r === 0 ? 'th' : 'td';
    return (
      <tr key={r}>
        {Array.from({ length: width }, (_, c) => {
          const cell = row.children[c] ?? emptyCell();
          return (
            <Cell
              key={c}
              scope={r === 0 ? 'col' : undefined}
              style={{ textAlign: table.align?.[c] ?? 'left' }}
            >
              <InlineEditor
                label={'Row ' + (r + 1) + ', column ' + (c + 1)}
                readonly={readonly}
                references={references}
                nodes={cell.children}
                onChange={(value, typing) => {
                  const cells = Array.from(
                    { length: width },
                    (_, index) => row.children[index] ?? emptyCell(),
                  );
                  const nextRow = {
                    ...row,
                    children: replacing(cells, c, { ...cell, children: value }),
                  };
                  onChange(
                    { ...table, children: replacing(rows, r, nextRow) },
                    typing,
                  );
                }}
                onKeyDown={(event) => {
                  if (!['Tab', 'Enter'].includes(event.key)) return;
                  const fields = [
                    ...(event.currentTarget
                      .closest('table')
                      ?.querySelectorAll<HTMLElement>('[role="textbox"]') ??
                      []),
                  ];
                  const index =
                    fields.indexOf(event.currentTarget) +
                    (event.shiftKey ? -1 : 1);
                  if (!fields[index]) return;
                  event.preventDefault();
                  fields[index].focus();
                }}
              />
              {!readonly && r === 0 && (
                <select
                  aria-label={'Align column ' + (c + 1)}
                  className="no-print folio-align"
                  value={table.align?.[c] ?? ''}
                  onChange={(event) => {
                    const value = event.currentTarget.value as
                      '' | 'left' | 'center' | 'right';
                    const align = Array.from(
                      { length: width },
                      (_, index) => table.align?.[index] ?? null,
                    );
                    onChange({
                      ...table,
                      align: replacing(align, c, value || null),
                    });
                  }}
                >
                  <option value="">Default</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              )}
            </Cell>
          );
        })}
      </tr>
    );
  }
  return (
    <div
      className="folio-table-frame"
      tabIndex={0}
      role="region"
      aria-label="Markdown table"
    >
      {!readonly && (
        <div className="folio-table-tools no-print">
          <button
            type="button"
            className="quiet-button"
            onClick={() =>
              onChange({
                ...table,
                children: [
                  ...rows,
                  {
                    type: 'tableRow',
                    children: Array.from({ length: width }, emptyCell),
                  },
                ],
              })
            }
          >
            Add row
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={rows.length < 2}
            onClick={() => onChange({ ...table, children: rows.slice(0, -1) })}
          >
            Remove last row
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() =>
              onChange({
                ...table,
                align: [
                  ...(table.align ?? Array.from({ length: width }, () => null)),
                  null,
                ],
                children: rows.map((row) => ({
                  ...row,
                  children: [...row.children, emptyCell()],
                })),
              })
            }
          >
            Add column
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={width < 2}
            onClick={() =>
              onChange({
                ...table,
                align: table.align?.slice(0, -1) ?? null,
                children: rows.map((row) => ({
                  ...row,
                  children: row.children.slice(0, -1),
                })),
              })
            }
          >
            Remove last column
          </button>
        </div>
      )}
      <table>
        {rows[0] && <thead>{rowView(rows[0], 0)}</thead>}
        <tbody>
          {rows.slice(1).map((row, index) => rowView(row, index + 1))}
        </tbody>
      </table>
    </div>
  );
}

function MathPreview({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    host.current!.replaceChildren(mathElement(source, true));
  }, [source]);
  return <div className="folio-math-block" ref={host} />;
}

export function AstBlock({
  node,
  onChange,
  references,
  readonly,
  onKeyDown,
}: {
  node: RootContent;
  onChange(node: RootContent, typing?: boolean): void;
  references: References;
  readonly: boolean;
  onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
}): ReactNode {
  switch (node.type) {
    case 'heading':
    case 'paragraph': {
      const tag =
        node.type === 'heading'
          ? (('h' + node.depth) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')
          : 'p';
      const label =
        node.type === 'heading' ? 'Heading ' + node.depth : 'Paragraph';
      return (
        <InlineEditor
          as={tag}
          label={label}
          nodes={node.children}
          references={references}
          readonly={readonly}
          onChange={(children, typing) =>
            onChange({ ...node, children }, typing)
          }
          onKeyDown={onKeyDown}
        />
      );
    }
    case 'list':
      return (
        <ListBlock
          node={node}
          onChange={onChange}
          references={references}
          readonly={readonly}
        />
      );
    case 'table':
      return (
        <TableBlock
          table={node}
          onChange={onChange}
          references={references}
          readonly={readonly}
        />
      );
    case 'blockquote':
    case 'footnoteDefinition': {
      const content = node.children.map((child, index) => (
        <AstBlock
          key={index}
          node={child}
          references={references}
          readonly={readonly}
          onChange={(next, typing) =>
            onChange(
              {
                ...node,
                children: replacing(node.children, index, next as typeof child),
              },
              typing,
            )
          }
        />
      ));
      return node.type === 'blockquote' ? (
        <blockquote>{content}</blockquote>
      ) : (
        <section
          className="folio-definition"
          id={'footnote-' + encodeURIComponent(node.identifier)}
          aria-label={'Footnote definition ' + (node.label ?? node.identifier)}
        >
          <span className="folio-block-label">
            Footnote [{node.label ?? node.identifier}]
          </span>
          {content}
          {!readonly && (
            <RenameField
              label="Footnote definition label"
              value={node.label ?? node.identifier}
              onChange={(value) =>
                references.renameFootnote(node.identifier, value)
              }
            />
          )}
        </section>
      );
    }
    case 'definition':
      return (
        <section
          className="folio-definition"
          id={'reference-' + encodeURIComponent(node.identifier)}
          aria-label={'Link definition ' + (node.label ?? node.identifier)}
        >
          <span className="folio-block-label">
            Link definition [{node.label ?? node.identifier}]
          </span>
          {readonly ? (
            <span>{node.url}</span>
          ) : (
            <>
              <RenameField
                label="Reference URL"
                value={node.url}
                onChange={(url) => {
                  if (!isSafeLink(url))
                    throw new Error('Enter a safe link URL.');
                  onChange({ ...node, url });
                }}
              />
              <RenameField
                label="Reference title"
                value={node.title ?? ''}
                allowEmpty
                onChange={(title) =>
                  onChange({ ...node, title: title || null })
                }
              />
            </>
          )}
        </section>
      );
    case 'code':
      return (
        <FolioCode
          code={node.value}
          language={node.lang ?? ''}
          readonly={readonly}
          onCode={(value) => onChange({ ...node, value })}
          onLanguage={(lang) => {
            if (lang !== (node.lang ?? '')) onChange({ ...node, lang });
          }}
        />
      );
    case 'math':
      return (
        <section aria-label="Math formula">
          <MathPreview source={node.value} />
          {!readonly && (
            <RenameField
              label="Math source"
              value={node.value}
              onChange={(value) => onChange({ ...node, value })}
            />
          )}
        </section>
      );
    case 'thematicBreak':
      return <hr />;
    case 'html':
      if (/^<br \/>[ \t]*$/.test(node.value))
        return (
          <InlineEditor
            label="Empty paragraph"
            nodes={[]}
            references={references}
            readonly={readonly}
            onChange={(children) => onChange({ type: 'paragraph', children })}
          />
        );
      return <Literal source={node.value} />;
    default:
      return 'value' in node ? <Literal source={node.value} /> : null;
  }
}

export function Literal({ source }: { source: string }) {
  return (
    <pre className="folio-literal" tabIndex={0} aria-label="Literal Markdown">
      <code>{source}</code>
    </pre>
  );
}
