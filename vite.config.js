import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/campay': {
        target: 'https://demo.campay.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/campay/, '/api'),
      },
    },
  },
});