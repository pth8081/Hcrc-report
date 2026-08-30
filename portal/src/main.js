// main.js — Vẽ danh mục ứng dụng từ src/apps.js, gán href từ biến môi
// trường lúc build (VITE_*). Không gọi API nào, không giữ state, không có
// form đăng nhập — trang này CHỈ điều hướng (chuyển hẳn trang, không phải
// route SPA) sang đúng ứng dụng đã có sẵn (rp-user/, api-admin/,
// etl-admin/), giữ nguyên cô lập giữa các hệ thống — xem tài liệu kiến
// trúc "Cổng Đăng Nhập HCRC", Phương án A.
import { APPS } from './apps.js';

const container = document.getElementById('cards');
for (const app of APPS) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = import.meta.env[app.envVar] || app.fallback;

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = app.title;

  const desc = document.createElement('span');
  desc.className = 'card-desc';
  desc.textContent = app.desc;

  const audience = document.createElement('span');
  audience.className = 'card-audience';
  audience.textContent = app.audience;

  card.append(title, desc, audience);
  container.appendChild(card);
}
