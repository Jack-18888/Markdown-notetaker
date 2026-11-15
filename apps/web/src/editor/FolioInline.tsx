import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { Definition, FootnoteDefinition, PhrasingContent } from 'mdast';
import { inlineText, mathElement } from './folio-inline-model.js';
import { isSafeLink } from './links.js';
import 'katex/dist/katex.min.css';

export interface References {
  links: Map<string, Definition>;
  footnotes: Map<string, FootnoteDefinition>;
  renameFootnote(from: string, to: string): void;
}

const marks = [
  { tag: 'strong', label: 'Bold', text: 'B' },
  { tag: 'em', label: 'Italic', text: 'I' },
  { tag: 'del', label: 'Strikethrough', text: 'S' },
  { tag: 'code', label: 'Inline code', text: '</>' },
  { tag: 'mark', label: 'Highlight', text: 'Mark' },
] as const;

function comparable(value: unknown) {
  return JSON.stringify(value, (key, entry: unknown) =>
    key === 'position' ? undefined : entry,
  );
}

function appendText(parent: HTMLElement, value: string) {
  const matches = value.matchAll(/==([^\n=]+)==/g);
  let offset = 0;
  for (const match of matches) {
    parent.append(value.slice(offset, match.index));
    const mark = document.createElement('mark');
    mark.textContent = match[1]!;
    parent.append(mark);
    offset = match.index + match[0].length;
  }
  parent.append(value.slice(offset));
}

function appendInline(
  parent: HTMLElement,
  content: PhrasingContent[],
  atoms: Map<string, PhrasingContent>,
  readonly: boolean,
  references: References,
) {
  for (const node of content) {
    if (node.type === 'text') {
      appendText(parent, node.value);
      continue;
    }
    const richTag =
      node.type === 'strong'
        ? 'strong'
        : node.type === 'emphasis'
          ? 'em'
          : node.type === 'delete'
            ? 'del'
            : null;
    if (richTag && 'children' in node) {
      const element = document.createElement(richTag);
      appendInline(element, node.children, atoms, readonly, references);
      parent.append(element);
      continue;
    }
    if (node.type === 'break') {
      parent.append(document.createElement('br'));
      continue;
    }
    if (node.type === 'inlineCode') {
      const code = document.createElement('code');
      code.textContent = node.value;
      parent.append(code);
      continue;
    }
    if (node.type === 'link' && isSafeLink(node.url)) {
      const anchor = document.createElement('a');
      anchor.href = node.url;
      anchor.rel = 'noopener noreferrer';
      anchor.target = '_blank';
      if (node.title) anchor.title = node.title;
      appendInline(anchor, node.children, atoms, readonly, references);
      parent.append(anchor);
      continue;
    }
    const atom = document.createElement('span');
    atom.className = 'folio-inline-atom';
    if (node.type === 'inlineMath') atom.append(mathElement(node.value));
    else if (node.type === 'footnoteReference') {
      const reference = document.createElement(readonly ? 'a' : 'sup');
      reference.textContent = '[' + (node.label ?? node.identifier) + ']';
      if (readonly && reference instanceof HTMLAnchorElement)
        reference.href = '#footnote-' + encodeURIComponent(node.identifier);
      atom.append(reference);
    } else if (node.type === 'image' || node.type === 'imageReference') {
      atom.textContent = '▧ ' + (node.alt || 'Image');
    } else if (node.type === 'linkReference') {
      const destination = references.links.get(node.identifier);
      if (destination && isSafeLink(destination.url)) {
        const reference = document.createElement('a');
        reference.href = destination.url;
        reference.rel = 'noopener noreferrer';
        reference.target = '_blank';
        reference.textContent = inlineText(node.children);
        atom.append(reference);
      } else atom.textContent = inlineText(node.children);
    } else if (node.type === 'html') atom.textContent = node.value;
    else if (node.type === 'link') atom.textContent = inlineText(node.children);
    else continue;
    if (!readonly) {
      const id = String(atoms.size);
      atoms.set(id, node);
      atom.dataset.inlineAtom = id;
      atom.contentEditable = 'false';
    }
    parent.append(atom);
  }
}

