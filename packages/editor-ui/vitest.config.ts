import { defineConfig } from 'vitest/config';

// jsdom for the same reason adg-codec uses it: the codec's DOM work runs for
// real in these tests, and the components render against it.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // One file at a time. These parse and mutate REAL racks under jsdom -
    // seconds of solid, single-threaded DOM work per file - and running every
    // file at once starved the workers on a CI runner: the run died on
    // vitest's own RPC timeout rather than on a failing test, with every test
    // that had run passing.
    fileParallelism: false,
    // A drum rack of racks through the contract is seconds, not milliseconds.
    testTimeout: 30_000,
  },
});
