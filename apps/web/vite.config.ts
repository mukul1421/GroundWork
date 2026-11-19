import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/azure-ai': {
        target: 'https://autoclip-gpt4o-mini-resource.services.ai.azure.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/azure-ai/, ''),
      },
      '/api/azure-openai': {
        target: 'https://autoclip-gpt4o-mini-resource.openai.azure.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/azure-openai/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
