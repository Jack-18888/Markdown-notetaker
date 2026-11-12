import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  blockCommands,
  canRunCommand,
  formatCommands,
  runCommand,
} from './commands.js';
import LinkDialog from './LinkDialog.js';
import { useEditorTransaction } from './useEditorTransaction.js';
import './writing-controls.css';
import Icon, { type IconName } from '../Icon.js';

const commandIcons: Partial<Record<string, IconName>> = {
  code: 'code',
  undo: 'undo',
  redo: 'redo',
};
const commandLetters: Record<string, string> = {
  bold: 'B',
  italic: 'I',
  strike: 'S',
};

export default function EditorToolbar({ editor }: { editor: Editor }) {
  useEditorTransaction(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const block = blockCommands.findLast((command) => command.active?.(editor));
  return (
    <div className="writing-controls" role="group" aria-label="Text formatting">
      <label className="block-control">
        <span className="visually-hidden">Block</span>
        <select
          aria-label="Block type"
          value={block?.id ?? ''}
          disabled={!editor.isEditable}
          onChange={(event) => {
            const command = blockCommands.find(
              (item) => item.id === event.target.value,
            );
            if (command) runCommand(editor, command);
          }}
        >
          <option value="" disabled>
            Choose block
          </option>
          {blockCommands.map((command) => (
            <option
              key={command.id}
              value={command.id}
              disabled={!canRunCommand(editor, command)}
            >
              {command.label}
            </option>
          ))}
        </select>
      </label>
      {formatCommands.map((command) => (
        <button
          key={command.id}
          type="button"
          aria-label={command.label}
          title={command.label}
          className={`format-${command.id}`}
          disabled={!canRunCommand(editor, command)}
          aria-pressed={command.active ? command.active(editor) : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(editor, command)}
        >
          {commandIcons[command.id] ? (
            <Icon name={commandIcons[command.id]!} />
          ) : (
            <span aria-hidden="true">{commandLetters[command.id]}</span>
          )}
        </button>
      ))}
      <button
        type="button"
        aria-label="Link"
        title="Link"
        disabled={!editor.isEditable}
        aria-haspopup="dialog"
        aria-pressed={editor.isActive('link')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLinkOpen(true)}
      >
        <Icon name="link" />
      </button>
      {linkOpen && (
        <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />
      )}
    </div>
  );
}
