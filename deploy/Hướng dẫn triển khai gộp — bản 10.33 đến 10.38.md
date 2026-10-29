# Hướng dẫn triển khai gộp — bản 10.33 đến 10.38 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 10.33 tới bản 10.38 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 10.32 hoặc cũ hơn
và cần bắt kịp bản mới nhất. Theo yêu cầu người dùng (gộp hướng dẫn thay
vì làm riêng từng bản).

Cả 6 bản đều xuất phát từ CÙNG 1 chuỗi điều tra/trao đổi thật: "Lãi gộp"
giữa báo cáo "Doanh thu cuối ngày" gốc (HO) và Thành viên lệch nhau (bản
10.33/10.34), cộng thêm cải tiến giao diện lọc báo cáo (bản 10.35/10.36),
sửa "Tên hàng" hiện mã trần ở nhóm báo cáo Mua hàng (bản 10.37), và tự
động quét lại dữ liệu "Lịch sử" đã chuyển sang DSMART16_EOM nhưng vẫn có
thể bị sửa sau đó (bản 10.38). Xem đầy đủ lý do/chi tiết kỹ thuật từng
bản ở `VERSION.md`, `deploy/Nhật ký triển khai (từ bản 8.31).md`, và "giá
vốn dsmart.md" mục 9-10 (toàn bộ quá trình điều tra Lãi gộp lệch).

---

## Tóm tắt những gì thay đổi (10.33 → 10.38)

| Bản | Nội dung |
|---|---|
| 10.33 | **SỬA LỖI THẬT**: `STRANS.SURPLUS` (lãi gộp từng dòng) vẫn bị DSMART điều chỉnh SAU KHI 1 ngày đã "đóng" — job đồng bộ trước đây "đóng băng" vĩnh viễn giá trị lần đầu quét được. Thêm cột `etl.SyncJobs.RescanLookbackDays` — mỗi lượt chạy quét lại thêm N ngày gần nhất (đặt N=7 cho job "Doanh thu chi nhánh - Live" + cả 35 job "Doanh thu (TV) - \<siêu thị\>"). |
| 10.34 | **SỬA LỖI THẬT (tiếp)**: bản 10.33 KHÔNG xử lý được lệch Lãi gộp NGAY TRONG NGÀY (SURPLUS biến động liên tục, không chỉ sau khi đóng ngày) — job gốc đồng bộ mỗi 15 phút trong khi Thành viên mỗi 2 phút, 2 bên "chụp" SURPLUS lệch nhau tới 15 phút. Rút `cronExpression` job "Doanh thu chi nhánh - Live" xuống `*/2 * * * *`, khớp Thành viên. |
| 10.35 | Thêm tính năng **dán danh sách để tự chọn** cho MỌI bộ lọc nhiều lựa chọn trong toàn hệ thống (`SearchableSelect.jsx` — component dùng chung); sửa bộ lọc động (vd "Mã hàng"/"Nhà cung cấp") tải chậm — tăng TTL cache từ 10 phút lên 2 giờ. |
| 10.36 | **SỬA LỖI THẬT**: dropdown "Siêu thị" hiện mã Điểm TRẦN (vd "005") thay vì tên, ở các dòng chưa khai "Tên siêu thị" trong "Ánh xạ Điểm - STK_ID" — hệ thống VẪN đọc đúng nguồn, chỉ là fallback âm thầm che mất việc thiếu dữ liệu. Sửa hiện rõ `"<mã> (chưa khai tên)"` ở 4 chỗ liên quan. |
| 10.37 | **SỬA LỖI THẬT**: cột "Tên hàng"/bộ lọc "Mã hàng" (nhóm báo cáo Mua hàng) hiện mã trần — VIEW nguồn để cứng `NULL` dù bảng `SKU_DEF` ĐÃ JOIN SẴN (từ bản 9.95) cho mục đích khác, chỉ thiếu chọn đúng cột `FULL_NAME_U`. Thêm quy ước bắt buộc mới vào `CLAUDE.md`: mọi VIEW nguồn báo cáo MỚI phải JOIN đúng bảng danh mục + chọn đúng cột tên Unicode, không để NULL/mã trần. |
| 10.38 | Dữ liệu đã chuyển sang DSMART16_EOM cuối tháng VẪN có thể bị sửa ngày quá khứ/huỷ đơn sau đó — đặt `RescanLookbackDays=40` (cơ chế đã xây ở bản 10.33) cho CẢ 6 job "... - Lịch sử (DSMART16_EOM)" trong hệ thống, tự động quét lại ~40 ngày gần nhất MỖI ĐÊM thay vì phải nhớ chạy tay đầu mỗi tháng. |

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Các bước triển khai (gộp cả 5 bản, theo ĐÚNG THỨ TỰ)

