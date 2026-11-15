import { useEffect, useState } from 'react';
import type { SaveCoordinator } from '../workspace/SaveCoordinator.js';
import { normalizedSource, reconcileSource } from './source-text.js';

export default function SourceFallback({
  session,
}: {
  session: SaveCoordinator;
}) {
  const [source, setSource] = useState(() => {
    try {
      return session.localContent();
    } catch {
      return session.getSnapshot().note.content;
    }
  });
  useEffect(() => {
    session.attachBody();
  }, [session]);
  return (
    <section className="folio-writing">
      <div
        className="folio-source note-body"
        role="region"
        aria-label="Markdown source"
      >
        <p role="status">
          The block editor could not open. You can still edit the Markdown
          source.
        </p>
        <textarea
          aria-label="Raw Markdown source"
          value={normalizedSource(source)}
          spellCheck={false}
          onChange={(event) => {
            const next = reconcileSource(source, event.currentTarget.value);
            setSource(next);
            session.setBody(next);
          }}
        />
      </div>
    </section>
  );
}
