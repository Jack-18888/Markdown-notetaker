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

export default function EditorToolbar({ editor }: { editor: Editor }) {
  useEditorTransaction(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const block = blockCommands.findLast((command) => command.active?.(editor));
  return (
    <div className="writing-controls" role="group" aria-label="Text formatting">
      <label className="block-control">
        <span>Block</span>
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
          disabled={!canRunCommand(editor, command)}
          aria-pressed={command.active ? command.active(editor) : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(editor, command)}
        >
          {command.label}
        </button>
      ))}
      <button
        type="button"
        disabled={!editor.isEditable}
        aria-haspopup="dialog"
        aria-pressed={editor.isActive('link')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLinkOpen(true)}
      >
        Link
      </button>
      {linkOpen && (
        <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />
      )}
    </div>
  );
}
