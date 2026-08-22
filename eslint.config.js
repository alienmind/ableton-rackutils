import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/tmp/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore-prefixed unused args are intentional (callback signatures
      // we don't fully use), not a mistake worth flagging.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
