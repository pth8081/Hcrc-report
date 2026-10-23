# Cập nhật bản 10.1 đến 10.4 — Chỉ tiêu ngành hàng theo ngày, Đơn đặt hàng theo ngành, NCC tự động Core stock=0, vá bảo mật proxy-addr

**Mục đích**: gộp 4 bản liên tiếp thành 1 lượt làm — 3 bản đầu đi CHUNG
1 lần pull (cùng 1 commit, liên quan tới nhau qua domain `don_dat_hang`
dùng chung), bản thứ 4 là vá bảo mật độc lập ở `api-server` (khác file,
khác tiến trình, làm riêng không ảnh hưởng 3 bản trên):

- **Bản 10.1** — Chỉ tiêu ngành hàng (báo cáo "Doanh thu/Nhập hàng theo
  ngành hàng" HCRC + LDTĐ) giờ CHIA THEO TỶ LỆ SỐ NGÀY đã chọn trong
  từng tháng, khi người dùng chọn 1 ngày/vài ngày KHÔNG phải nguyên 1
  tháng — trước đây vẫn lấy NGUYÊN chỉ tiêu cả tháng, sai khi so sánh với
  doanh thu thực tế của đúng số ngày đã chọn.
- **Bản 10.2** — VIEW `don_dat_hang` (nguồn của 6 báo cáo "Đơn đặt hàng"/
  "Đơn nhập hàng"/"So sánh đặt–nhận") thêm cột Mã/Tên ngành hàng, và 6
  báo cáo đó thêm bộ lọc "Ngành hàng" (đã có sẵn lọc NCC/Siêu thị/Kênh
  mua, chỉ thiếu Ngành hàng).
- **Bản 10.3** — Báo cáo "Core stock = 0" (Mart/Minimart) TỰ ĐỘNG lấy Mã
  NCC/Tên NCC từ domain `don_dat_hang` khi dòng Core đó CHƯA khai tay
  trong "Danh sách hàng Core" (khai tay vẫn LUÔN ưu tiên hơn).
- **Bản 10.4** — Vá lỗ hổng bảo mật **CRITICAL** `proxy-addr` (giả mạo
  IP qua IPv4-mapped IPv6) ở `api-server`, phát hiện qua rà soát bảo mật
  hệ thống API theo yêu cầu người dùng — kèm vá luôn 5 lỗ hổng dependency
  khác không cần breaking change (`qs`/`compression`/`multer`/
  `ip-address`/`brace-expansion`).

(Tách riêng từ nhật ký gộp `deploy/Nhật ký triển khai (từ bản 8.31).md`
mục 10.1-10.4 để tiện gửi/làm theo mà không cần mở file gộp đầy đủ lịch
sử. Lưu ý số bản 10.1/10.2/10.3 đã được SỬA LẠI từ "9.101/9.102/9.103" —
xem `VERSION.md` mục "SỬA SỐ bản 9.100-9.103 → 10.0-10.3" nếu thấy nhầm
với bản cũ đã nói tới ở đâu đó — nội dung và các bước dưới đây KHÔNG đổi,
chỉ đổi tên gọi số.)

---

## A. Code — lấy về

```bash
git pull origin main
```

## B. Các bước triển khai (theo đúng thứ tự)

### B.1 — DBA: chạy lại 2 VIEW `don_dat_hang` (bắt buộc cho bản 10.2)

Chạy lại NGUYÊN VĂN 2 file sau trên ĐÚNG server tương ứng (AN TOÀN chạy
lại nhiều lần — `CREATE OR ALTER VIEW`/thủ tục, không mất dữ liệu):

- `deploy/Thiết lập VIEW Đơn đặt hàng-Nhập hàng-So sánh (DSMART16 trung tâm).sql`
  — chạy trên **DSMART16 trung tâm** (job Live).
- `deploy/Thiết lập VIEW Đơn đặt hàng Lịch sử (DSMART16_EOM).sql` — chạy
  trên **DSMART16_EOM** (job Lịch sử).

Cả 2 file đều thêm 2 cột MỚI `MaNganhHang`/`TenNganhHang` (JOIN
`DEPTLIST` qua `SKU_DEF.DEPT_ID`) — thuần thêm cột, không đổi cột cũ nào,
6 báo cáo "Đơn đặt hàng" hiện có KHÔNG bị ảnh hưởng.

### B.2 — IT/Dev: chạy lại các script seed + resync (bắt buộc cho cả 10.2 và 10.3)

```bash
cd etl
node scripts/seedDonDatHangSync.js            # cập nhật DimensionColumnsJson job Live — thêm MaNganhHang/TenNganhHang
node scripts/seedDonDatHangHistorySync.js      # tương tự cho job Lịch sử
node scripts/resyncDonDatHangLiveForSkuCode.js --confirm   # ÉP job Live kéo lại dữ liệu CŨ với cột mới
```

> Lệnh `resyncDonDatHangLiveForSkuCode.js --confirm` dùng CHUNG cho CẢ
> bản 10.2 (lấp Ngành hàng cho dữ liệu đã đồng bộ trước đó) VÀ bản 10.3
> (job Live cần đã có đủ `MaHangHienThi` để tra NCC tự động) — **chỉ cần
> chạy 1 LẦN**, không cần chạy lại riêng cho từng bản. Script này CHỈ xoá
> + kéo lại job **Live** (dữ liệu gần đây, nhanh) — job **Lịch sử**
> KHÔNG cần resync (tự kéo dần theo lịch, dữ liệu cũ chỉ thiếu 2 cột mới,
> không sai dữ liệu đã có).
>
> Nếu server này đã từng chạy resync này ở bản 9.95 RỒI (trước khi có
> bản 10.2) — vẫn CẦN chạy lại 1 lần nữa ở đây, vì lần trước chưa có cột
> Ngành hàng để kéo.

```bash
cd ../rp-server
node scripts/seedPurchaseOrderReports.js       # thêm bộ lọc "Ngành hàng" vào 6 báo cáo mua hàng (bản 10.2)
node scripts/seedCoreZeroStockReports.js       # bật useDonDatHangForNcc cho 2 báo cáo Core stock=0 (bản 10.3)
```

Cả 2 script đều AN TOÀN chạy lại nhiều lần (chỉ UPDATE `DefinitionJson`
theo đúng `ReportId`, không tạo trùng).

### B.3 — Khởi động lại rp-server (bắt buộc cho cả 10.1, 10.2, 10.3)

```bash
pm2 restart hcrc-rp-server
```

(`hcrc-etl` KHÔNG cần restart — bước B.2 chạy script trực tiếp bằng
`node`, không qua tiến trình PM2 của etl.)

### B.4 — Vá bảo mật `api-server` (bản 10.4, ĐỘC LẬP với B.1-B.3 ở trên)

Chỉ đụng tới `api-server` (khác hẳn `rp-server`/`etl` ở trên) — làm
trước/sau/song song với B.1-B.3 đều được, không phụ thuộc nhau:

```bash
cd api-server
npm ci          # KHÔNG dùng npm install — npm ci cài CHÍNH XÁC đúng
                 # version đã vá trong package-lock.json, tránh lệch
                 # version giữa máy dev và server
pm2 restart hcrc-api-server
```

Bản này CHỈ đổi `package-lock.json` (nâng version dependency), KHÔNG đổi
code/`package.json` — không cần build lại gì khác, không cần sửa `.env`.

## C. Kiểm tra sau khi triển khai

- [ ] **Bản 10.1** — mở "Doanh thu theo ngành hàng" hoặc "(LDTD)", chọn
  khoảng ngày KHÔNG phải nguyên 1 tháng (vd 5 ngày lẻ cuối tháng) — cột
  "Chỉ tiêu" (Doanh thu/Lãi gộp, Total/Bán lẻ/Bán buôn) phải ra số theo
  ĐÚNG tỷ lệ ngày đã chọn, không còn bằng nguyên số chỉ tiêu cả tháng.
  Chọn lại ĐÚNG nguyên 1 tháng — số phải GIỐNG như trước khi có bản này
  (không đổi hành vi trường hợp chọn nguyên tháng).
- [ ] **Bản 10.2** — mở 1 trong 6 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/
  "So sánh đặt–nhận" — bộ lọc "Ngành hàng" phải xuất hiện (cạnh NCC/Siêu
  thị/Kênh mua), chọn 1 ngành hàng → kết quả chỉ còn đúng mã hàng thuộc
  ngành đó.
- [ ] **Bản 10.3** — mở "Core stock = 0 (Mart)"/"(Minimart)" — cột "Mã
  NCC"/"Nhà cung cấp" phải có số liệu cho dòng CHƯA khai tay trong "Danh
  sách hàng Core" (miễn mã hàng đó đã TỪNG được nhập qua NCC qua domain
  `don_dat_hang`). Dòng ĐÃ khai tay trong "Danh sách hàng Core" phải GIỮ
  NGUYÊN giá trị khai tay (không bị ghi đè bởi giá trị tự động).
