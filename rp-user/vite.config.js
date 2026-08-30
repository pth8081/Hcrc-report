import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxy /api sang rp-server (cổng 4001) — tránh phải cấu hình
// CORS khi phát triển; production build phục vụ tĩnh sau Nginx cùng domain
// với rp-server nên không cần proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4001',
        changeOrigin: true
      }
    }
  }
});
