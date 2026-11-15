import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } }, // probar el build minificado: ahí se rompió el satélite
  // El worker de MapLibre sale como .mjs y nginx lo sirve como octet-stream: el navegador rechaza el worker y el mapa
  // no dibuja los cuadros de píxel. Como .js sale con tipo JavaScript.
  build: { rollupOptions: { output: { assetFileNames: (a) => (a.names?.[0] ?? a.name ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]' } } },
})
