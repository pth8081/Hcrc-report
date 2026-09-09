# Hcrc-report-
Báo cáo cho hcrc

## Triển khai

Cả 3 hệ thống (`etl/`, `rp-server/`, `api-server/`) + 3 giao diện tĩnh
(`rp-user/`, `api-admin/`, `etl-admin/`) trên cùng 1 máy chủ ứng dụng,
CSDL SQL Server trên máy chủ riêng — xem `deploy/Hướng dẫn triển khai
PM2.md` (chạy bằng PM2, không cần Nginx) hoặc `deploy/Hướng dẫn triển khai
sử dụng PM2 + Nginx.md` (thêm domain/HTTPS riêng cho từng trang) tuỳ nhu
cầu, và `deploy/Hướng dẫn nghiệp vụ.md` (tài khoản/phân quyền/vận hành).
