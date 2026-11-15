import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(
    mode,
    fileURLToPath(new URL('../../', import.meta.url)),
    '',
  );
  const port = process.env.PORT ?? environment.PORT ?? '3001';

  return {
    plugins: [react()],
    // Keep the first lazy editor import from triggering a development-page reload.
    optimizeDeps: {
      include: [
        '@lezer/css',
        '@lezer/highlight',
        '@lezer/html',
        '@lezer/javascript',
        '@lezer/json',
        '@lezer/python',
        'katex',
        'remark-gfm',
        'remark-math',
        'remark-parse',
        'remark-stringify',
        'unified',
        'mermaid',
        'dompurify',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: false },
      },
    },
  };
});
