import { useMemo, useState } from 'react';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { parser as javascript } from '@lezer/javascript';
import { parser as json } from '@lezer/json';
import { parser as css } from '@lezer/css';
import { parser as python } from '@lezer/python';
import { parser as html } from '@lezer/html';
import { reconcileSource, normalizedSource } from './source-text.js';

const parsers = {
  typescript: javascript.configure({ dialect: 'ts' }),
  ts: javascript.configure({ dialect: 'ts' }),
  tsx: javascript.configure({ dialect: 'ts jsx' }),
  javascript,
  js: javascript,
  jsx: javascript.configure({ dialect: 'jsx' }),
  json,
  css,
  html,
  python,
  py: python,
};

function highlighted(code: string, language: string) {
  if (!Object.hasOwn(parsers, language) || code.length > 32_768) return code;
  const parser = parsers[language as keyof typeof parsers];
  const pieces = [];
  let offset = 0;
  highlightTree(parser.parse(code), classHighlighter, (start, end, classes) => {
    if (start > offset) pieces.push(code.slice(offset, start));
    pieces.push(
      <span className={classes} key={start}>
        {code.slice(start, end)}
      </span>,
    );
    offset = end;
  });
  pieces.push(code.slice(offset));
  return pieces;
}

// Folio's code block uses a literal source field and a separate highlighted layer.
export function FolioCode({
  code,
  language,
  onCode,
  onLanguage,
  readonly = false,
}: {
  code: string;
  language: string;
  onCode(code: string): void;
  onLanguage(language: string): void;
  readonly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState('');
  const display = useMemo(
    () => highlighted(code, language.toLowerCase()),
    [code, language],
  );
  return (
    <section className="folio-code" aria-label="Code block">
      {!readonly && (
        <div className="folio-code-tools no-print">
          <label>
            Language{' '}
            <input
              aria-label="Code language"
              key={language}
              defaultValue={language}
              placeholder="Plain text"
              pattern="[A-Za-z0-9_+#.\-]*"
              onBlur={(event) => {
                if (event.currentTarget.validity.valid)
                  onLanguage(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          <button
            type="button"
            className="quiet-button"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Show highlight' : 'Edit code'}
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              void navigator.clipboard.writeText(code).then(
                () => setCopied('Copied'),
                () => setCopied('Copy failed'),
              );
            }}
          >
            Copy code
          </button>
          {copied && <span role="status">{copied}</span>}
        </div>
      )}
      <pre
        className={editing && !readonly ? 'folio-code-print' : undefined}
        tabIndex={0}
      >
        <code>{display}</code>
      </pre>
      {editing && !readonly && (
        <textarea
          aria-label="Code source"
          className="folio-code-input no-print"
          spellCheck={false}
          rows={Math.max(
            4,
            Math.min(16, normalizedSource(code).split('\n').length + 1),
          )}
          value={normalizedSource(code)}
          onChange={(event) =>
            onCode(reconcileSource(code, event.currentTarget.value))
          }
        />
      )}
    </section>
  );
}
