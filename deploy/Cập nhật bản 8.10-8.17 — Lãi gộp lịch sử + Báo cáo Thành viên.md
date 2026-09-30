# Hướng dẫn cập nhật hệ thống từ bản 8.10 lên bản 8.17

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.11-8.17 trong mã nguồn nếu cần biết
chi tiết từng thay đổi).

Đợt cập nhật này gồm: cố định tiêu đề/2 cột đầu khi cuộn bảng báo cáo web
(8.11), sửa "Lãi gộp" dữ liệu LỊCH SỬ (Cùng kỳ năm trước) sang đúng công
thức `SURPLUS`/`TRANS_CODE` — cùng đợt sửa đã áp dụng cho dữ liệu Live ở
bản 8.10 (8.12), tính năng MỚI "Báo cáo doanh thu Thành viên" — đọc Live
trực tiếp từ 35 cửa hàng thay vì qua CSDL trung tâm (8.13-8.15), và thêm nút
"Tải file mẫu" cho 2 trang Nhập hàng loạt mới (8.17).

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** (`etl-db/schema.sql`,
`rp-db/schema.sql`, `dwh/schema.sql`, `api-db/schema.sql` — không file nào
thay đổi từ bản 8.10) — KHÔNG cần chạy lại file `schema.sql` nào, bỏ qua
bước đó so với các đợt cập nhật trước.

---

## Bước 1 — Lấy code mới nhất

Trên máy chủ đang chạy thật (KHÔNG phải máy dev), vào đúng thư mục gốc mã
nguồn rồi chạy:

```bash
git pull origin main
```

---

## Bước 2 — Build lại giao diện

Chỉ **2 giao diện có đổi** ở đợt này (`api-admin` KHÔNG đổi, build lại
cũng không hại gì nếu muốn làm cho đồng bộ 3 giao diện như thường lệ):

```bash
cd etl-admin && npm run build && cd ..
cd rp-user   && npm run build && cd ..
```

Sau khi build xong, copy đúng thư mục `dist/` mới của từng app vào đúng
chỗ Nginx (hoặc `serve-static.js`) đang trỏ tới, theo cấu hình đã dùng lúc
triển khai ban đầu (xem `deploy/Hướng dẫn triển khai PM2.md` mục 7, hoặc
`deploy/Hướng dẫn triển khai sử dụng PM2 + Nginx.md`).

---

## Bước 3 — Restart backend Node

Chỉ **`etl` có đổi code chạy nền** ở đợt này (route mới cho Nhập hàng loạt
Sync Job + Xuất/Nhập file mã hoá Nguồn dữ liệu + "Tải file mẫu"). `rp-server`/
`api-server` KHÔNG đổi code chạy nền (chỉ thêm/sửa SCRIPT chạy tay ở Bước
7/8, không phải route server) — restart cũng không hại gì nếu muốn làm cho
đồng bộ:

```bash
pm2 restart etl
```

(Chạy `pm2 list` trước nếu không nhớ chính xác tên process đã đặt lúc
`pm2 start`.)

---

## Bước 4 — (BẮT BUỘC) Cập nhật VIEW dữ liệu Lịch sử — sửa "Lãi gộp" bản 8.12

Bản 8.10 đã sửa đúng "Lãi gộp" cho dữ liệu **Live** (CSDL `DSMART16`). Bản
8.12 sửa NỐT dữ liệu **Lịch sử** ("Cùng kỳ năm trước", CSDL `DSMART16_EOM`)
theo ĐÚNG công thức đó — nếu bỏ qua bước này, cột "Cùng kỳ năm trước"/"Tỷ
lệ % LFL" ở cả 4 báo cáo vẫn hiện SAI (công thức cũ).

1. Mở SQL Server Management Studio, connect vào CSDL `DSMART16_EOM`.
2. Mở file `báo cáo doanh thu cuối ngày.md` (trong mã nguồn) → mục
   **"Script B — chạy trên CSDL `DSMART16_EOM` (Lịch sử)"** → copy TOÀN BỘ
   khối SQL (`DECLARE @sql...` cho tới hết, gồm cả phần tạo stored
   procedure `sp_HCRC_RebuildDoanhThuView` ngay sau đó) → dán vào cửa sổ
   Query mới → **Execute (F5)**.
3. Không có dòng lỗi đỏ là thành công. Kiểm tra: `Views` → thấy
   `V_HCRC_DOANHTHU_CHINHANH`/`V_HCRC_GIAODICH_CHINHANH` (đã có sẵn từ
   trước, giờ định nghĩa bên trong đã đổi).

---

## Bước 5 — (BẮT BUỘC) Đồng bộ lại dữ liệu Lịch sử đã lưu trước đó

VIEW đổi công thức KHÔNG tự làm lại dữ liệu NGÀY CŨ đã đồng bộ trước đó
(cơ chế watermark — xem `VERSION.md` mục 8.5 nếu cần hiểu sâu) — bắt buộc
chạy 2 script sau để xoá + đồng bộ lại đúng dữ liệu Lịch sử:

```bash
cd etl
node scripts/resyncDoanhThuChinhanhHistory.js           # xem trước, không đổi gì
node scripts/resyncDoanhThuChinhanhHistory.js --confirm # thực sự xoá + đồng bộ lại
node scripts/resyncGiaodichChinhanhHistory.js           # xem trước, không đổi gì
node scripts/resyncGiaodichChinhanhHistory.js --confirm # thực sự xoá + đồng bộ lại
```

