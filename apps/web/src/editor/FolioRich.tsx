import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  alerts,
  alertSource,
  codeSource,
  codeValue,
  detailsSource,
  moveBlock,
  parseFolio,
  replaceBlock,
  writeNode,
  type Alert,
  type FolioBlock,
  type FolioDocument,
} from './folio-markdown.js';
import { FolioCode } from './FolioCode.js';
import { InlineEditor, RenameField, type References } from './FolioInline.js';
import { AstBlock, Literal } from './FolioBlocks.js';
import MermaidView from './MermaidView.js';

function SectionBlock({
  block,
  references,
  onChange,
  onHistory,
  readonly,
  level,
  onFailure,
}: {
  block: Extract<FolioBlock, { kind: 'details' | 'alert' }>;
  references: References;
  onChange(raw: string): void;
  onHistory(redo: boolean): void;
  readonly: boolean;
  level: number;
  onFailure?: ((message: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(
    block.kind === 'details' ? block.open : true,
  );
  const nested = level < 12 ? parseFolio(block.body) : null;
  const newline = block.raw.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  const body = nested ? (
    <FolioRich
      document={nested}
      onChange={(value) =>
        onChange(
          block.kind === 'details'
            ? detailsSource(block.summary, value, block.open, newline)
            : alertSource(block.variant, value, newline),
        )
      }
      references={references}
      onHistory={onHistory}
      readonly={readonly}
      level={level + 1}
      onFailure={onFailure}
    />
  ) : (
    <Literal source={block.body} />
  );
  if (block.kind === 'alert') {
    return (
      <aside
        className="folio-alert"
        data-alert={block.variant}
        aria-label={block.variant + ' alert'}
      >
        {readonly ? (
          <strong>{block.variant}</strong>
        ) : (
          <label className="folio-block-label">
            Alert type
            <select
              aria-label="Alert type"
              value={block.variant}
              onChange={(event) =>
                onChange(
                  alertSource(
                    event.currentTarget.value as Alert,
                    block.body,
                    newline,
                  ),
                )
              }
            >
              {alerts.map((variant) => (
                <option key={variant}>{variant}</option>
              ))}
            </select>
          </label>
        )}
        {body}
      </aside>
    );
  }
  return (
    <details
      className="folio-toggle"
      open={readonly || open}
      onToggle={(event) => {
        if (!readonly && event.target === event.currentTarget)
          setOpen(event.currentTarget.open);
      }}
    >
      <summary>{block.summary || 'Untitled section'}</summary>
      {!readonly && (
        <RenameField
          label="Section summary"
          value={block.summary}
          onChange={(value) =>
            onChange(detailsSource(value, block.body, block.open, newline))
          }
        />
      )}
      {body}
    </details>
  );
}

const fence = '\x60'.repeat(3);
// Folio's command names and search terms, with Markdown sources for insertion.
const commands = [
  ['Text', 'paragraph plain', '<br />'],
  ['Heading 1', 'h1 # title', '# Heading'],
  ['Heading 2', 'h2 ##', '## Heading'],
  ['Heading 3', 'h3 ###', '### Heading'],
  ['Bulleted list', 'bullet ul -', '- Item'],
  ['Numbered list', 'number ol 1.', '1. Item'],
  ['To-do checklist', 'task todo []', '- [ ] Item'],
  [
    'Toggle list',
    'details collapse',
    '<details open>\n<summary>Section</summary>\n\nText\n\n</details>',
  ],
  ['Callout', 'note alert tip', '> [!NOTE]\n> Text'],
  ['Quote', 'blockquote >', '> Quote'],
  ['Divider', 'separator ---', '---'],
  ['Code block', 'snippet fence', fence + 'typescript\n\n' + fence],
  ['Table', 'grid columns', '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |'],
  ['Image', 'photo media', '![Description](https://example.com/image.png)'],
  ['Mermaid Diagram', 'chart flowchart', fence + 'mermaid\n\n' + fence],
  ['Math formula', 'katex equation', '$$\nx^2\n$$'],
] as const;

const shortcuts: Record<string, string> = {
  '#': '# Heading',
  '##': '## Heading',
  '###': '### Heading',
  '####': '#### Heading',
  '#####': '##### Heading',
  '######': '###### Heading',
  '-': '- Item',
  '*': '- Item',
  '+': '- Item',
  '1.': '1. Item',
  '[]': '- [ ] Item',
  '[ ]': '- [ ] Item',
  '>': '> Quote',
  '---': '---',
  [fence]: fence + '\n\n' + fence,
};

export function FolioRich({
  document: parsed,
  onChange,
  onFailure,
  references,
  onHistory,
  readonly = false,
  level = 0,
}: {
  document: FolioDocument;
  onChange(source: string, typing?: boolean): void;
  onFailure?: ((message: string) => void) | undefined;
  references: References;
  onHistory(redo: boolean): void;
  readonly?: boolean;
  level?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    index: number;
    replace: boolean;
    query: string;
    selected: number;
  } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const filtered = menu
    ? commands.filter(([label, words]) =>
        (label + ' ' + words).toLowerCase().includes(menu.query.toLowerCase()),
      )
    : [];

  function focus(index: number) {
    requestAnimationFrame(() => {
      const block = host.current?.children[index];
      const field =
        block?.querySelector<HTMLElement>('[role="textbox"], textarea') ??
        block?.querySelector<HTMLElement>('summary, button');
      field?.focus();
      if (field?.isContentEditable)
        document.getSelection()?.selectAllChildren(field);
    });
  }

  function apply(change: () => string, typing?: boolean) {
    try {
      onChange(change(), typing);
      return true;
    } catch {
      const message =
        'This change could not be converted safely. Your draft is still here. Undo the change or continue in Editor.';
      onFailure?.(message);
      return false;
    }
  }

  function insert(index: number, raw: string, replace: boolean) {
    const newline = parsed.newline;
    const value = raw.replace(/\r\n|\r|\n/g, newline);
    const block = parsed.blocks[index];
    const change =
      replace || !block
        ? () => replaceBlock(parsed, index, value)
        : () =>
            replaceBlock(parsed, index, block.raw + newline.repeat(2) + value);
    if (apply(change)) focus(replace || !block ? index : index + 1);
    setMenu(null);
  }

  function move(from: number, to: number) {
    if (apply(() => moveBlock(parsed, from, to))) focus(to);
  }

  function blockKeys(index: number, event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || readonly) return;
    const value = event.currentTarget.textContent ?? '';
    if (event.key === '/' && !value && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setMenu({ index, replace: true, query: '', selected: 0 });
      return;
    }
    if (
      (event.key === ' ' || event.key === 'Enter') &&
      Object.hasOwn(shortcuts, value)
    ) {
      event.preventDefault();
      insert(index, shortcuts[value]!, true);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!parsed.blocks.length) {
        if (
          apply(() =>
            replaceBlock(
              parsed,
              0,
              ['<br />', '<br />'].join(parsed.newline.repeat(2)),
            ),
          )
        )
          focus(1);
      } else insert(index, '<br />', false);
    }
  }

  function selectCommand(choice?: (typeof commands)[number]) {
    if (choice && menu) insert(menu.index, choice[2], menu.replace);
  }

  const blocks: (FolioBlock | undefined)[] = parsed.blocks.length
    ? parsed.blocks
    : [undefined];

  return (
    <div
      className={level === 0 ? 'folio-blocks' : 'folio-blocks folio-nested'}
      ref={host}
    >
      {blocks.map((block, index) => {
        const update = (raw: string) =>
          apply(() => replaceBlock(parsed, index, raw));
        const ast = block?.kind === 'markdown' ? block.node : null;
        let content: ReactNode;
        if (!block || block.kind === 'blank' || ast?.type === 'paragraph') {
          content = (
            <InlineEditor
              as="p"
              label="Paragraph"
              nodes={ast?.type === 'paragraph' ? ast.children : []}
              references={references}
              readonly={readonly}
              onChange={(children, typing) =>
                apply(
                  () =>
                    replaceBlock(
                      parsed,
                      index,
                      children.length
                        ? writeNode(
                            { type: 'paragraph', children },
                            parsed.newline,
                          )
                        : block
                          ? '<br />'
                          : '',
                    ),
                  typing,
                )
              }
              onKeyDown={(event) => blockKeys(index, event)}
            />
          );
        } else if (block.kind === 'literal') {
          content = <Literal source={block.raw} />;
        } else if (block.kind === 'details' || block.kind === 'alert') {
          content = (
            <SectionBlock
              block={block}
              references={references}
              onChange={update}
              onHistory={onHistory}
              readonly={readonly}
              level={level}
              onFailure={onFailure}
            />
          );
        } else if (ast?.type === 'code') {
          const code = codeValue(block, ast.value);
          const codeChanged = (value: string, language: string) =>
            update(
              codeSource(block.raw, value, language, parsed.newline, ast.meta),
            );
          content =
            ast.lang === 'mermaid' && !readonly ? (
              <MermaidView
                source={code}
                onChange={(value) => codeChanged(value, 'mermaid')}
                onRemove={() => update('')}
                onHistory={onHistory}
              />
            ) : (
              <FolioCode
                code={code}
                language={ast.lang ?? ''}
                readonly={readonly}
                onCode={(value) => codeChanged(value, ast.lang ?? '')}
                onLanguage={(language) => {
                  if (language !== (ast.lang ?? ''))
                    codeChanged(code, language);
                }}
              />
            );
        } else if (ast) {
          content = (
            <AstBlock
              node={ast}
              onChange={(value, typing) =>
                apply(
                  () =>
                    replaceBlock(
                      parsed,
                      index,
                      value.type === 'paragraph' && !value.children.length
                        ? '<br />'
                        : value.type === 'heading' && !value.children.length
                          ? '#'.repeat(value.depth)
                          : writeNode(value, parsed.newline),
                    ),
                  typing,
                )
              }
              references={references}
              readonly={readonly}
              onKeyDown={(event) => blockKeys(index, event)}
            />
          );
        }
        return (
          <div
            key={index}
            className="folio-block"
            data-drop={target === index}
            onKeyDown={(event) => {
              if (
                event.altKey &&
                ['ArrowUp', 'ArrowDown'].includes(event.key) &&
                !readonly &&
                level === 0
              ) {
                event.preventDefault();
                event.stopPropagation();
                move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
              }
            }}
            onDragOver={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              setTarget(index);
            }}
            onDrop={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              move(dragging, index);
              setDragging(null);
              setTarget(null);
            }}
          >
            {!readonly && (
              <div className="folio-gutter no-print">
                <button
                  type="button"
                  className="folio-block-button"
                  aria-label="Add block below"
                  onClick={() =>
                    setMenu({ index, replace: !block, query: '', selected: 0 })
                  }
                >
                  +
                </button>
                {block && (
                  <details className="folio-block-menu">
                    <summary
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', '');
                        setDragging(index);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setTarget(null);
                      }}
                      aria-label={'Block ' + (index + 1) + ' actions'}
                      title="Block actions or drag to reorder"
                    >
                      ⠿
                    </summary>
                    <div>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={index === blocks.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() => insert(index, block.raw, false)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMenu({
                            index,
                            replace: true,
                            query: '',
                            selected: 0,
                          })
                        }
                      >
                        Replace with block
                      </button>
                      <button type="button" onClick={() => update('')}>
                        Delete block
                      </button>
                    </div>
                  </details>
                )}
              </div>
            )}
            {content}
            {menu?.index === index && (
              <div
                className="folio-slash no-print"
                role="group"
                aria-label="Insert block"
              >
                <input
                  aria-label="Find block type"
                  autoFocus
                  value={menu.query}
                  onChange={(event) =>
                    setMenu({
                      ...menu,
                      selected: 0,
                      query: event.currentTarget.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setMenu(null);
                      focus(index);
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      const delta = event.key === 'ArrowDown' ? 1 : -1;
                      setMenu({
                        ...menu,
                        selected:
                          (menu.selected + delta + filtered.length) %
                          Math.max(1, filtered.length),
                      });
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      selectCommand(filtered[menu.selected]);
                    }
                  }}
                />
                <div className="folio-slash-results">
                  {filtered.map((choice, i) => (
                    <button
                      key={choice[0]}
                      type="button"
                      data-selected={i === menu.selected}
                      onClick={() => selectCommand(choice)}
                    >
                      {choice[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
