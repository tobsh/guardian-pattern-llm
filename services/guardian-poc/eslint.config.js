import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import functional from 'eslint-plugin-functional';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import unicorn from 'eslint-plugin-unicorn';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.cjs',
      '*.config.ts',
      '*.config.js',
      'coverage/',
      '**/*.test.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  functional.configs.externalTypeScriptRecommended,
  security.configs.recommended,
  sonarjs.configs.recommended,
  eslintComments.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { functional, unicorn },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
      ],

      'functional/no-classes': 'error',
      'functional/immutable-data': ['error', { ignoreIdentifierPattern: ['^module'] }],
      'functional/prefer-readonly-type': 'error',
      'functional/no-let': 'error',
      'functional/no-loop-statements': 'error',
      'functional/no-throw-statements': 'error',

      'max-lines-per-function': ['warn', { max: 75, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 3],
      complexity: ['error', 10],

      '@typescript-eslint/consistent-type-definitions': 'off',

      'unicorn/error-message': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/no-useless-undefined': 'error',

      'sonarjs/cognitive-complexity': ['warn', 10],
      'sonarjs/no-misused-promises': 'off',
      'sonarjs/no-redundant-type-constituents': 'off',
      'sonarjs/prefer-nullish-coalescing': 'off',
      'sonarjs/prefer-optional-chain': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/sonar-prefer-read-only-props': 'off',
      'sonarjs/no-small-switch': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',

      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],

      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="console"]',
          message: 'Use the logger instead of console.',
        },
      ],

      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/eval/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  }
);