> **LƯU Ý THỜI GIAN**: job Lịch sử giữ ~93 tháng dữ liệu — sau `--confirm`,
> đồng bộ lại TOÀN BỘ có thể mất VÀI GIỜ (khác job Live chỉ vài phút) — nên
> chạy vào giờ thấp điểm, theo dõi qua `etl-admin → Log`. Trong lúc đang
> đồng bộ lại, cột "Cùng kỳ năm trước"/"Tỷ lệ % LFL" sẽ tạm trống/thiếu dữ
> liệu các tháng cũ — BÌNH THƯỜNG, không phải lỗi mới.

---

## Bước 6 — (BẮT BUỘC) Cập nhật danh mục báo cáo

Script này giờ tạo/cập nhật **CẢ 4 báo cáo** (2 báo cáo gốc + 2 báo cáo
"Thành viên" mới) trong 1 lượt, an toàn chạy lại nhiều lần:

```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js
```

Nếu KHÔNG triển khai "Báo cáo Thành viên" ở đợt này, dừng lại đây — 2 báo
cáo mới sẽ được tạo nhưng CHƯA có Nguồn dữ liệu/Sync Job Live nào trỏ vào
domain của chúng (cột Doanh thu/Giao dịch trống), không ảnh hưởng gì tới 2
báo cáo gốc đang chạy. Làm tiếp Bước 7 khi nào sẵn sàng triển khai.

---

## Bước 7 — (TUỲ CHỌN — chỉ khi triển khai "Báo cáo doanh thu Thành viên")

Tính năng đọc Doanh thu/Giao dịch Live trực tiếp từ 35 cửa hàng "Thành
viên" — hướng dẫn ĐẦY ĐỦ (kiến trúc, giả định cần xác nhận, kiểm tra sau
triển khai) ở file **`báo cáo doanh thu thành viên.md`** (mã nguồn), tóm
tắt các lệnh chạy ở đây:

**7.1 — Tạo VIEW tại MỖI cửa hàng (35 lần, làm tại từng CSDL DSMART16 của
từng cửa hàng)** — xem "báo cáo doanh thu thành viên.md" mục "Bước 1"
(SQL đã chép nguyên văn trong đó, không cần mở thêm file nào khác).

**7.2 — Tạo 35 Nguồn dữ liệu + tối đa 70 Sync Job Live**:
```bash
cd etl
# Mở scripts/seedThanhVienLiveSync.js, sửa mảng STORES ở đầu file (35 dòng
# name/server/password — tên/IP/mật khẩu THẬT của từng cửa hàng; Username
# đã cố định "etl_reader", không cần sửa), lưu file, rồi chạy:
node scripts/seedThanhVienLiveSync.js
```
An toàn chạy lại nhiều lần — cửa hàng chưa sửa xong/chưa kết nối được sẽ
bị bỏ qua phần Sync Job (script in rõ lý do), không ảnh hưởng cửa hàng đã
xong. (Nếu thích thao tác qua giao diện thay vì sửa code, trang "Nguồn dữ
liệu"/"Đồng bộ" ở etl-admin từ bản 8.17 đều có nút **"Tải file mẫu"** —
file mẫu Sync Job đã điền sẵn đúng khuôn 2 dòng Doanh thu/Giao dịch, chỉ
cần đổi tên/nguồn theo từng cửa hàng rồi nhập lại qua "Nhập hàng loạt".)

**7.3 — Tạo 2 Sync Job Lịch sử (Thành viên) tập trung** (tái dùng nguồn +
VIEW trung tâm đã có, KHÔNG tạo gì mới ở CSDL trung tâm):
```bash
node scripts/seedThanhVienHistorySync.js
```

**7.4 — Gán quyền xem 2 báo cáo Thành viên** (copy nguyên vẹn quyền từ 2
báo cáo gốc):
```bash
cd ../rp-server
node scripts/seedThanhVienReportPermissions.js
```

---

## Bước 8 — Kiểm tra sau khi cập nhật

- [ ] Mở bảng 1 báo cáo bất kỳ (HCRC/LDTD) trên web — cuộn ngang/dọc bảng
      thấy tiêu đề cột + cột TT/tên chi nhánh cố định, không phải cuộn cả
      trang (bản 8.11).
- [ ] Xuất báo cáo HCRC/LDTD — cột "Cùng kỳ năm trước"/"Tỷ lệ % LFL" ra số
      hợp lý (không còn 0 hàng loạt hay lệch bất thường so với "Thực đạt"
      kỳ hiện tại) — cần đợi Bước 5 đồng bộ lại xong (có thể vài giờ).
- [ ] `rp-user → Báo cáo`: thấy đủ 4 báo cáo (2 gốc + 2 "(Thành viên)").
- [ ] `etl-admin → Nguồn dữ liệu`: có nút "Xuất file mã hoá" và mục "Nhập
      file mã hoá" (bản 8.13).
- [ ] `etl-admin → Đồng bộ`: có mục "Nhập hàng loạt" (Excel) ở cuối trang
      (bản 8.13).
- [ ] `etl-admin → Nguồn dữ liệu`/`→ Đồng bộ`: cả 2 mục Nhập hàng loạt đều
      có nút "Tải file mẫu" (bản 8.17).
- [ ] (Nếu làm Bước 7) `etl-admin → Nguồn dữ liệu`: đủ 35 dòng cửa hàng
      "Thành viên"; `→ Đồng bộ`: đủ tối đa 70 job Live + 2 job Lịch sử
      (Thành viên), tất cả "Bật", "Kiểm tra schema" ra ✅.
- [ ] (Nếu làm Bước 7) `rp-user → Báo cáo`: mở 2 báo cáo "Thành viên", có
      số liệu (không trống toàn bộ cột Doanh thu — nếu trống, xem lại phần
      "GIẢ ĐỊNH CẦN XÁC NHẬN" ở đầu "báo cáo doanh thu thành viên.md").

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
