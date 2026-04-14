import js from '@eslint/js';
import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

const config = [
  { ignores: ['.next/', 'out/', 'node_modules/', 'coverage/', 'next-env.d.ts'] },
  js.configs.recommended,
  ...next,
  prettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
