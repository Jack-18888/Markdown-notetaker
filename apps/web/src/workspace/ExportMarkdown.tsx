import { useEffect, useRef, useState } from 'react';
import type { SaveCoordinator } from './SaveCoordinator.js';
import { downloadMarkdown } from './markdown-files.js';

export default function ExportMarkdown({
  session,
}: {
  session: SaveCoordinator;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function exportNote() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      const note = await session.flush();
      if (!mounted.current) return;
      if (!note) {
        setMessage(
          'Could not export because this note could not be saved. Your changes are still here. Retry saving or resolve the conflict, then export again.',
        );
        return;
      }
      downloadMarkdown(note.title, note.content);
    } catch {
      if (mounted.current)
        setMessage(
          'Could not start the Markdown download. Try exporting again.',
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <div className="note-export">
      <button
        type="button"
        className="workspace-retry"
        disabled={pending}
        onClick={() => void exportNote()}
      >
        {pending ? 'Preparing download…' : 'Export Markdown'}
      </button>
      {message && (
        <p role="alert" className="dialog-error">
          {message}
        </p>
      )}
    </div>
  );
}
