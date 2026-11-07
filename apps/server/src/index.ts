import { createApp } from './app.js';

const portText = process.env.PORT ?? '3001';
const port = Number(portText);
if (
  !/^\d+$/.test(portText) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = createApp({
  serveWeb: process.env.NODE_ENV === 'production',
}).listen(port, '127.0.0.1', () =>
  console.info(`API listening at http://127.0.0.1:${port}`),
);

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Server failed to start (${error.code ?? 'unknown error'}).`);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit());
  });
}
