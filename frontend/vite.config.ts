import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep Vite from inheriting unrelated PostCSS config above this project directory.
  css: {
    postcss: { plugins: [] },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
