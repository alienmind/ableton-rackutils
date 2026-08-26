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
    // Threads, not the default forks pool. These suites run for minutes of
    // solid jsdom work, and over a forked process's IPC vitest's own
    // worker->main RPC hit its 60s deadline and threw - a red build in which
    // every test had passed. A worker thread answers over a MessagePort and
    // does not.
    pool: 'threads',
    // No TTY on CI, so the default reporter prints a line per test rather
    // than redrawing one. There are a few hundred.
    reporters: process.env.CI ? ['dot'] : ['default'],
  },
});
