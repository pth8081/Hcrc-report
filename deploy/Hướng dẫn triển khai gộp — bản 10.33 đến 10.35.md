# Hướng dẫn triển khai gộp — bản 10.33 đến 10.35 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 10.33 tới bản 10.35 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 10.32 hoặc cũ hơn
và cần bắt kịp bản mới nhất. Theo yêu cầu người dùng (gộp hướng dẫn thay
vì làm riêng từng bản).

Cả 3 bản đều xuất phát từ CÙNG 1 điều tra thật: "Lãi gộp" giữa báo cáo
"Doanh thu cuối ngày" gốc (HO) và Thành viên lệch nhau (xem chi tiết đầy
đủ ở "giá vốn dsmart.md" mục 9-10 và `VERSION.md`), CỘNG THÊM 2 yêu cầu
cải tiến giao diện lọc báo cáo (bản 10.35) phát sinh trong lúc trao đổi.

---

## Tóm tắt những gì thay đổi (10.33 → 10.35)

| Bản | Nội dung |
|---|---|
| 10.33 | **SỬA LỖI THẬT**: `STRANS.SURPLUS` (lãi gộp từng dòng) vẫn bị DSMART điều chỉnh SAU KHI 1 ngày đã "đóng" (qua watermark ngày mới) — job đồng bộ trước đây "đóng băng" vĩnh viễn giá trị lần đầu quét được. Thêm cột `etl.SyncJobs.RescanLookbackDays` — mỗi lượt chạy quét lại thêm N ngày gần nhất (đặt N=7 cho job "Doanh thu chi nhánh - Live" + cả 35 job "Doanh thu (TV) - \<siêu thị\>"). |
| 10.34 | **SỬA LỖI THẬT (tiếp)**: bản 10.33 KHÔNG xử lý được lệch Lãi gộp xảy ra NGAY TRONG NGÀY (SURPLUS biến động liên tục, không chỉ sau khi đóng ngày) — job gốc đồng bộ mỗi 15 phút trong khi Thành viên mỗi 2 phút, 2 bên "chụp" SURPLUS lệch nhau tới 15 phút. Rút `cronExpression` job "Doanh thu chi nhánh - Live" xuống `*/2 * * * *`, khớp Thành viên. |
| 10.35 | Thêm tính năng **dán danh sách để tự chọn** cho MỌI bộ lọc nhiều lựa chọn trong toàn hệ thống (`SearchableSelect.jsx` — component dùng chung); sửa bộ lọc động (vd "Mã hàng"/"Nhà cung cấp") tải chậm — tăng TTL cache từ 10 phút lên 2 giờ. |

Xem đầy đủ lý do/chi tiết kỹ thuật ở `VERSION.md` (mục "10.33"-"10.35"),
`deploy/Nhật ký triển khai (từ bản 8.31).md`, và "giá vốn dsmart.md" mục
9-10 (toàn bộ quá trình điều tra Lãi gộp lệch).

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Các bước triển khai (gộp cả 3 bản, theo ĐÚNG THỨ TỰ)

1. `git pull origin main` (đã làm ở mục A).

2. Chạy lại `etl-db/schema.sql` trên CSDL ETL admin — thêm cột mới
   `etl.SyncJobs.RescanLookbackDays` (bản 10.33). An toàn chạy lại nhiều
   lần (script tự kiểm tra cột đã có hay chưa).

3. Khởi động lại `etl` (pm2 restart đúng tiến trình) — áp dụng logic quét
   lại N ngày mới (bản 10.33). **Ở bước này N=0 cho MỌI job hiện có —
   CHƯA đổi hành vi gì cho tới bước 4.**

4. Chạy 2 script sau (thư mục `etl/`, cả 2 đều idempotent, an toàn chạy
   lại nhiều lần):
   ```bash
   node scripts/seedLdtdHcrcSync.js
   node scripts/seedThanhVienLiveSync.js
   ```
   — áp dụng ĐỒNG THỜI cả bản 10.33 (đặt `RescanLookbackDays=7`) lẫn bản
   10.34 (đổi lịch chạy job gốc xuống `*/2 * * * *`) cho đúng các job
   liên quan (gốc + cả 35 job Thành viên).

   **⚠️ Khuyến nghị triển khai THÍ ĐIỂM cho Thành viên trước khi chạy
   `seedThanhVienLiveSync.js` cho CẢ 35 siêu thị**: job Thành viên vốn đã
   chạy mỗi 2 phút — quét thêm 7 ngày/lượt (bản 10.33) có thể tăng tải
   CSDL LOCAL của từng siêu thị, CHƯA đo tải thật. Có thể sửa tay file để
   test 1-2 siêu thị trước, hoặc chạy hết rồi theo dõi vài ngày, hạ
   `RescanLookbackDays` qua giao diện "Đồng bộ" (etl-admin) nếu thấy nặng
   — KHÔNG cần sửa code/deploy lại, field này chỉnh trực tiếp trên UI.

   **⚠️ Theo dõi riêng cho gốc (bản 10.34)**: job "Doanh thu chi nhánh -
   Live" đọc CSDL TRUNG TÂM (phục vụ TẤT CẢ siêu thị cùng lúc) — tần suất
   tăng gấp 7.5 lần (15 phút → 2 phút), CHƯA đo tải thật. Theo dõi log
   lỗi/hiệu năng server trung tâm vài ngày đầu; hạ lại lịch chạy qua giao
   diện "Đồng bộ" ngay nếu cần, không cần sửa code.

