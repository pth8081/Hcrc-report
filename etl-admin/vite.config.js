import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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

// Dev server proxy /admin sang ETL Server (cổng 4003). Production build phục
// vụ tĩnh CHỈ trong mạng nội bộ — cả etl-admin/ lẫn /admin/* của ETL không
// nên lộ ra Internet (xem etl/README.md).
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion())
  },
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
