// ESLint (flat config) for the whole repository: `npm run lint`.
// Recommended rules + React hooks rules. Catches real bugs such as duplicate object
// keys (no-dupe-keys), undefined variables and misused hooks.
const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const hooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['**/node_modules/**', 'frontend/dist/**', 'e2e/screenshots/**', 'database/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: '18' } },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-target-blank': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['frontend/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.test.{js,jsx}', 'backend/tests/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
