import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Đọc số phiên bản chung của cả hệ thống từ VERSION.md gốc repo (mục mới
// nhất luôn ở ĐẦU file, xem quy tắc đánh số ở đó) — nhúng thẳng vào bundle
// lúc build qua `define`, hiện ở sidebar (components/Layout.jsx) để IT nhìn
// giao diện là biết ngay đang chạy bản nào, không cần đối chiếu VERSION.md
// bằng tay. Đọc lỗi (vd build ngoài repo, thiếu file) không chặn build —
// chỉ hiện "?" ở sidebar.
function readAppVersion() {
  try {
    const text = readFileSync(resolve(__dirname, '../VERSION.md'), 'utf8');
    return text.match(/^## (\d+\.\d+)/m)?.[1] || '?';
  } catch {
    return '?';
  }
}
const APP_VERSION = readAppVersion();

// Ghi dist/version.json SAU KHI build xong — components/UpdateBanner.jsx đọc
// lại file này lúc CHẠY (không nằm trong bundle JS, không bị cache dài hạn
// như assets/ — xem NO_CACHE_FILES ở deploy/serve-static.js + catch-all
// no-cache của deploy/nginx.conf) để so với __APP_VERSION__ đã nhúng lúc
// TRANG ĐANG MỞ được tải. Khác nhau nghĩa là server đã build/deploy bản MỚI
// HƠN sau khi người dùng mở tab — trước đây không có cách nào biết ngoài tự
// Ctrl+F5, dễ dùng nhầm giao diện cũ.
function writeVersionFile() {
  return {
    name: 'write-version-json',
    closeBundle() {
      writeFileSync(resolve(__dirname, 'dist', 'version.json'), JSON.stringify({ version: APP_VERSION }));
    }
  };
}

// Dev server proxy /admin sang api-server (cổng 4002). Production build
// phục vụ tĩnh sau Nginx — CHỈ trong mạng nội bộ/VPN, không cùng đường ra
// Internet với /api/v1/* (xem api-server/README.md).
export default defineConfig({
  plugins: [
    react(),
    // PWA thật (manifest + service worker, bản 8.83, theo yêu cầu người
    // dùng — mirror rp-user/vite.config.js bản 6.18, trước đó CHỈ triển
    // khai rp-user theo đúng yêu cầu gốc) — cho phép "Thêm vào màn hình
    // chính" trên điện thoại. registerType:'autoUpdate' giống rp-user —
    // xem chú thích đầy đủ ở rp-user/vite.config.js.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      workbox: {
        cleanupOutdatedCaches: true
      },
      manifest: {
        name: 'HCRC — Quản trị API',
        short_name: 'HCRC API',
        description: 'Trang quản trị API Server HCRC — đối tác API, kết nối hiện tại, lịch sử',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1c7566',
        background_color: '#f4f6f7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    }),
    writeVersionFile()
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
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