function inlineFromDom(
  root: Node,
  atoms: Map<string, PhrasingContent>,
): PhrasingContent[] {
  if (root.nodeType === Node.TEXT_NODE)
    return root.textContent
      ? [{ type: 'text', value: root.textContent.replaceAll('\u00a0', ' ') }]
      : [];
  const result: PhrasingContent[] = [];
  for (const child of root.childNodes) {
    if (!(child instanceof HTMLElement)) {
      result.push(...inlineFromDom(child, atoms));
      continue;
    }
    const atom = child.dataset.inlineAtom;
    if (atom !== undefined && atoms.has(atom)) {
      result.push(atoms.get(atom)!);
      continue;
    }
    const children = inlineFromDom(child, atoms);
    switch (child.tagName) {
      case 'STRONG':
      case 'B':
        if (children.length) result.push({ type: 'strong', children });
        break;
      case 'EM':
      case 'I':
        if (children.length) result.push({ type: 'emphasis', children });
        break;
      case 'DEL':
      case 'S':
      case 'STRIKE':
        if (children.length) result.push({ type: 'delete', children });
        break;
      case 'BR':
        if (child.nextSibling || result.length) result.push({ type: 'break' });
        break;
      case 'CODE':
        if (child.textContent)
          result.push({ type: 'inlineCode', value: child.textContent });
        break;
      case 'MARK':
        if (child.textContent)
          result.push({ type: 'text', value: '==' + child.textContent + '==' });
        break;
      case 'A': {
        const url = child.getAttribute('href') ?? '';
        if (children.length && isSafeLink(url))
          result.push({
            type: 'link',
            url,
            title: child.getAttribute('title'),
            children,
          });
        else result.push(...children);
        break;
      }
      case 'DIV':
      case 'P':
        if (result.length && children.length) result.push({ type: 'break' });
        result.push(...children);
        break;
      default:
        result.push(...children);
    }
  }
  const merged: PhrasingContent[] = [];
  for (const node of result) {
    const last = merged.at(-1);
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = {
        type: 'text',
        value: last.value + node.value,
      };
    } else merged.push(node);
  }
  return merged;
}

function editingRange(el: HTMLElement) {
  const selection = el.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return el.contains(range.commonAncestorContainer) ? range : null;
}

