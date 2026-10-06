# Hướng dẫn triển khai gộp — bản 8.91 đến 8.93 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 8.91 tới bản 8.93 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 8.90 và cần bắt
kịp bản mới nhất — KHÔNG lặp lại toàn bộ lịch sử từ bản 8.29 (xem
`deploy/Hướng dẫn triển khai gộp — bản 8.29 đến 8.90.md` nếu cần dựng
server hoàn toàn mới từ đầu).

Cả 3 bản (8.91/8.92/8.93) đều thuộc **CÙNG 1 TÍNH NĂNG CHƯA TỪNG LÊN
PRODUCTION**: 3 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận"
(bắt đầu thiết kế từ bản 8.75) — khác các hướng dẫn gộp trước (vốn gộp
nhiều tính năng ĐÃ ỔN ĐỊNH), hướng dẫn này là **các bước kích hoạt LẦN
ĐẦU** cho đúng 1 tính năng, gồm cả bước tạo VIEW trên CSDL nguồn (DSMART16)
— không chỉ `git pull` + restart như thường lệ.

Tài liệu tham chiếu đầy đủ (bối cảnh, lịch sử trao đổi với DBA, câu hỏi
còn mở): `bc-don-dat-hang.md` (gốc repo) — đọc file này nếu cần hiểu SÂU
hơn phần tóm tắt dưới đây.

---

## Tóm tắt những gì thay đổi (8.91 → 8.93)

| Bản | Nội dung |
|---|---|
| 8.91 | Sửa thiết kế dùng SAI mã `STK_ID` → đổi đúng sang `BU_ID` (đối chiếu "quy tắc mã BU_ID và STK_ID.md") |
| 8.92 | Chốt nguồn dữ liệu THẬT là `STRANS` (thay giả định ban đầu `ST_ORDER`) — `TRANS_CODE` 133=đặt hàng/333=nhập hàng, mỗi loại 1 dòng riêng, cột `REF`=mã đơn hàng gốc dùng gộp nhiều lần nhận hàng |
| 8.93 | Sửa 2 lỗi lộ ra khi chạy VIEW thật lần đầu: `STRANS` không có cột `PRICE` (tính `DonGia` từ `AMOUNT/QTY`), watermark `STOPED_DT` NULL hết (đổi dùng `EventDate`) |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Tạo VIEW trên DSMART16 (BẮT BUỘC, làm TRƯỚC — 1 LẦN DUY NHẤT, TRUNG TÂM)

Chạy NGUYÊN VĂN file `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So
sánh (DSMART16 trung tâm).sql` trên CSDL DSMART16 **trung tâm** (KHÁC
VIEW đồng bộ dữ liệu thành viên — VIEW này chạy **1 LẦN DUY NHẤT**, không
phải mỗi siêu thị 1 lần, vì đơn đặt/nhập hàng đã nằm chung 1 CSDL trung
tâm, phân biệt bằng cột `BU_ID`).

An toàn chạy lại nhiều lần (`CREATE OR ALTER VIEW`) — nếu server đã chạy
bản VIEW cũ (trước bản 8.93, còn dùng cột `PRICE`), chạy lại file MỚI
NHẤT này để thay thế, không cần xoá VIEW cũ trước.

(Tuỳ chọn) Kiểm tra có dữ liệu thật trước khi qua bước C:
```sql
SELECT TOP 20 * FROM dbo.vw_DonDatHangChiNhanh ORDER BY EventDate DESC;
```

---

## C. Tạo job đồng bộ (BẮT BUỘC, chạy trên máy chủ ETL)

Cần sẵn 3 biến môi trường trong `etl/.env` (dùng LẠI được nếu máy chủ đã
chạy báo cáo doanh thu cuối ngày/tồn kho từ DSMART16 — không cần khai
thêm):
```
DSMART16_SERVER=...
DSMART16_USER=...
DSMART16_PASSWORD=...
```

Rồi chạy:
```bash
cd etl
node scripts/seedDonDatHangSync.js
```

