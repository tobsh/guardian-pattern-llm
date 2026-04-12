import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  { ignores: ['.next/', 'out/', 'node_modules/', 'coverage/', 'next-env.d.ts'] },
  js.configs.recommended,
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
