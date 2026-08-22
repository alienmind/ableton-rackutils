import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base comes from an env var, not from GITHUB_ACTIONS sniffing or a hardcoded
// path, so the same config serves local dev ('/'), GitHub Pages
// ('/ableton-rackutils/'), and the future device bundle ('./').
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});
