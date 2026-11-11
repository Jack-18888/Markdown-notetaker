import {
  diagramIssue,
  diagramLimits,
  sanitizeDiagram,
} from './diagram-policy.js';

export type DiagramResult =
  { kind: 'ready'; svg: string } | { kind: 'message'; message: string };

const configuration = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  htmlLabels: false,
  layout: 'dagre',
  logLevel: 'fatal',
  maxTextSize: diagramLimits.bytes,
  maxEdges: diagramLimits.edges,
  flowchart: { htmlLabels: false },
  fontFamily: 'Trebuchet MS, sans-serif',
  theme: 'neutral',
  secure: [
    'secure',
    'securityLevel',
    'startOnLoad',
    'maxTextSize',
    'maxEdges',
    'suppressErrorRendering',
    'htmlLabels',
    'flowchart',
    'layout',
    'themeCSS',
    'dompurifyConfig',
  ],
} as const;
let library: Promise<(typeof import('mermaid'))['default']> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function loadRenderer() {
  library ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        ...configuration,
        secure: [...configuration.secure],
      });
      return mermaid;
    })
    .catch(() => {
      library = undefined;
      throw new Error('Diagram renderer unavailable.');
    });
  return library;
}

/** Mermaid owns global configuration and temporary DOM; serialize rendering and skip obsolete work. */
export function renderDiagram(
  source: string,
  signal: AbortSignal,
): Promise<DiagramResult | null> {
  const issue = diagramIssue(source);
  if (issue) return Promise.resolve({ kind: 'message', message: issue });
  const run = async (): Promise<DiagramResult | null> => {
    if (signal.aborted) return null;
    const host = document.createElement('div');
    host.dataset.diagramRender = '';
    Object.assign(host.style, {
      position: 'fixed',
      left: '-10000px',
      width: '800px',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    host.setAttribute('aria-hidden', 'true');
    const remove = () => host.remove();
    try {
      const mermaid = await loadRenderer();
      if (signal.aborted) return null;
      document.body.append(host);
      signal.addEventListener('abort', remove, { once: true });
      const id = `diagram-${crypto.randomUUID()}`;
      const { svg } = await mermaid.render(id, source, host);
      return signal.aborted
        ? null
        : { kind: 'ready', svg: sanitizeDiagram(svg) };
    } catch {
      return signal.aborted
        ? null
        : {
            kind: 'message',
            message:
              'This diagram could not be previewed. Check its source and try again.',
          };
    } finally {
      signal.removeEventListener('abort', remove);
      remove();
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}
