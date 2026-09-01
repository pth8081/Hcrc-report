# Hcrc-report-
Báo cáo cho hcrc

## Triển khai

Cả 3 hệ thống (`etl/`, `rp-server/`, `api-server/`) + 3 giao diện tĩnh
(`rp-user/`, `api-admin/`, `etl-admin/`) trên cùng 1 máy chủ ứng
dụng, đứng sau 1 Nginx, CSDL SQL Server trên máy chủ riêng — xem
`deploy/README.md` (hướng dẫn đầy đủ) và `deploy/nginx.conf` (cấu hình mẫu).
