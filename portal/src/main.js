// main.js — Chỉ gán href từ biến môi trường lúc build (VITE_*). Không gọi
// API nào, không giữ state, không có form đăng nhập — trang này CHỈ điều
// hướng (chuyển hẳn trang, không phải route SPA) sang đúng ứng dụng đã có
// sẵn (frontend/, api-admin/, etl-admin/), giữ nguyên cô lập giữa 3 hệ
// thống — xem tài liệu kiến trúc "Cổng Đăng Nhập HCRC", Phương án A.
document.getElementById('link-report').href = import.meta.env.VITE_REPORT_URL || 'http://localhost:5173';
document.getElementById('link-etl').href = import.meta.env.VITE_ETL_ADMIN_URL || 'http://localhost:5175';
document.getElementById('link-api').href = import.meta.env.VITE_API_ADMIN_URL || 'http://localhost:5174';
