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
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'markdown-parser', test: /node_modules[\\/]marked[\\/]/ },
            ],
          },
        },
      },
    },
    // Keep the first lazy editor import from triggering a development-page reload.
    optimizeDeps: {
      include: [
        '@tiptap/core',
        '@tiptap/extension-code-block',
        '@tiptap/extension-list',
        '@tiptap/extension-paragraph',
        '@tiptap/markdown',
        '@tiptap/pm/history',
        '@tiptap/pm/model',
        '@tiptap/pm/state',
        '@tiptap/starter-kit',
        'marked',
        'mermaid',
        'dompurify',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${port}` },
    },
  };
});
