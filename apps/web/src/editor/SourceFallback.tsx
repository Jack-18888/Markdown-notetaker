import type { LoadedMarkdown } from './markdown.js';
import './source-fallback.css';

type SourceDocument = Extract<LoadedMarkdown, { mode: 'source' }>;

export default function SourceFallback({
  document,
}: {
  document: SourceDocument;
}) {
  return (
    <section className="source-fallback" aria-label="Markdown source">
      <p className="source-fallback-label">Original source · Read only</p>
      <h2>Your Markdown is preserved.</h2>
      <p className="source-fallback-description">
        This note contains content the rich editor cannot safely preserve. You
        can read and copy the original source below.
      </p>
      <pre tabIndex={0} aria-label="Read-only Markdown source">
        {document.source}
      </pre>
    </section>
  );
}
