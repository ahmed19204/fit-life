import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
});
