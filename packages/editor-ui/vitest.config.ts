import { defineConfig } from 'vitest/config';

// jsdom for the same reason adg-codec uses it: the codec's DOM work runs for
// real in these tests, and the components render against it.
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
