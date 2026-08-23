import { defineConfig } from 'vitest/config';

// jsdom, not the default node environment: model.ts/mutate.ts use DOMParser,
// XMLSerializer and Document/Element exactly as the browser build does. This
// is what "must run identically in Node (for tests) and browser" means in
// practice - the code has no Node-only branch, only the global environment
// differs between here and apps/site.
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
