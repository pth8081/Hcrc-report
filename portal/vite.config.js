import { defineConfig } from 'vite';

// Không có plugin framework nào — trang này không có state, không gọi API,
// chỉ cần Vite để nạp VITE_* từ .env lúc build (xem src/main.js).
export default defineConfig({
  server: { port: 5176 }
});
