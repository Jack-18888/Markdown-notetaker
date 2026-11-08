import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'data/**',
      '.cache/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    ignores: [
      'apps/server/src/**/*.test.ts',
      'apps/server/src/database/**',
      'apps/server/src/workspace/open.ts',
      'apps/server/src/workspace/service.ts',
      'apps/server/src/workspace/repository.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'better-sqlite3',
                'node:sqlite',
                '**/database/**',
                '!**/database/errors.js',
                '!**/database/errors.ts',
                '**/repository.js',
                '**/repository.ts',
                '**/workspace/service.js',
                '**/workspace/service.ts',
              ],
              message:
                'Use openWorkspace and its service; SQL access belongs to persistence internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'better-sqlite3', '**/server/**'] },
      ],
    },
  },
);
