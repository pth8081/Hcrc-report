import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxy /admin sang ETL Server (cổng 4003). Production build phục
// vụ tĩnh CHỈ trong mạng nội bộ — cả etl-admin/ lẫn /admin/* của ETL không
// nên lộ ra Internet (xem etl/README.md).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/admin': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4003',
        changeOrigin: true
      }
    }
  }
});
