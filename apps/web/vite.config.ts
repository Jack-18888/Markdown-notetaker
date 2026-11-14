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
    // Crepe's table node view bundles Vue's runtime.
    define: {
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
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
        '@milkdown/crepe/builder',
        '@milkdown/crepe/feature/placeholder',
        '@milkdown/crepe/feature/table',
        '@milkdown/kit/core',
        '@milkdown/kit/plugin/clipboard',
        '@milkdown/kit/plugin/listener',
        '@milkdown/kit/plugin/trailing',
        '@milkdown/kit/plugin/upload',
        '@milkdown/kit/preset/commonmark',
        '@milkdown/kit/preset/gfm',
        '@milkdown/kit/prose/commands',
        '@milkdown/kit/prose/history',
        '@milkdown/kit/prose/model',
        '@milkdown/kit/prose/schema-list',
        '@milkdown/kit/prose/state',
        '@milkdown/kit/prose/tables',
        '@milkdown/kit/transformer',
        '@milkdown/kit/utils',
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
