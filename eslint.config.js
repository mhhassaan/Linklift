import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['dist/**', 'docs/**', 'doc/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
        browser: 'readonly',
        __VALIDATION__: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-useless-assignment': 'off',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
