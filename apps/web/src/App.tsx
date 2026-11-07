import { useEffect, useState } from 'react';
import {
  applicationName,
  type HealthResponse,
} from '@markdown-note-taker/shared';

export default function App() {
  const [connection, setConnection] = useState('Checking local connection…');
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setConnection('Checking local connection…');
    setFailed(false);

    async function checkConnection() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Health request failed');
        const health = (await response.json()) as Partial<HealthResponse>;
        if (health.status !== 'ok' || health.application !== applicationName) {
          throw new Error('Unexpected health response');
        }
        if (!controller.signal.aborted) setConnection('Local server connected');
      } catch {
        if (!controller.signal.aborted) {
          setConnection('Could not connect to the local server.');
          setFailed(true);
        }
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, [attempt]);

  return (
    <main>
      <header>
        <span className="wordmark">{applicationName}</span>
        <span className="edition">Local workspace / 01</span>
      </header>
      <section aria-labelledby="welcome">
        <p className="eyebrow">A place for your thinking</p>
        <h1 id="welcome">
          Good ideas
          <br />
          start with a note.
        </h1>
        <p className="description">
          The workspace foundation is ready. Note organization and editing are
          coming in the next implementation tasks.
        </p>
        <div className="connection">
          <p role="status">{connection}</p>
          {failed && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry connection
            </button>
          )}
        </div>
      </section>
      <footer>Personal notes. Kept close.</footer>
    </main>
  );
}
