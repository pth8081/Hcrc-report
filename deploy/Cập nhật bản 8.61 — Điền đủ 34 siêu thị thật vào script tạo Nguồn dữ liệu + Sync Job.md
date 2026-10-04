# Cập nhật bản 8.61 — Điền đủ 34 siêu thị thật vào script tạo Nguồn dữ liệu + Sync Job

## Vấn đề

Người dùng gửi file Excel "Nguồn dữ liệu" thật (34 siêu thị, đủ cột
Name/Server/DatabaseName/Username/Password/Engine/Port/Encrypt/
TrustServerCert) và file `etl/scripts/seedThanhVienLiveSync.js` (có sẵn từ
bản 8.15 — xem "báo cáo doanh thu thành viên.md" — nhưng danh sách
`STORES` vẫn là bản mẫu `CHANGE_ME`), hỏi có thể dựng sẵn script để chạy 1
lệnh là tạo xong cả 34 Nguồn dữ liệu + 68 Sync Job Live (Doanh thu + Giao
dịch) không — thay vì nhập 2 file Excel (Nguồn dữ liệu + Sync Job) qua
giao diện etl-admin như cách đã làm trước đó.

## Thay đổi

`etl/scripts/seedThanhVienLiveSync.js` — mảng `STORES` điền đủ 34 dòng
thật (tên + Server/IP đúng theo file Excel), bỏ đoạn kiểm tra "còn
CHANGE_ME thì dừng lại" (không cần nữa).

**Port**: người dùng yêu cầu dùng CHUNG 1 giá trị cố định **1433** cho mọi
siêu thị (`DEFAULT_PORT`), KHÔNG dùng cột Port riêng từng dòng trong file
Excel gốc (file Excel có port khác nhau mỗi dòng — 1433 đến 1465 — nhưng
hạ tầng thật của người dùng chỉ dùng 1 port cố định cho tất cả).

Username (`etl_reader`)/Password/DatabaseName (`DSMART16`)/Encrypt
(`false`)/TrustServerCert (`false`) dùng chung 1 giá trị, khớp đúng mọi
dòng trong file Excel — khai ở hằng số `DEFAULT_*`, không lặp lại cho
từng dòng trong `STORES`.

## CẢNH BÁO BẢO MẬT — đã hỏi lại và được người dùng xác nhận

Theo đúng quy ước đã ghi trong "báo cáo doanh thu thành viên.md", 2 file
Excel tương tự (chứa mật khẩu CSDL thật) **không được lưu vào Git**. Khi
người dùng yêu cầu commit file script này (đã điền mật khẩu thật) vào
Git, đã hỏi lại rõ ràng trước khi làm — người dùng xác nhận **"Có — commit
nguyên văn kể cả mật khẩu thật"**, chấp nhận rủi ro mật khẩu nằm vĩnh viễn
trong lịch sử Git của repo (xoá file sau này KHÔNG xoá được khỏi lịch sử
commit).

**Khuyến nghị mạnh**: đổi lại mật khẩu CSDL thật (`etl_reader`) ở CẢ 34
máy chủ sau khi đã chạy xong script này — coi như mật khẩu hiện tại đã bị
"lộ" (nằm trong Git), đổi mật khẩu mới rồi cập nhật lại qua etl-admin
(Nguồn dữ liệu → Sửa từng nguồn, hoặc sửa lại `STORES` + chạy lại script
— an toàn chạy lại nhiều lần).

## Các bước triển khai

1. `git pull origin main`.
2. **Bắt buộc làm trước** (nếu chưa làm): chạy file
   `deploy/Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị Thành
   viên.sql` tại CẢ 34 máy chủ SQL Server của từng siêu thị — script này
   chỉ KIỂM TRA VIEW đã tồn tại chưa, không tự tạo được.
3. `cd etl && node scripts/seedThanhVienLiveSync.js` — tạo/cập nhật 34
   Nguồn dữ liệu + tối đa 68 Sync Job Live. An toàn chạy lại nhiều lần
   (idempotent, khớp theo tên) — siêu thị nào chưa có VIEW sẽ tạo được
   Nguồn dữ liệu nhưng BỎ QUA tạo Sync Job (có log rõ ràng từng dòng),
   chạy lại script sau khi bổ sung VIEW xong.
4. Nếu CHƯA chạy lần nào trước đó:
   ```
   cd rp-server
   node scripts/seedLdtdHcrcReports.js
   node scripts/seedThanhVienReportPermissions.js
   ```
5. Kiểm tra: etl-admin → Nguồn dữ liệu (đủ 34 dòng, "Kiểm tra kết nối"
   thành công) → Đồng bộ (đủ 68 job Live, "Bật") → Log (sau vài phút thấy
   job đã chạy thành công ít nhất 1 lần) → rp-user → Báo cáo (mở 2 báo
   cáo "Thành viên", so số với báo cáo gốc).
6. **Đổi lại mật khẩu CSDL thật ở cả 34 máy chủ** — xem mục cảnh báo bảo
   mật ở trên.

Không đổi cấu trúc CSDL `etl`/`rp`, không ảnh hưởng job/báo cáo khác đang
chạy.
