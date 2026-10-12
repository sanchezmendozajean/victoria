import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      'design/**',
      'test-results/**',
      'src/renderer/icons/catalog.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', '*.{ts,mts}', '*.mjs', 'scripts/**/*.{mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // src/core is pure TypeScript: no DOM, no Electron, no React (CLAUDE.md · Reglas de arquitectura 1).
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'react', 'react-dom', 'zustand', '**/renderer/**', '**/main/**', '**/preload/**'] },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
);
