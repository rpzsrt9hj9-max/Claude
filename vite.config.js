import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Publiée sur GitHub Pages : https://rpzsrt9hj9-max.github.io/Claude/deplacements/
const BASE = process.env.BASE ?? '/Claude/deplacements/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Préparation de déplacements',
        short_name: 'Déplacements',
        description: 'Tâches, matériel et outillage à emporter pour chaque déplacement',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Les anciennes versions conservées (v1/, v2/…) ne doivent pas être servies par cette version.
        navigateFallbackDenylist: [/\/v\d+(\.\d+)?\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.js'] },
});
