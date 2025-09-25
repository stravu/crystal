const js = require('@eslint/js');
const typescript = require('typescript-eslint');

module.exports = [
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: typescript.parser
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'warn', // Downgrade to warning
      'no-console': 'off', // Allow console in main process
      'no-useless-escape': 'warn', // Downgrade to warning
      'prefer-const': 'warn', // Downgrade to warning
      'no-empty': 'warn' // Downgrade to warning
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js']
  }
];