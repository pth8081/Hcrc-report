import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev server proxy /api sang rp-server (cổng 4001) — tránh phải cấu hình
// CORS khi phát triển; production build phục vụ tĩnh sau Nginx cùng domain
// với rp-server nên không cần proxy.
export default defineConfig({
  plugins: [
    react(),
    // PWA thật (manifest + service worker) — cho phép "Thêm vào màn hình
    // chính" trên điện thoại và (sau này, nếu cần) đóng gói lên Play
    // Store qua TWA. registerType:'autoUpdate' để bản mới TỰ kích hoạt +
    // nạp lại ở lần điều hướng/tải trang kế tiếp, không cần người dùng tự
    // xoá cache — cùng tinh thần sửa Cache-Control ở deploy/serve-static.js
    // (đừng để PWA tự tạo ra một tầng cache MỚI lại giữ bản cũ y như lỗi
    // vừa sửa). Không bật devOptions — service worker chỉ hoạt động ở bản
    // build thật (`npm run build`), không can thiệp `npm run dev`/HMR.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      workbox: {
        cleanupOutdatedCaches: true
      },
      manifest: {
        name: 'Báo cáo HCRC',
        short_name: 'HCRC',
        description: 'Hệ thống báo cáo HCRC',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#b5551f',
        background_color: '#f4f6f7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
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
