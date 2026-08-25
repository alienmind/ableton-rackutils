import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE || '/';

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
  },
  plugins: [
    react(),
    ...(embedded
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            scope: base,
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'ableton-rackutils',
              short_name: 'rackutils',
              description: 'Rearrange the macro knobs on an Ableton rack, in your browser.',
              start_url: base,
              scope: base,
              display: 'standalone',
              background_color: '#14151a',
              theme_color: '#14151a',
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
