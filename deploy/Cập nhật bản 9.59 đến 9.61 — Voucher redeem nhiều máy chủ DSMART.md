# Cập nhật bản 9.59 đến 9.61 — Voucher redeem nhiều máy chủ DSMART

**Mục đích**: cho phép app "HCRC Voucher Redemption" gọi check/redeem
voucher trên **NHIỀU máy chủ DSMART khác nhau** (vd thêm chi nhánh
"Fuji"), thay vì chỉ 1 máy chủ duy nhất như trước — mỗi máy chủ 1 "mã"
(`ConfigKey`) riêng, dùng thẳng trên đường dẫn API.

Tách riêng từ `deploy/Hướng dẫn triển khai gộp — bản 9.59 đến 9.68.md`
(Phần 1) để tiện gửi/làm theo mà không cần đụng tới Phần 2/3 (không
liên quan Voucher).

---

## A. Code — lấy về

```bash
git pull origin main
```

## B. Các bước triển khai

(Theo đúng cách làm CUỐI CÙNG — bản 9.59 còn hướng dẫn thêm máy chủ mới
qua script `.env`, bản 9.60/9.61 đã BỎ HẲN cách đó, CHỈ dùng giao diện —
làm theo đúng danh sách dưới đây, không cần đi qua cách cũ rồi sửa lại.)

1. `git pull origin main` (đã làm ở mục A).
2. DBA chạy lại NGUYÊN VĂN `api-db/schema.sql` trên CSDL API (an toàn
   chạy lại nhiều lần — tự chuyển `api.VoucherSettings` từ 1 dòng sang
   danh sách, GIỮ NGUYÊN cấu hình cũ vào dòng `default`, không mất gì).
3. **`cd api-admin && npm run build`** (BẮT BUỘC — bản 9.59 đổi hẳn trang
   "Cấu hình Voucher" sang danh sách nhiều dòng, file frontend
   `VoucherSettingsPage.jsx` cần build lại mới áp dụng — chỉ restart
   tiến trình phục vụ `dist/` cũ là KHÔNG ĐỦ, vẫn thấy giao diện 1
   dòng/1 dropdown CŨ và bấm "Lưu" báo lỗi "Phản hồi không phải JSON" —
   lỗi THẬT đã gặp), rồi khởi động lại `api-server` và `api-admin`.
4. Cấu hình máy chủ DSMART (kể cả `default` nếu server này lần đầu dùng
   tính năng voucher, hoặc muốn kiểm tra lại cấu hình sẵn có) làm ĐÚNG 1
   CÁCH DUY NHẤT — qua giao diện api-admin:
   - Vào trang **"Nguồn dữ liệu"** → "+ Tạo mới" (hoặc dùng lại dòng đã
     khai từ trước nếu server đã chạy báo cáo/tồn kho đọc DSMART16 Live
     rồi) → gõ server/port/database/username/password của máy chủ
     DSMART16 đó (tài khoản SQL chỉ cần quyền SELECT + UPDATE trên
     `dbo.PMCRDINF` — chạy `api-db/grants-dsmart16-voucher.sql` trên
     chính DSMART16 nếu cần tạo tài khoản mới, nhớ đổi mật khẩu mẫu
     trước khi chạy thật).
   - Vào trang **"Cấu hình Voucher"** (menu mới từ bản 9.59, mặc định
     KHÔNG vai trò nào tự có quyền xem — gán ở "Vai trò" nếu cần) → dòng
     `default` LUÔN có sẵn (không xoá được, ứng với API
     `/vouchers/check`,`/vouchers/redeem` không kèm mã) → bấm "Sửa" →
     chọn đúng "Nguồn dữ liệu" vừa tạo/dùng ở bước trên.
   - Thêm máy chủ DSMART khác (vd "Fuji"): bấm "+ Tạo cấu hình mới" →
     đặt mã (`ConfigKey`, vd `fuji`, dùng THẲNG trên URL, KHÔNG đổi được
     sau khi tạo) + tên (vd "Voucher redeem Fuji") → chọn đúng "Nguồn dữ
     liệu" của máy chủ đó (tạo ở "Nguồn dữ liệu" trước nếu chưa có).
5. **Chỉ khi có đối tác cần gọi 1 máy chủ KHÁC `default`** (vd
   `/vouchers/fuji/check`) — vào "Đối tác" → chọn đúng đối tác → nút
   **"Cấu hình Voucher được gọi"** → tick đúng mã (vd `fuji`) → Lưu.
   Thiếu bước này, đối tác gọi `/vouchers/fuji/check|redeem` sẽ bị `403`
   (gọi `/vouchers/check`,`/vouchers/redeem` hay `/vouchers/default/...`
   không kèm mã thì KHÔNG cần bước này, luôn cho qua như trước).
6. Báo đội app voucher: khi người dùng chọn máy chủ khác (vd "Fuji"),
   gọi `/api/v1/vouchers/fuji/check` và `/api/v1/vouchers/fuji/redeem`
   (thay vì `/check`,`/redeem`) — request/response giữ nguyên như tài
   liệu cũ (`api-voucher-check-redeem.md`).
7. (Dọn dẹp, không bắt buộc) Nếu `.env` của `api-server` có các biến
   `VOUCHER_DSMART16_SERVER/PORT/DATABASE/USER/PASSWORD/ENCRYPT/
   TRUST_CERT` từ trước (dùng cho script cũ đã bỏ) — có thể xoá, để lại
   cũng không ảnh hưởng gì (không còn gì đọc các biến này).

## C. Kiểm tra sau khi triển khai

- [ ] api-admin → "Cấu hình Voucher" → hiện ĐÚNG danh sách nhiều dòng
  (không còn 1 dropdown đơn như giao diện cũ).
- [ ] Dòng `default` hiện đúng "Nguồn dữ liệu" đã chọn (không còn
  trống/lỗi "Chưa cấu hình").
- [ ] Gọi thử `GET /api/v1/vouchers/check/<mã thật>` (không kèm mã máy
  chủ) → vẫn ra đúng kết quả như trước (xác nhận tương thích ngược, dòng
  `default` hoạt động đúng).
- [ ] (Nếu có thêm máy chủ thứ 2, vd "Fuji") — gọi thử
  `GET /api/v1/vouchers/fuji/check/<mã thật bên Fuji>` → ra đúng dữ liệu
  của ĐÚNG máy chủ Fuji (không lẫn với `default`).
- [ ] Đối tác CHƯA được cấp "Cấu hình Voucher được gọi" cho mã mới → gọi
  `/vouchers/fuji/check` → nhận lỗi `403` rõ ràng (đúng hành vi chặn mặc
  định, không phải lỗi hệ thống).

Không có bước nào ở trên làm mất dữ liệu đã có — migration CSDL chỉ
chuyển ĐÚNG 1 dòng cấu hình cũ sang dòng `default` của danh sách mới,
không xoá/đổi gì khác.
