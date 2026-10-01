# Hướng dẫn cập nhật hệ thống lên bản 8.25

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.25 trong mã nguồn nếu cần biết chi
tiết).

Đây là **SỬA LỖI DỮ LIỆU ĐANG CHẠY THẬT** — job đồng bộ "Doanh thu/Giao
dịch chi nhánh - Live" bị đứng yên trong ngày (không cập nhật số liệu mới
phát sinh), và job "Giao dịch chi nhánh - Lịch sử" thiếu hẳn dữ liệu năm
2025 — nên áp dụng SỚM, không đợi đợt release định kỳ.

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` nào.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

**Chỉ `etl` có đổi** (`etl/lib/tableSyncEngine.js`) — không cần build lại
`rp-user`.

---

## Bước 2 — Restart tiến trình ETL

```bash
pm2 restart etl
```

(hoặc đúng tên tiến trình ETL đang chạy trên máy chủ của bạn — kiểm tra
`pm2 list` nếu không chắc tên).

---

## Bước 3 — Kiểm tra Live đã tự khỏi

Chờ tối đa 1 lượt chạy (thường 5-15 phút tuỳ `CronExpression` của từng
job) rồi vào **etl-admin → Nhật ký hệ thống**, lọc đúng job "Doanh thu/Giao
dịch chi nhánh - Live" — xác nhận dòng log KHÔNG còn lặp lại "Không có
dòng nào thay đổi kể từ \<đúng 00:00:00 hôm nay\>" mãi — thay vào đó phải
thấy số dòng xử lý > 0 khi có giao dịch mới phát sinh trong ngày.

---

## Bước 4 — (BẮT BUỘC, 1 lần) Backfill lại lịch sử Giao dịch chi nhánh

Domain `giaodich_chinhanh` bị mất dữ liệu năm 2025 (và có thể vài năm
trước đó) do dính đúng lỗi này trong các lượt đồng bộ lịch sử trước khi
được sửa — cần xoá sạch domain này rồi để job tự đồng bộ lại TOÀN BỘ từ
đầu với code đã sửa (đã có sẵn script an toàn, KHÔNG viết SQL tay):

```bash
cd etl
node scripts/resyncGiaodichChinhanh.js            # xem trước — chỉ đếm, KHÔNG xoá gì
node scripts/resyncGiaodichChinhanh.js --confirm   # thực sự xoá + reset mốc đồng bộ
```

Sau khi chạy `--confirm`:
- Job "Giao dịch chi nhánh - Live" (chạy mỗi vài phút) sẽ tự có dữ liệu
  hôm nay trở lại trong vài phút.
- Job "Giao dịch chi nhánh - Lịch sử" (chạy đêm, hoặc bấm "Chạy thử" ngay
  trên etl-admin cho nhanh) sẽ kéo lại TOÀN BỘ lịch sử nhiều năm — có thể
  mất **vài giờ** tuỳ khối lượng, theo dõi tiến độ qua etl-admin → Log.
- Trong lúc đang đồng bộ lại, cột "Giao dịch - Thực đạt"/"Cùng kỳ năm
  trước" của báo cáo HCRC/LDTD sẽ TẠM TRỐNG/THIẾU — đây là BÌNH THƯỜNG,
  không phải lỗi mới, sẽ tự đầy đủ lại khi job chạy xong.

---

## Bước 5 — Kiểm tra sau khi cập nhật

- [ ] etl-admin → Nhật ký hệ thống: job Live (Doanh thu + Giao dịch) không
      còn đứng yên cả ngày — số liệu cập nhật đúng theo giao dịch thật phát
      sinh.
- [ ] Chạy lại trên **DWH**, xác nhận năm 2025 đã có đủ dữ liệu theo ngày
      (không còn khoảng trống dài như trước khi sửa):
      ```sql
      SELECT FORMAT(EventDate, 'yyyy-MM') AS Thang, COUNT(*) AS SoDong
      FROM dwh.ReportFacts
      WHERE Domain = 'giaodich_chinhanh' AND EventDate >= '2025-01-01'
      GROUP BY FORMAT(EventDate, 'yyyy-MM') ORDER BY Thang;
      ```
- [ ] Mở báo cáo "Báo cáo doanh thu cuối ngày HCRC/LDTD" (chế độ "Đầy đủ
      kèm Cùng kỳ năm trước") — cột "Cùng kỳ năm 2025"/"Tỷ lệ % LFL" của
      Giao dịch đã hiện số, không còn trống.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
