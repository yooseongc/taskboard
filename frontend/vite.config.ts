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
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          dnd: ['@hello-pangea/dnd'],
          state: ['zustand'],
          calendar: ['react-big-calendar', 'date-fns'],
          markdown: ['react-markdown'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
