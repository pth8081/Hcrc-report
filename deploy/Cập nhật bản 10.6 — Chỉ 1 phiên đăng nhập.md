# Cập nhật bản 10.6 — Chỉ 1 phiên đăng nhập

**Mục đích**: theo yêu cầu người dùng — "phiên muộn hơn sẽ giữ lại và
phiên cũ sẽ bị tự động disable đi" — áp dụng cho CẢ 3 app
(`rp-user`/`etl-admin`/`api-admin`). Trước bản này, 1 tài khoản đăng nhập
được ĐỒNG THỜI ở nhiều thiết bị/trình duyệt cùng lúc, không có giới hạn
gì. Sau bản này: đăng nhập ở nơi MỚI sẽ tự động vô hiệu MỌI phiên CŨ của
cùng tài khoản đó — lần gọi API tiếp theo từ phiên cũ sẽ bị từ chối, yêu
cầu đăng nhập lại.

---

## A. Code — lấy về

```bash
git pull origin main
```

## B. Các bước triển khai

Tác động CẢ 3 app cùng lúc — làm đủ cả 3 bước dưới đây, không được bỏ
sót app nào (bỏ sót 1 app thì app đó vẫn cho đăng nhập nhiều phiên như
cũ, 2 app kia đã giới hạn).

1. **DBA/IT**: chạy lại NGUYÊN VĂN 3 file sau trên ĐÚNG 3 CSDL tương ứng
   (AN TOÀN chạy lại nhiều lần — chỉ THÊM 1 cột mới `CurrentSessionId`,
   không đụng dữ liệu/bảng khác, không ép đăng xuất ai ngay lúc chạy):
   - `rp-db/schema.sql` → trên **HCRC_RP**.
   - `etl-db/schema.sql` → trên **HCRC_ETL**.
   - `api-db/schema.sql` → trên **HCRC_API**.
2. **IT/Dev**: khởi động lại CẢ 3 tiến trình backend (KHÔNG cần build lại
   frontend nào — tính năng này thuần backend):
   ```bash
   pm2 restart hcrc-rp-server hcrc-etl hcrc-api-server
   ```

Chỉ vậy là xong — không có bước cấu hình `.env` nào, không có trang quản
trị nào cần bật/tắt (tính năng LUÔN BẬT, không tuỳ chọn).

## C. Kiểm tra sau khi triển khai

- [ ] Đăng nhập 1 tài khoản bất kỳ trên **Trình duyệt A**, giữ nguyên
  phiên đó đang mở (không đóng tab).
- [ ] Đăng nhập LẠI CHÍNH tài khoản đó trên **Trình duyệt B** (hoặc cửa
  sổ ẩn danh/máy khác) — phải vào được **bình thường**, không có cảnh
  báo gì lúc đăng nhập.
- [ ] Quay lại **Trình duyệt A** (phiên cũ), bấm bất kỳ thao tác nào gọi
  API (vd chuyển sang trang khác, bấm nút "Tải lại") — phải bị **đăng
  xuất ngay**, hiện thông báo lỗi: *"Phiên đăng nhập đã bị thu hồi (đổi
  mật khẩu/2FA/vai trò, tài khoản bị khoá, hoặc đã đăng nhập ở nơi khác)
  — đăng nhập lại"*.
- [ ] Lặp lại đúng 3 bước trên cho CẢ 3 app (`rp-user`, `etl-admin`,
  `api-admin`) — mỗi app giới hạn phiên ĐỘC LẬP với 2 app kia (đăng nhập
  mới ở `etl-admin` KHÔNG ảnh hưởng phiên đang mở ở `rp-user`, vì là 2
  tài khoản/CSDL/hệ thống xác thực hoàn toàn tách biệt).
- [ ] (Không bắt buộc, chỉ để xác nhận không ảnh hưởng phiên đang chạy
  dở TRƯỚC khi deploy) — nếu có phiên đang mở TỪ TRƯỚC khi chạy bước B ở
  trên và KHÔNG đăng nhập lại — phiên đó vẫn tiếp tục hoạt động bình
  thường (không bị ép đăng xuất ngay lúc deploy), chỉ bắt đầu bị giới
  hạn "1 phiên" kể từ LẦN đăng nhập tiếp theo của chính tài khoản đó.

## Lưu ý vận hành

- **Không có cách "cho phép ngoại lệ"** cho 1 tài khoản cụ thể (vd tài
  khoản dùng chung nhiều người) — nếu có tài khoản THỰC SỰ cần dùng đồng
  thời nhiều nơi (khác với 1 người dùng quên đăng xuất ở máy cũ), cần
  trao đổi thêm trước khi mở rộng.
- 2FA/WebAuthn (vân tay, Face ID) đều tính là "đăng nhập" như nhau — bất
  kỳ cách nào hoàn tất đăng nhập (mật khẩu thường, mật khẩu+2FA, hay vân
  tay/Face ID) đều phát hành phiên MỚI và vô hiệu phiên CŨ.
- "Trượt phiên" (sliding session, gia hạn tự động khi còn dưới 30 phút
  hết hạn mà vẫn đang hoạt động) KHÔNG bị coi là "đăng nhập mới" theo
  nghĩa đẩy phiên khác ra — chính phiên đang trượt tự cập nhật
  `CurrentSessionId` về đúng chính nó, không ảnh hưởng gì tới trải
  nghiệm người dùng đang dùng.

Không có bước nào ở trên làm mất dữ liệu đã có — chỉ thêm 1 cột CSDL
mới và thay đổi hành vi xác thực, không đụng tới báo cáo/dữ liệu nghiệp
vụ nào.
