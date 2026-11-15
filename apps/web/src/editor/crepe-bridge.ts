import { languages } from '@codemirror/language-data';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { NodeSelection, Plugin } from '@milkdown/kit/prose/state';
import {
  AddMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from '@milkdown/kit/prose/transform';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { isSafeLink } from './links.js';

export const diagramIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="5" rx="1.2"/><rect x="14" y="15" width="7" height="5" rx="1.2"/><path d="M10 6.5h4a2 2 0 0 1 2 2V15"/></svg>`;

const SAFE_LANGUAGE_RE = /^[a-z\d_+#.-]+$/i;
const SAFE_LANGUAGE_ALIASES = new Map<string, string>();
for (const entry of languages) {
  if (!SAFE_LANGUAGE_RE.test(entry.name)) {
    const candidate = [...entry.alias, ...entry.extensions].find((value) =>
      SAFE_LANGUAGE_RE.test(value),
    );
    SAFE_LANGUAGE_ALIASES.set(
      entry.name.toLowerCase(),
      candidate ??
        (entry.name
          .toLowerCase()
          .replace(/[^a-z\d_+#.-]+/g, '-')
          .replace(/^-+|-+$/g, '') ||
          'text'),
    );
  }
}

/** Map CodeMirror display names that contain spaces or symbols to valid Markdown fence info strings. */
export function normalizeCodeBlockLanguage(language: string): string {
  if (!language) return '';
  if (language.toLowerCase() === 'mermaid') return 'text';
  if (SAFE_LANGUAGE_RE.test(language)) return language;
  return (
    SAFE_LANGUAGE_ALIASES.get(language.toLowerCase()) ??
    (language
      .toLowerCase()
      .replace(/[^a-z\d_+#.-]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
      'text')
  );
}

/** Insert a top-level Mermaid diagram block from the slash menu. */
export function insertMermaidDiagram(ctx: Ctx): void {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { mermaid, paragraph } = state.schema.nodes;
  if (!mermaid) return;

  const diagram = mermaid.create({ source: 'flowchart LR\n  A --> B' });
  const { $from } = state.selection;
  const atRootParagraph =
    $from.depth === 1 && $from.parent.type.name === 'paragraph';
  const replaceFrom = atRootParagraph ? $from.before(1) : $from.after(1);
  const replaceTo = atRootParagraph ? $from.after(1) : replaceFrom;
  const needsTrailingParagraph =
    replaceTo >= state.doc.content.size && Boolean(paragraph);
  const inserted =
    needsTrailingParagraph && paragraph
      ? [diagram, paragraph.create()]
      : [diagram];

  const tr = state.tr.replaceWith(replaceFrom, replaceTo, inserted);
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, replaceFrom)));
  view.focus();
}

function sliceContainsUnsafeLink(node: ProseMirrorNode): boolean {
  let unsafe = false;
  node.descendants((child) => {
    if (unsafe) return false;
    for (const mark of child.marks) {
      if (
        mark.type.name === 'link' &&
        !isSafeLink(String(mark.attrs.href ?? ''))
      ) {
        unsafe = true;
        return false;
      }
    }
    return undefined;
  });
  return unsafe;
}

function setAttrIfChanged(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function removeLinkError(editBox: HTMLElement): void {
  const input = editBox.querySelector<HTMLInputElement>('input.input-area');
  if (input) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
  editBox.querySelector('.crepe-link-error')?.remove();
}

function showLinkError(editBox: HTMLElement, message: string): void {
  let alert = editBox.querySelector<HTMLElement>('.crepe-link-error');
  if (!alert) {
    alert = document.createElement('p');
    alert.className = 'crepe-link-error';
    alert.setAttribute('role', 'alert');
    alert.id = `crepe-link-error-${Math.random().toString(36).slice(2, 8)}`;
    editBox.append(alert);
  }
  alert.textContent = message;
  const input = editBox.querySelector<HTMLInputElement>('input.input-area');
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', alert.id);
    input.focus();
  }
}

function wireActionSpan(span: HTMLElement, label: string): void {
  setAttrIfChanged(span, 'role', 'button');
  setAttrIfChanged(span, 'tabindex', '0');
  setAttrIfChanged(span, 'aria-label', label);
  if (span.dataset.crepeKeyboardWired) return;
  span.dataset.crepeKeyboardWired = 'true';
  span.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    span.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
}

function findTaskListItem(
  view: EditorView,
  block: Element,
): { pos: number; checked: boolean; text: string } | null {
  const contentDom = block.querySelector(
    ':scope > li.list-item > .children > .content-dom',
  );
  if (!contentDom) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(contentDom, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const candidate = $pos.node(depth);
    if (candidate.type.name === 'list_item') {
      if (candidate.attrs.checked == null) return null;
      return {
        pos: $pos.before(depth),
        checked: Boolean(candidate.attrs.checked),
        text: candidate.firstChild?.textContent?.trim() ?? '',
      };
    }
  }
  return null;
}

function syncTaskCheckboxes(root: HTMLElement, view: EditorView): void {
  for (const block of root.querySelectorAll('.milkdown-list-item-block')) {
    const wrapper = block.querySelector<HTMLElement>(
      ':scope > li.list-item > .label-wrapper',
    );
    if (!wrapper) continue;
    const task = findTaskListItem(view, block);
    const existing = wrapper.querySelector<HTMLInputElement>(
      ':scope > input.crepe-task-checkbox',
    );
    if (!task) {
      existing?.remove();
      continue;
    }

    let checkbox = existing;
    if (!checkbox) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'crepe-task-checkbox';
      checkbox.addEventListener('pointerdown', (event) => {
        // Keep Vue's label-wrapper pointerdown handler from toggling twice.
        event.stopPropagation();
      });
      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        const input = event.currentTarget as HTMLInputElement;
        const current = findTaskListItem(view, block);
        if (!current || !view.editable) {
          if (current) input.checked = current.checked;
          return;
        }
        view.dispatch(
          view.state.tr.setNodeAttribute(current.pos, 'checked', input.checked),
        );
      });
      wrapper.append(checkbox);
    }

    checkbox.checked = task.checked;
    checkbox.disabled = !view.editable;
    setAttrIfChanged(
      checkbox,
      'aria-label',
      task.text ? `Task item checkbox for ${task.text}` : 'Task item checkbox',
    );
  }
}

const COLUMN_CONTROL_LABELS = [
  'Align column left',
  'Align column center',
  'Align column right',
  'Delete column',
] as const;

function syncCrepeControlLabels(root: HTMLElement): void {
  for (const table of root.querySelectorAll('.milkdown-table-block')) {
    const addRow = table.querySelector(
      '[data-role="x-line-drag-handle"] > button.add-button',
    );
    if (addRow) setAttrIfChanged(addRow, 'aria-label', 'Add row');

    const addCol = table.querySelector(
      '[data-role="y-line-drag-handle"] > button.add-button',
    );
    if (addCol) setAttrIfChanged(addCol, 'aria-label', 'Add column');

    table
      .querySelectorAll('[data-role="col-drag-handle"] .button-group button')
      .forEach((button, index) => {
        const label = COLUMN_CONTROL_LABELS[index];
        if (label) setAttrIfChanged(button, 'aria-label', label);
      });

    const deleteRow = table.querySelector(
      '[data-role="row-drag-handle"] .button-group button',
    );
    if (deleteRow) setAttrIfChanged(deleteRow, 'aria-label', 'Delete row');
  }

  for (const latexTooltip of root.querySelectorAll(
    '.milkdown-latex-inline-edit',
  )) {
    const mathInput = latexTooltip.querySelector('.ProseMirror');
    if (mathInput) {
      setAttrIfChanged(mathInput, 'role', 'textbox');
      setAttrIfChanged(mathInput, 'aria-label', 'LaTeX expression');
    }
    const confirmButton = latexTooltip.querySelector('button');
    if (confirmButton)
      setAttrIfChanged(confirmButton, 'aria-label', 'Apply math');
  }

  for (const editBox of root.querySelectorAll<HTMLElement>(
    '.milkdown-link-edit',
  )) {
    const input = editBox.querySelector('input.input-area');
    if (input) setAttrIfChanged(input, 'aria-label', 'Link destination');
    const confirm = editBox.querySelector<HTMLElement>('.confirm');
    if (confirm) wireActionSpan(confirm, 'Apply link');
    if (editBox.dataset.show === 'false') removeLinkError(editBox);
  }

  for (const preview of root.querySelectorAll('.milkdown-link-preview')) {
    const copy = preview.querySelector<HTMLElement>('.link-icon');
    if (copy) wireActionSpan(copy, 'Copy link');
    const edit = preview.querySelector<HTMLElement>('.link-edit-button');
    if (edit) wireActionSpan(edit, 'Edit link');
    const remove = preview.querySelector<HTMLElement>('.link-remove-button');
    if (remove) wireActionSpan(remove, 'Remove link');
  }

  for (const codeBlock of root.querySelectorAll('.milkdown-code-block')) {
    const search = codeBlock.querySelector('input.search-input');
    if (search) setAttrIfChanged(search, 'aria-label', 'Search language');
    const content = codeBlock.querySelector('.cm-content');
    if (content && !content.getAttribute('aria-label'))
      content.setAttribute('aria-label', 'Code editor');
    const toggle = codeBlock.querySelector('button.preview-toggle-button');
    if (toggle) {
      const hidden = codeBlock
        .querySelector('.codemirror-host')
        ?.classList.contains('hidden');
      setAttrIfChanged(
        toggle,
        'aria-label',
        hidden ? 'Edit LaTeX source' : 'Hide LaTeX source',
      );
    }
  }

  for (const handle of root.querySelectorAll('.milkdown-block-handle')) {
    const items = handle.querySelectorAll('.operation-item');
    if (items[0])
      setAttrIfChanged(items[0], 'title', 'Click to add block below');
    if (items[1]) setAttrIfChanged(items[1], 'title', 'Drag to move block');
  }
}

/**
 * Milkdown plugins bridging Crepe UI with workspace safety, language normalization,
 * native task checkboxes, and accessible button/input labels.
 */
export const crepePlaygroundBridge = $prose(
  () =>
    new Plugin({
      filterTransaction(tr) {
        if (!tr.docChanged) return true;
        for (const step of tr.steps) {
          if (
            step instanceof AddMarkStep &&
            step.mark.type.name === 'link' &&
            !isSafeLink(String(step.mark.attrs.href ?? ''))
          )
            return false;
          if (
            (step instanceof ReplaceStep ||
              step instanceof ReplaceAroundStep) &&
            sliceContainsUnsafeLink(
              step.slice.content as unknown as ProseMirrorNode,
            )
          )
            return false;
        }
        return true;
      },

      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        let nextTr: typeof newState.tr | null = null;
        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'code_block') return undefined;
          const raw = String(node.attrs.language ?? '');
          const normalized = normalizeCodeBlockLanguage(raw);
          if (normalized !== raw) {
            nextTr ??= newState.tr;
            nextTr.setNodeAttribute(pos, 'language', normalized);
          }
          return false;
        });
        return nextTr;
      },

      view(editorView) {
        const root =
          editorView.dom.closest<HTMLElement>('.milkdown') ??
          editorView.dom.parentElement;
        if (!root) return {};

        let syncing = false;
        const syncAll = () => {
          if (syncing || editorView.isDestroyed) return;
          syncing = true;
          try {
            syncTaskCheckboxes(root, editorView);
            syncCrepeControlLabels(root);
          } finally {
            syncing = false;
          }
        };

        const validateLinkSubmission = (
          event: Event,
          target: Element | null,
        ) => {
          const editBox = target?.closest<HTMLElement>('.milkdown-link-edit');
          const input =
            editBox?.querySelector<HTMLInputElement>('input.input-area');
          if (!editBox || !input) return;
          const value = input.value.trim();
          if (isSafeLink(value)) {
            removeLinkError(editBox);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          showLinkError(
            editBox,
            'Use an http, https, mailto, or relative link without spaces.',
          );
        };

        const onKeydownCapture = (event: KeyboardEvent) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target?.closest('.milkdown-link-edit')) return;
          if (event.key === 'Escape') {
            const editBox = target.closest<HTMLElement>('.milkdown-link-edit');
            if (editBox) removeLinkError(editBox);
            return;
          }
          if (event.key === 'Enter' && target.matches('input.input-area'))
            validateLinkSubmission(event, target);
        };

        const onPointerdownCapture = (event: PointerEvent) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest('.milkdown-link-edit .confirm'))
            validateLinkSubmission(event, target);
        };

        const onInputCapture = (event: Event) => {
          const target = event.target instanceof Element ? event.target : null;
          const editBox = target?.closest<HTMLElement>('.milkdown-link-edit');
          if (editBox) removeLinkError(editBox);
        };

        root.addEventListener('keydown', onKeydownCapture, true);
        root.addEventListener('pointerdown', onPointerdownCapture, true);
        root.addEventListener('input', onInputCapture, true);

        const observer =
          typeof MutationObserver === 'function'
            ? new MutationObserver(() => syncAll())
            : null;
        observer?.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-show'],
        });

        syncAll();

        return {
          update() {
            syncAll();
          },
          destroy() {
            observer?.disconnect();
            root.removeEventListener('keydown', onKeydownCapture, true);
            root.removeEventListener('pointerdown', onPointerdownCapture, true);
            root.removeEventListener('input', onInputCapture, true);
          },
        };
      },
    }),
);
