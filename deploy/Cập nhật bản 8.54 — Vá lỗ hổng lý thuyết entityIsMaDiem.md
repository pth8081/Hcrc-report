# Cập nhật bản 8.54 — Vá lỗ hổng lý thuyết trong kiểm tra `entityIsMaDiem`

## Vấn đề

Theo yêu cầu rà soát lại của người dùng sau bản 8.53 (chạy `code-review
--level max` trên toàn bộ diff từ bản 8.31 đến 8.53), phát hiện 1 lỗ hổng
lý thuyết trong `rp-server/lib/compositeReportRunner.js`:

Hàm xác định "báo cáo composite này có an toàn để lọc theo Phạm vi dữ
liệu/siêu thị không" (`entityIsMaDiem`, dùng cho tính năng lọc dữ liệu
theo siêu thị — bản 8.51) viết:

```js
const entityIsMaDiem = definition.blocks.filter(b => !b.isTarget).every(b => b.useDiemStkMapping || b.mapBuIdToMaDiem);
```

`Array.prototype.every()` trên mảng **RỖNG** tự nhiên trả về `true`
("vacuous truth"). Nếu 1 báo cáo composite nào đó có **MỌI khối đều
`isTarget: true`** (không có khối dữ liệu nào, chỉ có khối chỉ tiêu) thì
mảng lọc ra rỗng, `entityIsMaDiem` thành `true` dù KHÔNG CÓ khối nào thật
sự được kiểm tra — hệ thống sẽ BẬT lọc theo `storeScope` trên `entityCode`
chưa chắc là mã Điểm chuẩn, có thể lọc sai (thiếu hoặc thừa dữ liệu) cho
người dùng bị giới hạn phạm vi xem.

**Mức độ rủi ro thực tế**: ĐÃ KIỂM TRA — cả 2 báo cáo composite hiện có
trong hệ thống (`seedTop5ChiNhanhReports.js`, `seedLdtdHcrcReports.js`)
đều có khối dữ liệu thật, KHÔNG rơi vào trường hợp này. Đây là lỗ hổng
**lý thuyết**, vá phòng ngừa cho tương lai, không phải lỗi đang xảy ra.

## Thay đổi

`rp-server/lib/compositeReportRunner.js` — thêm điều kiện phải có ÍT NHẤT
1 khối không phải `isTarget` trước khi gọi `.every()`:

```js
const nonTargetBlocks = definition.blocks.filter(b => !b.isTarget);
const entityIsMaDiem = nonTargetBlocks.length > 0 && nonTargetBlocks.every(b => b.useDiemStkMapping || b.mapBuIdToMaDiem);
```

Giữ đúng nguyên tắc "không chắc chắn thì KHÔNG lọc" đã dùng xuyên suốt
tính năng Phạm vi dữ liệu (bản 8.50-8.51): báo cáo không đủ căn cứ xác
nhận entityCode là mã Điểm chuẩn thì bỏ qua lọc, không mặc định lọc theo
hướng có thể sai.

## Các bước triển khai

1. `git pull origin main`
2. `pm2 restart hcrc-rp-server` (BẮT BUỘC — đổi file backend).
3. Không cần kiểm tra gì thêm — hành vi của MỌI báo cáo đang hoạt động
   hiện tại không đổi (không báo cáo nào rơi vào trường hợp đã vá).

Không đổi CSDL, không đổi giao diện.
