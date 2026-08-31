import eslint from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.wrangler/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['public/src/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