Script tự đối chiếu VIEW với schema thật, DỪNG LẠI và báo lỗi rõ ràng nếu
thiếu cột (không tạo job cấu hình sai âm thầm) — không cần khởi động lại
`hcrc-etl`, scheduler tự nạp job mới trong tối đa 60 giây.

---

## D. Đăng ký 3 báo cáo (BẮT BUỘC, chạy trên máy chủ report)

```bash
cd rp-server
node scripts/seedPurchaseOrderReports.js
```

Menu "Báo cáo Mua hàng" (`reports-mua-hang`) đã có sẵn trong
`rp-db/schema.sql`, script tự dùng đúng menu này — không cần tạo thêm.
Không cần restart `hcrc-rp-server` (script chỉ ghi dữ liệu catalog, không
đổi code đang chạy).

---

## E. Gán quyền xem (BẮT BUỘC, làm tay — 2 script trên KHÔNG tự gán)

Vào **Hệ thống → Phân quyền** (etl-admin hoặc rp-user, tuỳ nơi quản lý
phân quyền báo cáo), gán quyền xem 3 `ReportId` sau cho đúng vai trò/
người dùng cần xem:

- `bc-don-dat-hang` ("Đơn đặt hàng")
- `bc-don-nhap-hang` ("Đơn nhập hàng")
- `bc-so-sanh-dat-nhan` ("So sánh đặt–nhận")

---

## F. Kiểm tra sau khi triển khai

- [ ] **(8.91/8.92, mã siêu thị)** Siêu thị nào KHÔNG hiện trong báo cáo
  dù có đơn hàng thật → kiểm tra đã khai đủ cột `BuId` (tường minh, KHÔNG
  tự suy "+00") trong bảng "Ánh xạ Điểm - STK_ID" cho đúng mã `BU_ID` đó
  chưa.
- [ ] **(8.93, cột PRICE)** `SELECT TOP 20 * FROM
  dbo.vw_DonDatHangChiNhanh` → cột `DonGia` ra số hợp lý (không phải
  NULL/0 toàn bộ) — nếu VIEW chưa chạy lại bản mới (còn bản cũ dùng
  `PRICE`), câu `SELECT` sẽ báo lỗi `Invalid column name 'PRICE'`, quay
  lại bước B.
- [ ] **(8.93, watermark)** Sau khi job đồng bộ chạy ít nhất 1 lần (chờ
  tối đa 15 phút) — vào etl-admin → "Đồng bộ" → job "Đơn đặt hàng - nhập
  hàng (DSMART16)" → số dòng đồng bộ > 0 (KHÔNG phải "0 dòng" lặp lại mãi
  — đó là dấu hiệu watermark vẫn còn dùng cột NULL).
- [ ] **(chung)** rp-user → menu "Báo cáo Mua hàng" → mở cả 3 báo cáo →
  có số liệu, đúng tên siêu thị; báo cáo "So sánh đặt–nhận" → 1 đơn được
  nhận NHIỀU LẦN → cột "SL thực nhận" CỘNG DỒN đúng tổng các lần nhận
  (không chỉ lấy lần nhận gần nhất).

**Còn CHƯA xác nhận, KHÔNG chặn việc triển khai** (nếu thấy sai lệch số
liệu, đây là 2 chỗ xem lại đầu tiên):

- Mã trạng thái MỚI `TrangThai = 'N'` (ngoài 6 mã C/P/F/M/D/E đã biết
  trước đây) — không gây lỗi, chỉ hiện tạm mã thô thay vì nhãn tiếng Việt.
- `DonGia` tính từ `AMOUNT/QTY` — có thể cần đối chiếu thêm với cách
  hiểu "đơn giá" thực tế trên phiếu giấy cho 2 loại giao dịch 133/333.

Không có bước nào ở trên làm mất dữ liệu đã có hoặc ảnh hưởng báo cáo/
job đồng bộ khác đang chạy ổn định.