5. Khởi động lại `rp-server` (pm2 restart) — áp dụng bản 10.35 (tăng TTL
   cache bộ lọc động lên 2 giờ).

6. Build lại 3 frontend (bản 10.35 — tính năng dán danh sách để tự chọn
   DÙNG CHUNG cho cả 3 app, chỉ cần build 1 lần):
   ```bash
   cd etl-admin && npm run build
   cd ../api-admin && npm run build
   cd ../rp-user && npm run build
   ```
   (Riêng etl-admin ở bản 10.33 còn có thêm field "Quét lại thêm (số ngày
   gần nhất)" ở trang "Đồng bộ" — build 1 lần ở bước này đã áp dụng đủ cả
   2 thay đổi của etl-admin.)

7. Deploy `dist/` của cả 3 app lên đúng nơi phục vụ tĩnh (copy file, hoặc
   đúng quy trình CI/CD hiện có của server).

**⚠️ Lưu ý riêng — bộ lọc "Mã hàng" (báo cáo Mua hàng) đang trống**: nếu
server CHƯA từng chạy `node scripts/seedPurchaseOrderReports.js` kể từ
bản 10.31 (thêm bộ lọc "Mã hàng"), bộ lọc này sẽ LUÔN trống (không phải
lỗi tải chậm ở bản 10.35 — đây là bước triển khai RIÊNG của bản 10.31,
không nằm trong phạm vi gộp 10.33-10.35 ở trên). Chạy bổ sung nếu chưa
từng chạy:
```bash
node scripts/seedPurchaseOrderReports.js
```

Không cần động tới `api-server` ở cả 3 bản này.

---

## C. Kiểm tra sau khi triển khai

- [ ] **(10.33)** "Đồng bộ" (etl-admin) → job "Doanh thu chi nhánh - Live
  (DSMART16)" và các job "Doanh thu (TV) - \<siêu thị\>" → cột "Quét lại
  (ngày)" hiện đúng `7`.
- [ ] **(10.34)** Cùng trang, job "Doanh thu chi nhánh - Live (DSMART16)"
  → cột "Lịch chạy" hiện đúng `*/2 * * * *`.
- [ ] **(10.33/10.34, theo dõi vài ngày)** So lại Lãi gộp 2 báo cáo "Doanh
  thu cuối ngày" LDTD/HCRC gốc và Thành viên cho CÙNG 1 ngày, CÙNG 1 thời
  điểm xem (vd ngay lúc báo cáo cuối ngày gửi email) — mức lệch phải GIẢM
  RÕ RỆT so với trước (không còn lệch hàng chục triệu như sự cố ngày
  28/10/2026 đã điều tra).
- [ ] **(10.35)** Mở BẤT KỲ báo cáo nào có bộ lọc nhiều lựa chọn (vd "Mã
  hàng"/"Nhà cung cấp"/"Siêu thị" ở nhóm báo cáo Mua hàng) → mở dropdown
  → copy 1 danh sách mã (vd từ Excel, mỗi mã 1 dòng) → dán vào ô "Tìm
  kiếm, hoặc dán cả danh sách..." → PHẢI tự động tick đúng các mã khớp,
  kèm 1 dòng thông báo "Đã chọn X/Y mã khớp...". Dán lại đúng 1 từ (không
  phải danh sách) → PHẢI quay về hành vi tìm kiếm/lọc nhìn bằng mắt như
  trước (không tự chọn gì).
- [ ] **(10.35)** Mở lại đúng bộ lọc vừa test — lần MỞ LẠI SAU (trong
  vòng 2 giờ) phải ra danh sách NGAY, không còn phải đợi như trước.
- [ ] **(10.31, nếu làm bổ sung ở trên)** Bộ lọc "Mã hàng" ở 6 báo cáo
  Mua hàng phải HIỆN RA danh sách mã hàng thật (không còn "Không có lựa
  chọn nào").

Không có bước nào ở 3 bản này làm mất dữ liệu đã có — bản 10.33/10.34
thuần đổi CẤU HÌNH job đồng bộ (quét lại/lịch chạy), bản 10.35 thuần sửa
giao diện lọc + thời gian giữ cache, không đụng tới dữ liệu đã lưu trong
CSDL.
