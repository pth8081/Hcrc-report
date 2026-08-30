import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxy /admin sang api-server (cổng 4002). Production build
// phục vụ tĩnh sau Nginx — CHỈ trong mạng nội bộ/VPN, không cùng đường ra
// Internet với /api/v1/* (xem api-server/README.md).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/admin': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4002',
        changeOrigin: true
      }
    }
  }
});
