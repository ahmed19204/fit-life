/**
 * FitLife Vite Config — Production Hardened
 * ----------------------------------------------------------------------------
 * - Code-split @supabase/supabase-js, zod into long-cached vendor chunks
 * - Drop console.* in production builds (except warn/error)
 * - Optional vite-plugin-pwa (auto-detected; falls back to manual /public/sw.js
 *   if the plugin isn't installed so dev never blocks)
 * - Sourcemaps for production debugging (small overhead, big DX win)
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

let VitePWA;
try {
  ({ VitePWA } = await import('vite-plugin-pwa'));
} catch {
  // Plugin not installed — manual /public/sw.js is used instead.
  VitePWA = null;
}

const plugins = [];

if (VitePWA) {
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      // Don't overwrite our custom sw.js — let the plugin produce a separate one
      // at /pwa-sw.js so the existing app code keeps working unmodified.
      filename: 'pwa-sw.js',
      manifest: false, // we ship /public/manifest.json manually
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fl-google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'fl-supabase', networkTimeoutSeconds: 8 },
          },
        ],
      },
    }),
  );
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: { main: resolve(process.cwd(), 'index.html') },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('zod')) return 'vendor-zod';
            return 'vendor';
          }
        },
      },
    },
  },
  esbuild: {
    // Strip debug/info logs in production, keep warn/error for telemetry
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: true,
  },
});