### B1. CSDL ETL admin (bản 10.33)

Chạy lại `etl-db/schema.sql` trên CSDL ETL admin — thêm cột mới
`etl.SyncJobs.RescanLookbackDays`. An toàn chạy lại nhiều lần.

### B2. DSMART16 — 2 file VIEW (bản 10.37)

Chạy lại CẢ 2 file SQL sau trên đúng CSDL của chúng:
1. `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung
   tâm).sql` — trên **DSMART16**.
2. `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql` —
   trên **DSMART16_EOM**.

(Gộp làm luôn ở bước này cho tiện — không liên quan `etl.SyncJobs`, chạy
trước/sau B1 đều được, không phụ thuộc nhau.)

### B3. Khởi động lại `etl`

Khởi động lại `etl` (pm2 restart đúng tiến trình) — áp dụng logic quét
lại N ngày mới (bản 10.33). **Ở bước này N=0 cho MỌI job hiện có — CHƯA
đổi hành vi gì cho tới bước B4.**

### B4. Chạy 3 script đồng bộ (thư mục `etl/`, cả 3 đều idempotent)

```bash
node scripts/seedLdtdHcrcSync.js
node scripts/seedThanhVienLiveSync.js
node scripts/resyncDonDatHangWatermark.js --confirm
```

- 2 script đầu áp dụng ĐỒNG THỜI bản 10.33 (đặt `RescanLookbackDays=7`)
  lẫn bản 10.34 (đổi lịch chạy job gốc xuống `*/2 * * * *`) cho đúng các
  job liên quan (gốc + cả 35 job Thành viên).
- Script thứ 3 (bản 10.37) backfill "Tên hàng" cho dữ liệu LỊCH SỬ đã
  đồng bộ trước đó (sửa VIEW ở bước B2 không tự cập nhật dữ liệu cũ) —
  reset watermark domain `don_dat_hang` về EPOCH, ETL tự đồng bộ lại từ
  đầu ở lượt chạy kế tiếp.

**⚠️ Khuyến nghị triển khai THÍ ĐIỂM cho Thành viên trước khi chạy
`seedThanhVienLiveSync.js` cho CẢ 35 siêu thị**: job Thành viên vốn đã
chạy mỗi 2 phút — quét thêm 7 ngày/lượt (bản 10.33) có thể tăng tải CSDL
LOCAL của từng siêu thị, CHƯA đo tải thật. Có thể sửa tay file để test
1-2 siêu thị trước, hoặc chạy hết rồi theo dõi vài ngày, hạ
`RescanLookbackDays` qua giao diện "Đồng bộ" (etl-admin) nếu thấy nặng —
KHÔNG cần sửa code/deploy lại, field này chỉnh trực tiếp trên UI.

**⚠️ Theo dõi riêng cho gốc (bản 10.34)**: job "Doanh thu chi nhánh -
Live" đọc CSDL TRUNG TÂM (phục vụ TẤT CẢ siêu thị cùng lúc) — tần suất
tăng gấp 7.5 lần (15 phút → 2 phút), CHƯA đo tải thật. Theo dõi log
lỗi/hiệu năng server trung tâm vài ngày đầu; hạ lại lịch chạy qua giao
diện "Đồng bộ" ngay nếu cần, không cần sửa code.

### B4b. Chạy thêm 2 script đồng bộ (bản 10.38 — quét lại "Lịch sử")

```bash
node scripts/seedNganhHangSync.js
node scripts/seedDonDatHangHistorySync.js
node scripts/seedThanhVienHistorySync.js
```

(`seedLdtdHcrcSync.js` đã chạy ở B4 rồi — bản này cùng đặt
`RescanLookbackDays=40` cho job "Lịch sử" của nó luôn, không cần chạy
lại.) Đặt `RescanLookbackDays=40` cho ĐỦ 6 job "... - Lịch sử
(DSMART16_EOM)" còn lại trong hệ thống — mỗi đêm (job này đã chạy sẵn 1
lần/ngày, 3h sáng) tự quét lại ~40 ngày gần nhất, bắt kịp dữ liệu bị sửa
sau khi đã chuyển sang DSMART16_EOM (ngày quá khứ/đơn bị sửa/huỷ), không
cần chạy tay đầu mỗi tháng.

### B5. Khởi động lại `rp-server`

Khởi động lại `rp-server` (pm2 restart) — áp dụng bản 10.35 (tăng TTL
cache bộ lọc động lên 2 giờ) và bản 10.36 (dropdown "Siêu thị" hiện rõ
"(chưa khai tên)"). Bản 10.37 KHÔNG cần đổi gì ở `rp-server` (field đã
khai đúng từ trước, chỉ thiếu dữ liệu nguồn — đã backfill ở B4).