type EditableTag = 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export function InlineEditor({
  as: Tag = 'div',
  label,
  nodes,
  onChange,
  references,
  onKeyDown,
  readonly = false,
}: {
  as?: EditableTag;
  label: string;
  nodes: PhrasingContent[];
  onChange(value: PhrasingContent[], typing?: boolean): void;
  references: References;
  onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
  readonly?: boolean;
}) {
  const host = useRef<HTMLElement>(null);
  const atoms = useRef(new Map<string, PhrasingContent>());
  const rendered = useRef('');
  const [toolbar, setToolbar] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkMessage, setLinkMessage] = useState('');
  const selection = useRef<Range>(null);
  const signature = comparable(nodes);
  const Input = Tag === 'div' ? 'div' : 'span';
  useLayoutEffect(() => {
    const element = host.current!;
    if (
      !readonly &&
      document.activeElement === element &&
      rendered.current === signature
    )
      return;
    if (rendered.current === signature && !references.links.size) return;
    element.replaceChildren();
    atoms.current.clear();
    appendInline(element, nodes, atoms.current, readonly, references);
    rendered.current = signature;
  }, [nodes, signature, readonly, references]);

  useEffect(() => {
    if (readonly) return;
    function updateSelection() {
      if (document.activeElement !== host.current && !toolbar && !linkOpen)
        return;
      const element = host.current;
      const range = element ? editingRange(element) : null;
      if (
        range &&
        !range.collapsed &&
        document.activeElement === host.current
      ) {
        selection.current = range.cloneRange();
        setToolbar(true);
      } else if (!linkOpen) setToolbar(false);
    }
    document.addEventListener('selectionchange', updateSelection);
    return () =>
      document.removeEventListener('selectionchange', updateSelection);
  }, [linkOpen, readonly, toolbar]);

  function update(typing = false) {
    const next = inlineFromDom(host.current!, atoms.current);
    rendered.current = comparable(next);
    onChange(next, typing);
  }

  function format(tag: string, href?: string) {
    const range =
      selection.current ?? (host.current ? editingRange(host.current) : null);
    if (
      !range ||
      range.collapsed ||
      !host.current?.contains(range.commonAncestorContainer)
    )
      return;
    const parent =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const existing = parent?.closest(tag);
    if (existing && host.current.contains(existing) && tag !== 'a') {
      existing.replaceWith(...existing.childNodes);
      update();
      return;
    }
    const wrapper = document.createElement(tag);
    if (href) wrapper.setAttribute('href', href);
    if (tag === 'code' || tag === 'mark') {
      wrapper.textContent = range.toString();
      range.deleteContents();
    } else {
      wrapper.append(range.extractContents());
    }
    range.insertNode(wrapper);
    range.selectNodeContents(wrapper);
    host.current.focus();
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    update();
  }

  const editor = (
    <Input
      ref={(element) => {
        host.current = element;
      }}
      className={readonly ? undefined : 'folio-editable'}
      aria-label={readonly ? undefined : label}
      aria-multiline={readonly ? undefined : true}
      role={readonly ? undefined : 'textbox'}
      contentEditable={!readonly}
      suppressContentEditableWarning
      onFocus={() => {
        if (!readonly) selection.current = null;
      }}
      onInput={(event) => {
        if (!readonly && !(event.nativeEvent as InputEvent).isComposing)
          update((event.nativeEvent as InputEvent).inputType === 'insertText');
      }}
      onCompositionEnd={() => {
        if (!readonly) update();
      }}
      onPaste={(event) => {
        if (readonly) return;
        event.preventDefault();
        const range = editingRange(event.currentTarget);
        if (!range) return;
        const text = document.createTextNode(
          event.clipboardData.getData('text/plain'),
        );
        range.deleteContents();
        range.insertNode(text);
        range.setStartAfter(text);
        range.collapse(true);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        update();
      }}
      onDrop={(event) => {
        if (!readonly) event.preventDefault();
      }}
      onClick={(event) => {
        if (
          !readonly &&
          event.target instanceof Element &&
          event.target.closest('a')
        )
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (readonly || event.nativeEvent.isComposing) return;
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (key === 'b' || key === 'i')) {
          event.preventDefault();
          selection.current = editingRange(event.currentTarget);
          format(key === 'b' ? 'strong' : 'em');
        } else if (key === 'escape' && toolbar) {
          setToolbar(false);
          setLinkOpen(false);
        } else {
          onKeyDown?.(event);
          if (
            !event.defaultPrevented &&
            event.key === 'Enter' &&
            !event.shiftKey
          ) {
            event.preventDefault();
            document.execCommand('insertLineBreak');
          }
        }
      }}
    />
  );
  return (
    <>
      {toolbar && !readonly && (
        <div
          className="folio-format no-print"
          role="toolbar"
          aria-label="Format selection"
        >
          {marks.map((mark) => (
            <button
              key={mark.tag}
              type="button"
              title={mark.label}
              aria-label={mark.label}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => format(mark.tag)}
            >
              {mark.text}
            </button>
          ))}
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setLinkOpen(!linkOpen)}
          >
            Link
          </button>
          {linkOpen && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const url = String(
                  new FormData(event.currentTarget).get('url'),
                ).trim();
                if (!isSafeLink(url)) {
                  setLinkMessage('Enter a safe link URL.');
                  return;
                }
                format('a', url);
                setLinkOpen(false);
                setLinkMessage('');
              }}
            >
              <input name="url" aria-label="Link URL" autoFocus />
              <button type="submit">Apply</button>
              <button
                type="button"
                onClick={() => {
                  setLinkOpen(false);
                  host.current?.focus();
                }}
              >
                Cancel
              </button>
              {linkMessage && <span role="alert">{linkMessage}</span>}
            </form>
          )}
        </div>
      )}
      {Tag === 'div' ? (
        editor
      ) : (
        <Tag aria-label={Tag.startsWith('h') ? inlineText(nodes) : undefined}>
          {editor}
        </Tag>
      )}
      <InlineControls
        nodes={nodes}
        onChange={onChange}
        references={references}
        readonly={readonly}
      />
    </>
  );
}

