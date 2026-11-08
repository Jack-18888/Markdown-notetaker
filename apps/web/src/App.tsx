import { useEffect, useState } from 'react';
import {
  applicationName,
  apiContracts,
  healthResponseSchema,
} from '@markdown-note-taker/contracts';

export default function App() {
  const [connection, setConnection] = useState('Checking local connection…');
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Ignore results from checks cancelled by retry or unmount.
    const controller = new AbortController();
    setConnection('Checking local connection…');
    setFailed(false);

    async function checkConnection() {
      try {
        const response = await fetch(apiContracts.health.path, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Health request failed');
        healthResponseSchema.parse(await response.json());
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
