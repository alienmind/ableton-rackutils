/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' in the Max for Live bundle. The device view is small and goes straight to the work (doc/PLAN.md 4.7). */
  readonly VITE_EMBED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