function InlineControls({
  nodes,
  onChange,
  references,
  readonly,
}: {
  nodes: PhrasingContent[];
  onChange(nodes: PhrasingContent[]): void;
  references: References;
  readonly: boolean;
}) {
  return nodes.map((node, index) => {
    const update = (value: PhrasingContent) =>
      onChange(nodes.map((entry, i) => (i === index ? value : entry)));
    if (node.type === 'image' || node.type === 'imageReference') {
      const url =
        node.type === 'image'
          ? node.url
          : (references.links.get(node.identifier)?.url ?? '');
      return (
        <ImageControl
          key={index}
          url={url}
          alt={node.alt ?? ''}
          readonly={readonly}
          onChange={(alt, next) => {
            update(
              node.type === 'image'
                ? { ...node, alt, url: next }
                : { ...node, alt },
            );
          }}
          reference={node.type === 'imageReference'}
        />
      );
    }
    if (readonly) return null;
    if (node.type === 'footnoteReference')
      return (
        <details className="folio-inline-settings no-print" key={index}>
          <summary>
            Footnote reference [{node.label ?? node.identifier}]
          </summary>
          <RenameField
            label="Footnote label"
            value={node.label ?? node.identifier}
            onChange={(value) =>
              references.renameFootnote(node.identifier, value)
            }
          />
          {references.footnotes.has(node.identifier) && (
            <a href={'#footnote-' + encodeURIComponent(node.identifier)}>
              Go to definition
            </a>
          )}
        </details>
      );
    if (node.type === 'linkReference')
      return (
        <details className="folio-inline-settings no-print" key={index}>
          <summary>Reference link [{node.label ?? node.identifier}]</summary>
          <RenameField
            label="Link text"
            value={inlineText(node.children)}
            onChange={(value) =>
              update({
                ...node,
                referenceType: 'full',
                children: [{ type: 'text', value }],
              })
            }
          />
          <a href={'#reference-' + encodeURIComponent(node.identifier)}>
            Go to definition
          </a>
        </details>
      );
    if (node.type === 'inlineMath')
      return (
        <details className="folio-inline-settings no-print" key={index}>
          <summary>Edit inline math</summary>
          <RenameField
            label="Inline math source"
            value={node.value}
            onChange={(value) => update({ ...node, value })}
          />
        </details>
      );
    if ('children' in node && node.children.length)
      return (
        <InlineControls
          key={index}
          nodes={node.children}
          onChange={(children) => update({ ...node, children })}
          references={references}
          readonly={readonly}
        />
      );
    return null;
  });
}

function ImageControl({
  url,
  alt,
  readonly,
  reference,
  onChange,
}: {
  url: string;
  alt: string;
  readonly: boolean;
  reference: boolean;
  onChange(alt: string, url: string): void;
}) {
  const [loaded, setLoaded] = useState('');
  const safe = isSafeLink(url) && !/^mailto:/i.test(url);
  return (
    <div className="folio-image">
      {safe &&
        (loaded === url ? (
          <img src={url} alt={alt} referrerPolicy="no-referrer" />
        ) : (
          <button
            className="quiet-button no-print"
            type="button"
            onClick={() => setLoaded(url)}
          >
            Load image{alt ? ' · ' + alt : ''}
          </button>
        ))}
      {!readonly && (
        <details className="folio-inline-settings no-print">
          <summary>Edit image</summary>
          <RenameField
            label="Image description"
            value={alt}
            onChange={(value) => onChange(value, url)}
            allowEmpty
          />
          {!reference && (
            <RenameField
              label="Image URL"
              value={url}
              onChange={(value) => {
                if (!isSafeLink(value) || /^mailto:/i.test(value))
                  throw new Error('Enter a safe image URL.');
                onChange(alt, value);
              }}
            />
          )}
        </details>
      )}
    </div>
  );
}

export function RenameField({
  label,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  allowEmpty?: boolean;
}) {
  const [error, setError] = useState('');
  return (
    <form
      className="folio-field"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem(
          'value',
        ) as HTMLInputElement;
        if (input.value === value) return;
        try {
          onChange(input.value);
          setError('');
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not apply this edit.',
          );
        }
      }}
    >
      <label>
        {label}
        <input
          key={value}
          name="value"
          defaultValue={value}
          required={!allowEmpty}
        />
      </label>
      <button className="quiet-button" type="submit">
        Apply
      </button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}