- [ ] **Bản 10.4** — `pm2 logs hcrc-api-server --lines 50` sau khi
  restart KHÔNG có lỗi khởi động (module not found/syntax error — có lỗi
  này nghĩa là `npm ci` ở B.4 chưa cài đúng, chạy lại). Gọi thử 1 API
  thật (vd endpoint realtime tồn kho) từ 1 đối tác đã cấu hình
  `allowedIps`/HMAC — vẫn chạy bình thường, không đổi hành vi.

Nếu mục nào vẫn trống/sai sau khi làm đủ các bước trên — xem phần "Hỏi &
đáp" tương ứng:
- Bản 10.1: `VERSION.md` mục 10.1 (không có mục Hỏi&đáp riêng — logic
  thuần tính toán, không phụ thuộc dữ liệu ngoài).
- Bản 10.2: 6 file `bc-don-dat-hang*.md` tương ứng từng báo cáo.
- Bản 10.3: `bc-core-ton-kho-0.md` mục **"Bản 10.3"**.
- Bản 10.4: `VERSION.md` mục 10.4 (gồm danh sách đầy đủ lỗ hổng đã vá +
  2 lỗ hổng CHƯA vá, cần breaking change).

Không có bước nào ở trên làm mất dữ liệu đã có — mọi thay đổi CSDL chỉ
THÊM cột/cấu hình mới, không xoá/đổi dữ liệu cũ; bản 10.4 chỉ đổi version
dependency, không đổi dữ liệu/cấu hình gì.
