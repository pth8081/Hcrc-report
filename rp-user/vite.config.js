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
// Ctrl+F5, dễ dùng nhầm giao diện cũ. KHÔNG liên quan tới service worker PWA
// (registerType:'autoUpdate' bên dưới) — cơ chế đó tự thay asset ngầm, không
// báo cho người dùng biết; version.json + UpdateBanner mới là kênh CHỦ ĐỘNG
// mời người dùng tải lại, đồng nhất với 2 giao diện admin còn lại (chúng
// không có service worker).
function writeVersionFile() {
  return {
    name: 'write-version-json',
    closeBundle() {
      writeFileSync(resolve(__dirname, 'dist', 'version.json'), JSON.stringify({ version: APP_VERSION }));
    }
  };
}

// Dev server proxy /api sang rp-server (cổng 4001) — tránh phải cấu hình
// CORS khi phát triển; production build phục vụ tĩnh sau Nginx cùng domain
// với rp-server nên không cần proxy.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
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
    }),
    // Đặt SAU VitePWA — closeBundle() chạy sau khi VitePWA đã quét dist/ để
    // sinh precache manifest, đảm bảo version.json KHÔNG bị cuốn vào cache
    // của service worker (phải luôn là request mạng thật, xem chú thích ở
    // writeVersionFile() phía trên).
    writeVersionFile()
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
