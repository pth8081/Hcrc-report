# Hướng dẫn triển khai gộp — bản 10.12 đến 10.14

Gộp 3 bản gần nhất (10.12/10.13/10.14) thành 1 trình tự DUY NHẤT. Nội dung
chi tiết từng bản (nguyên nhân, trước/sau, cách verify) vẫn ở `VERSION.md`
và `deploy/Nhật ký triển khai (từ bản 8.31).md` — không chép lại ở đây để
tránh 2 nơi lệch nhau khi có sửa thêm sau này.

## 1. Tổng quan 3 bản

| Bản | Nội dung | Phần hệ thống ảnh hưởng |
|---|---|---|
| 10.12 | Sửa lại SAI ý nghĩa mã giao dịch 130/133/330/333 — "Đơn đặt hàng"/"Đơn nhập hàng" và 2 báo cáo "Giá trị...theo đơn" trước đây lọc sai mã, khiến "Đơn nhập hàng" chỉ ra được dữ liệu mua chung | rp-server |
| 10.13 | Bỏ cột "Mã siêu thị" thừa ở trang "Chỉ tiêu Nhập hàng theo ngành hàng" (file mẫu/bảng chỉ còn đúng 3 cột cần) | etl + etl-admin |
| 10.14 | 5 mục "Chỉ tiêu" trên sidebar etl-admin bắt buộc quyền SỬA mới thấy (giống 4 mục "Cấu hình khác") — tránh hiểu nhầm cấp quyền "Xem" là cho nhập được | etl-admin |

Không bản nào đổi schema CSDL hay cần DBA — thuần code ứng dụng.

## 2. Trình tự triển khai 1 lượt

**Bước 1 — lấy code mới nhất (dùng chung cho cả 3 bản):**
```
git pull origin main
```

**Bước 2 — rp-server (bản 10.12):**
```
pm2 restart hcrc-rp-server
cd rp-server
node scripts/seedPurchaseOrderReports.js
```
⚠️ Lệnh `node scripts/seedPurchaseOrderReports.js` **BẮT BUỘC** — 4 báo
cáo mua hàng đã lưu sẵn mã giao dịch CŨ (sai) trong CSDL, chỉ sửa code
không tự cập nhật lại. An toàn chạy lại nhiều lần (không tạo trùng báo
cáo).

**Bước 3 — etl backend (bản 10.13):**
```
cd etl
npm install
pm2 restart hcrc-etl   (hoặc đúng tên process pm2 đang dùng cho backend etl)
```

**Bước 4 — etl-admin (bản 10.13 + 10.14, build 1 lần là đủ cho cả 2):**
```
cd etl-admin
npm install
npm run build
```
Deploy lại thư mục `etl-admin/dist/` như quy trình hiện có (copy lên
server / restart static server tuỳ cấu hình).

## 3. Kiểm tra sau khi triển khai

- **10.12** — mở báo cáo "Đơn nhập hàng", lọc "Kênh mua" = "Mua riêng" cho
  1 khoảng ngày có dữ liệu — phải ra kết quả (trước bản này sẽ RỖNG). Mở
  "Đơn đặt hàng", lọc "Kênh mua" = "Mua chung (qua Fuji)" — vẫn ra kết quả
  như trước.
- **10.13** — mở "Chỉ tiêu Nhập hàng theo ngành hàng" → "Tải file mẫu" —
  file .xlsx chỉ còn 3 cột `Thang`/`MaNganhHang`/`ChiTieuGiaTriNhap`, không
  còn `MaSieuThi`. Bảng "Chỉ tiêu đã nhập" hiện cột "Mã ngành hàng".
- **10.14** — với 1 tài khoản CHỈ được tick "Xem" (không "Sửa") cho 1 mục
  chỉ tiêu bất kỳ ở trang "Vai trò" — đăng nhập tài khoản đó, mục chỉ tiêu
  đó KHÔNG còn hiện trên sidebar. Tick thêm "Sửa" rồi tải lại — mục hiện
  ra đúng, vào được và thấy form "Nhập chỉ tiêu".

**Lưu ý dữ liệu cũ (bản 10.13)**: nếu trang "Chỉ tiêu Nhập hàng theo ngành
hàng" đã có dòng nhập nhầm từ trước (dùng sai file mẫu của trang "Doanh
thu theo ngành hàng") — chọn nhiều + "Xoá N mục đã chọn" rồi nhập lại bằng
file mẫu MỚI (tải lại sau khi deploy xong bản 10.13).

**Lưu ý phân quyền (bản 10.14)**: nếu trước đây có vai trò nào chỉ được
tick "Xem" (không "Sửa") cho 1 trong 5 mục "Chỉ tiêu" — sau khi deploy họ
sẽ KHÔNG còn thấy mục đó trên sidebar. Vào "Vai trò" tick thêm "Sửa" cho
đúng mục/vai trò cần — muốn người thực hiện nhập được chỉ tiêu thì luôn
tick "Sửa", không tick "Xem" một mình.
