# Cập nhật bản 8.51 — Áp lọc dữ liệu THẬT theo siêu thị (báo cáo composite)

## Bối cảnh

Bước 3/4 trong lộ trình "phân quyền dữ liệu theo đúng siêu thị":
- **8.49**: ánh xạ `Department` (vpdt) → `MaDiem` chuẩn.
- **8.50**: trang Người dùng cho Admin GÁN phạm vi dữ liệu (chỉ lưu, chưa
  lọc gì).
- **8.51 (bản này)**: LẦN ĐẦU áp dụng lọc THẬT — người được gán phạm vi ở
  bản 8.50 giờ mới thật sự chỉ thấy đúng dữ liệu đã gán.

## Cơ chế lọc

Tận dụng 1 phát hiện quan trọng khi rà lại `lib/compositeReportRunner.js`:
với báo cáo composite có khối bật `useDiemStkMapping: true` hoặc
`mapBuIdToMaDiem: true`, hàm `remapRowsToDiem()`/`buildBuIdLookup()`
(`lib/diemStkMapping.js`) đã tự đổi `entityCode` của dòng dữ liệu về ĐÚNG
`MaDiem` chuẩn TRƯỚC KHI các khối được ghép lại — nghĩa là **dòng đã ghép
của các báo cáo này đã sẵn dùng chính xác khoá `MaDiem`** mà bản 8.49/8.50
đã dùng để gán phạm vi. Không cần dò tên cột "siêu thị" trong từng định
nghĩa báo cáo — chỉ cần lọc thẳng theo `entityCode` của dòng đã ghép.

**Luồng xử lý:**
1. `lib/permissions.js:loadContext()` — đọc thêm `app.UserStoreAccess` của
   người đăng nhập, trả về `storeScope` (`null` = Toàn bộ, mảng `MaDiem` =
   giới hạn). Bỏ qua hẳn với `IsSystemRole` (Admin luôn thấy hết, phòng thủ
   chiều sâu).
2. `routes/reports.js` (`POST /:reportId/run` và `/export`) + `routes/dashboards.js`
   (`POST /:dashboardId/export`) — SERVER tự gắn
   `filters.__storeScope = context.storeScope`, GHI ĐÈ bất kỳ giá trị nào
   client gửi lên ở đúng field này (không tin client tự khai phạm vi của
   chính họ).
3. `lib/compositeReportRunner.js:runCompositeReport()` — ngay trước bước
   xếp hạng (`topN`)/nhóm (`groupBy`)/trả thẳng, lọc `mergedRows` theo
   `entityCode ∈ storeScope`, **CHỈ KHI** mọi khối không phải khối chỉ tiêu
   đều đã bật `useDiemStkMapping`/`mapBuIdToMaDiem` — báo cáo nào không đủ
   điều kiện thì **bỏ qua lọc, giữ nguyên hành vi cũ** (không phải lỗ hổng:
   báo cáo đó chưa có khái niệm "Mã Điểm chuẩn" để lọc đáng tin cậy).

## Phạm vi ÁP DỤNG ĐƯỢC ngay (đã kiểm tra khối từng báo cáo)

- 8 báo cáo "Top 5 chi nhánh" (16 Ô + liên quan) —
  `scripts/seedTop5ChiNhanhReports.js`.
- "Báo cáo doanh thu cuối ngày HCRC (Thành viên)" (tab Realtime trên
  Dashboard) — `scripts/seedLdtdHcrcReports.js`.

## Phạm vi CHƯA áp dụng (để bản sau, KHÔNG phải lỗ hổng)

- `topZeroStock`/`coreZeroStock` (Top bán chạy tồn kho = 0) — đã có sẵn
  tham số `branches` riêng, chỉ cần ép ở route tương ứng.
- "Báo cáo tự do" (`adhocReportEngine.js`) — đã có sẵn tham số
  `entityCodes`, cùng cách làm.
- `apiReport`/`apiRealtime`/`externalApi` — hiện KHÔNG có báo cáo nào dùng
  các loại nguồn này (rà theo mọi script seed), không có gì cần lọc.
- `jobs/reportEmailScheduler.js` (báo cáo gửi email theo lịch) — CHƯA đụng
  tới, ngoài phạm vi đã thống nhất với người dùng cho bản này.

## Kiểm tra trước khi gộp

Viết test riêng (`runCompositeReport()` với dữ liệu giả, không cần CSDL
thật) xác nhận đúng 7 tình huống: không giới hạn → thấy đủ; giới hạn 1
siêu thị → chỉ đúng 1 dòng, đúng số liệu; giới hạn nhiều siêu thị → thấy
đủ các siêu thị đó; gán nhầm mã không tồn tại → rỗng (không rơi về "thấy
hết"); báo cáo không đủ điều kiện (không bật `useDiemStkMapping`/
`mapBuIdToMaDiem`) → lọc KHÔNG áp dụng, vẫn thấy đủ như trước — xác nhận
không có báo cáo nào bị lọc nhầm/lọt lưới.

## File đã sửa

- `rp-server/lib/permissions.js` — `loadContext()` thêm `storeScope`.
- `rp-server/lib/compositeReportRunner.js` — lọc `mergedRows` theo
  `__storeScope` (có điều kiện an toàn như trên).
- `rp-server/routes/reports.js` — gắn `__storeScope` server-side ở
  `/:reportId/run` và `/:reportId/export`.
- `rp-server/routes/dashboards.js` — gắn `__storeScope` ở
  `/:dashboardId/export` (tile không đi qua `routes/reports.js`).

## Các bước triển khai

1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi logic chạy báo cáo).
3. Không cần chạy lại `rp-db/schema.sql`, không cần build lại `rp-user`
   (không đổi giao diện).
4. Kiểm tra (dùng đúng 1 tài khoản test đã gán "Phạm vi dữ liệu" ở bản
   8.50):
   - Đăng nhập tài khoản đó → mở Dashboard "Top 5 chi nhánh" → CHỈ thấy
     đúng siêu thị đã gán ở MỌI Ô (Ngày/Tháng, Doanh thu/Giao dịch,
     Bảng/Biểu đồ).
   - Mở tab "Realtime" trên Dashboard → cùng kết quả — chỉ đúng siêu thị
     đã gán.
   - Bấm "Xuất Excel"/"Xuất PDF" → file xuất ra cũng chỉ có đúng siêu thị
     đó (không lọt dữ liệu thừa qua đường xuất file).
   - Vào trang "Báo cáo" (không qua Dashboard), chạy TRỰC TIẾP 1 trong 8
     báo cáo "Top 5 ..." → cùng kết quả.
   - Đăng nhập tài khoản KHÁC đang "Toàn bộ" (chưa gán gì) → không ảnh
     hưởng gì, vẫn thấy đủ mọi siêu thị như trước bản 8.51.
   - Thử 1 báo cáo BẤT KỲ khác (không phải Top5/Realtime Thành viên) với
     tài khoản đã bị giới hạn → vẫn thấy đủ dữ liệu như cũ (đúng — báo cáo
     đó chưa nằm trong phạm vi áp dụng được của bản này).
