import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // apps/m4l-device/site is the built web app copied into the device
    // (doc/PLAN.md 4.7) - a build output like dist, not source.
    ignores: ['**/dist/**', '**/node_modules/**', '**/tmp/**', 'apps/m4l-device/site/**'],
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
