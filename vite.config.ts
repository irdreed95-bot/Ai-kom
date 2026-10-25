import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work on GitHub Pages subpaths and Cloudflare Pages root.
  base: './',
});
