// src/apps.js — Danh mục ứng dụng nội bộ hiển thị trên portal. Thêm ứng
// dụng mới CHỈ cần thêm 1 phần tử vào đây + 1 biến VITE_*_URL trong .env —
// portal tự vẽ thêm 1 thẻ (xem src/main.js), không cần sửa index.html.
//
// "audience" CHỈ là nhãn hiển thị (giúp nhân viên biết cần VPN hay không
// trước khi bấm) — KHÔNG kiểm soát gì cả, portal không biết ai đang xem,
// không đăng nhập/không cookie. Quyền truy cập THẬT nằm ở chính từng ứng
// dụng (tài khoản + vai trò riêng) và ở tầng mạng/Nginx (xem
// deploy/README.md) — trang này chỉ là danh mục tĩnh, không phải lớp
// kiểm soát truy cập.
export const APPS = [
  {
    key: 'report',
    title: 'Report',
    desc: 'Báo cáo nghiệp vụ, dashboard nội bộ',
    envVar: 'VITE_REPORT_URL',
    fallback: 'http://localhost:5173',
    audience: 'Công khai'
  },
  {
    key: 'etl',
    title: 'ETL',
    desc: 'Nguồn dữ liệu, cấu hình đồng bộ',
    envVar: 'VITE_ETL_ADMIN_URL',
    fallback: 'http://localhost:5175',
    audience: 'Nội bộ / VPN'
  },
  {
    key: 'api',
    title: 'API',
    desc: 'Đối tác API, kết nối, thống kê',
    envVar: 'VITE_API_ADMIN_URL',
    fallback: 'http://localhost:5174',
    audience: 'Nội bộ / VPN'
  }
];