### B6. Build lại 3 frontend

```bash
cd etl-admin && npm run build
cd ../api-admin && npm run build
cd ../rp-user && npm run build
```

(Tính năng dán danh sách để tự chọn ở bản 10.35 DÙNG CHUNG cho cả 3 app —
chỉ cần build 1 lần. Riêng `etl-admin` ở bản 10.33 còn có thêm field
"Quét lại thêm (số ngày gần nhất)" ở trang "Đồng bộ" — build ở bước này
đã áp dụng đủ.)

### B7. Deploy

Deploy `dist/` của cả 3 app lên đúng nơi phục vụ tĩnh (copy file, hoặc
đúng quy trình CI/CD hiện có của server).

**⚠️ Lưu ý riêng — nếu bộ lọc "Mã hàng" ĐANG trống (không chỉ hiện mã
trần)**: kiểm tra server ĐÃ từng chạy `node scripts/seedPurchaseOrderReports.js`
kể từ bản 10.31 (thêm bộ lọc "Mã hàng") CHƯA — đây là bước triển khai
RIÊNG của bản 10.31, không nằm trong phạm vi gộp 10.33-10.37 ở trên. Chạy
bổ sung nếu chưa từng chạy:
```bash
node scripts/seedPurchaseOrderReports.js
```

Không cần động tới `api-server` ở cả 5 bản này.

---

## C. Kiểm tra sau khi triển khai

- [ ] **(10.33)** "Đồng bộ" (etl-admin) → job "Doanh thu chi nhánh - Live
  (DSMART16)" và các job "Doanh thu (TV) - \<siêu thị\>" → cột "Quét lại
  (ngày)" hiện đúng `7`.
- [ ] **(10.34)** Cùng trang, job "Doanh thu chi nhánh - Live (DSMART16)"
  → cột "Lịch chạy" hiện đúng `*/2 * * * *`.
- [ ] **(10.33/10.34, theo dõi vài ngày)** So lại Lãi gộp 2 báo cáo "Doanh
  thu cuối ngày" LDTD/HCRC gốc và Thành viên cho CÙNG 1 ngày, CÙNG 1 thời
  điểm xem — mức lệch phải GIẢM RÕ RỆT so với trước (sự cố ngày
  28/10/2026 đã điều tra: lệch hàng chục triệu).
- [ ] **(10.35)** Mở bất kỳ bộ lọc nhiều lựa chọn nào (vd "Mã hàng"/"Siêu
  thị" ở nhóm báo cáo Mua hàng) → dán 1 danh sách (nhiều dòng/phẩy, vd từ
  Excel) vào ô "Tìm kiếm, hoặc dán cả danh sách..." → PHẢI tự động tick
  đúng các mục khớp, kèm dòng thông báo số mục khớp/không khớp.
- [ ] **(10.35)** Mở lại đúng bộ lọc vừa test trong vòng 2 giờ → ra ngay,
  không phải đợi như trước.
- [ ] **(10.36)** Mở bộ lọc "Siêu thị" — dòng nào thiếu "Tên siêu thị"
  trong "Ánh xạ Điểm - STK_ID" PHẢI hiện rõ `"<mã> (chưa khai tên)"`,
  không còn mã trần gây hiểu nhầm.
- [ ] **(10.37)** Mở 1 trong 6 báo cáo Mua hàng có cột "Tên hàng" → cột
  này PHẢI hiện tên thật (không còn trống/mã trần), kể cả với dữ liệu
  CŨ (đã đồng bộ từ trước bản này). Bộ lọc "Mã hàng" PHẢI hiện tên kèm
  mã trong dropdown.
- [ ] **(10.31, nếu làm bổ sung ở B7)** Bộ lọc "Mã hàng" ở 6 báo cáo Mua
  hàng phải HIỆN RA danh sách (không còn "Không có lựa chọn nào").
- [ ] **(10.38)** "Đồng bộ" (etl-admin) → 6 job tên có "... - Lịch sử
  (DSMART16_EOM)" (Doanh thu chi nhánh, Giao dịch chi nhánh, Doanh thu
  theo ngành hàng, Nhập hàng theo ngành hàng, Đơn đặt hàng, và 2 job gộp
  "(Thành viên)") → cột "Quét lại (ngày)" PHẢI hiện `40` ở TẤT CẢ.

Không có bước nào ở 6 bản này làm mất dữ liệu đã có — bản 10.33/10.34/10.38
thuần đổi CẤU HÌNH job đồng bộ, bản 10.35/10.36 thuần sửa giao diện lọc,
bản 10.37 chỉ bổ sung 1 cột tên còn thiếu (resync ghi đè đúng dữ liệu cũ
bằng MERGE idempotent, không xoá/nhân đôi gì).
