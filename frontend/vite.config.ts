/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // The `emoji-data` chunk is inherently ~500KB (full Unicode emoji set).
    // It's dynamically imported by EmojiPickerButton so it never touches the
    // main bundle, but Rollup still warns at the default 500KB threshold.
    // Bump to 600KB so real regressions — not the emoji blob — surface.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          dnd: ['@hello-pangea/dnd'],
          state: ['zustand'],
          calendar: ['react-big-calendar', 'date-fns'],
          markdown: ['react-markdown'],
          // Split the emoji library into runtime (React component, small)
          // and data (full emoji catalog, ~500KB) so the picker UI mounts
          // as soon as the tiny runtime arrives and the data blob
          // downloads in parallel — the old combined chunk made the
          // Suspense spinner hold until both finished.
          'emoji-runtime': ['emoji-mart', '@emoji-mart/react'],
          'emoji-data': ['@emoji-mart/data'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
