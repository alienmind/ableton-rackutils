import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE || '/';

// The version the page shows, taken from the repo's own package.json rather
// than typed into the markup. The site went out reading v0.2.0 while the repo
// had moved on, because a literal in a header is a fact nobody remembers to
// update; a release bump moves this on its own.
const version = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
).version as string;

// The device bundle ships the same dist/ from disk. Two things follow: a
// service worker there solves nothing bundling has not already solved and can
// serve a stale UI after a device update (doc/PLAN.md 4.5), and the UI drops
// its landing chrome for the small device window (4.7).
const embedded = process.env.VITE_EMBED === '1';

// base comes from an env var, not from GITHUB_ACTIONS sniffing or a hardcoded
// path, so the same config serves local dev ('/'), GitHub Pages
// ('/ableton-rackutils/'), and the device bundle ('./').
export default defineConfig({
  base,
  resolve: {
    // Swaps the landing chrome for a stub, so the logo and the guide images
    // are never in the device bundle's module graph at all.
    alias: embedded ? { './Landing': './Landing.embedded' } : {},
  },
  define: {
    'import.meta.env.VITE_EMBED': JSON.stringify(process.env.VITE_EMBED ?? ''),
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    ...(embedded
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            scope: base,
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'ableton-rackutils',
              short_name: 'rackutils',
              description: 'Rearrange the macro knobs on an Ableton rack, in your browser.',
              start_url: base,
              scope: base,
              display: 'standalone',
              background_color: '#14151a',
              theme_color: '#14151a',
              orientation: 'any',
              // Without icons a manifest is not installable at all: Chrome and
              // Safari both decline to offer "Add to Home Screen". Drawn by
              // `scripts/make-icons.mjs`; the maskable one keeps its art inside
              // the circle Android crops to.
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // The default glob omits jpg, which is what the logo is, so an
              // offline load came back without it.
              globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,webmanifest}'],
              // The logo alone is 2.4MB, and an editor that loads without its
              // assets is worse than one that does not load.
              maximumFileSizeToCacheInBytes: 5_000_000,
              // Racks are dragged in from disk, but keep the SPA fallback off
              // anything that is not a page regardless.
              navigateFallbackDenylist: [/.*\.(adg|als|md|zip)$/i],
            },
          }),
        ]),
  ],
});
