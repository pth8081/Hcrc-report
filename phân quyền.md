# Phân quyền — Hướng dẫn tạo tài khoản & gán quyền

File này gộp đủ hướng dẫn tạo tài khoản + phân quyền cho **cả 3 hệ thống
quản trị độc lập** (ETL, API, Report) — mỗi hệ thống có CSDL/trang quản trị
riêng, phải làm riêng từng nơi, tài khoản KHÔNG dùng chung giữa 3 hệ thống.

> **Thay thế mục "4. Phân quyền" trong `deploy/Hướng dẫn nghiệp vụ.md`** —
> mục đó mô tả mô hình CŨ (3 vai trò cố định `admin`/`viewer`/
> `target_importer` ở etl-admin, 2 vai trò cố định `admin`/`viewer` ở
> api-admin) đã BỊ THAY THẾ hoàn toàn từ bản 6.28 bằng mô hình Vai trò tuỳ ý
> + gán quyền theo từng trang mô tả trong file này. Mục "3. Đăng nhập lần
> đầu + 2FA" của file đó vẫn đúng, không cần đọc lại ở đây.

## Tổng quan kiến trúc

| | etl-admin | api-admin | rp-user |
|---|---|---|---|
| Mô hình quyền | Vai trò + quyền theo trang (Xem/Sửa) | Giống hệt etl-admin | Vai trò + **3 lớp quyền độc lập** (phong phú hơn) |
| Trang quản trị | "Phân quyền" (tài khoản) + "Vai trò" | "Tài khoản quản trị" + "Vai trò" | "Hệ thống → Phân quyền" (gộp 2 tab Người dùng/Vai trò) |
| Danh sách trang (Menu) | Mảng cố định trong code | Mảng cố định trong code | Bảng thật trong CSDL (`app.MenuItems`) |

**Vai trò "hệ thống" (system role)** — khái niệm GIỐNG NHAU ở cả 3 nơi:
không có checkbox "là tài khoản hệ thống" lúc tạo user. Đây là **thuộc
tính của 1 VAI TRÒ** (`IsSystemRole = 1`), đã có sẵn 1 vai trò loại này
ngay từ khi cài đặt hệ thống (tên "admin"/"Admin hệ thống" ở etl & api,
"admin"/"Quản trị hệ thống" ở rp-user) — **KHÔNG tạo thêm được vai trò hệ
thống mới qua giao diện** (vai trò tạo mới qua UI luôn là vai trò thường).
Muốn cho ai đó TOÀN QUYỀN, vào trang Users, bấm "Gán vai trò", tick đúng
vai trò có sẵn này.

**Vì sao chỉ tài khoản đang LÀ vai trò hệ thống mới gán được vai trò (kể cả
vai trò thường) cho người khác** — tránh 1 tài khoản chỉ được giao quản lý
trang "Phân quyền" tự tạo 1 vai trò toàn quyền rồi tự gán cho mình, leo
thang chiếm toàn quyền hệ thống. Quyền "Sửa trang Phân quyền" (gán được
vai trò *thường*, tạo/sửa tài khoản) KHÔNG đủ để gán vai trò hệ thống hay
đặt lại mật khẩu/2FA người khác — các thao tác đó CHỈ tài khoản đang là
vai trò hệ thống mới làm được.

**2FA bắt buộc cho vai trò hệ thống** — lần đăng nhập ĐẦU TIÊN sau khi
được gán vai trò hệ thống (hoặc chưa từng bật 2FA), hệ thống chặn đứng,
bắt thiết lập 2FA (quét QR bằng app Authenticator) trước khi vào được bất
kỳ trang nào khác. Vai trò thường KHÔNG bị bắt buộc 2FA. Xem chi tiết ở
mục "Bảo mật dùng chung" cuối file.

**Mật khẩu** — băm bằng `bcrypt` (cost 10) ngay khi tạo/đổi, không bao giờ
lưu/hiển thị lại dạng chữ thường ở bất kỳ hệ thống nào.

---

## Phần 1 — ETL (etl-admin)

### 1.1 Tạo tài khoản

Vào **Phân quyền** (sidebar) → điền `Tên đăng nhập`, `Mật khẩu`, `Họ tên`
→ Lưu. Tài khoản MỚI TẠO **chưa thấy trang nào cả** (chưa có vai trò) —
phải gán vai trò ngay bước tiếp theo mới dùng được.

Không có nút xoá tài khoản — chỉ **Khoá/Mở khoá** (xoá cứng sẽ làm mất dấu
vết ở Nhật ký thao tác, vì nhật ký tham chiếu theo tài khoản).

### 1.2 Tạo vai trò & gán quyền theo trang

Vào **Vai trò** → "Tạo vai trò mới" → điền `Mã vai trò` + `Tên vai trò` →
Lưu. Vai trò mới tạo CHƯA được xem trang nào — bấm "Gán quyền" ngay dòng
vai trò đó, tick từng trang muốn cho **Xem**, tick thêm **Sửa** cho trang
nào vai trò này được phép thay đổi dữ liệu (không chỉ xem).

2 trang **"Ánh xạ Điểm - STK_ID"** và **"Danh sách hàng Core"** là ngoại
lệ — KHÔNG có mức "chỉ xem", phải có quyền Sửa mới vào được trang (kể cả
để xem), vì 2 trang này chỉ hữu ích khi được sửa dữ liệu.

Vai trò hệ thống (có sẵn, `IsSystemRole=1`) **không sửa/gán lại quyền
được** qua trang này — mặc định luôn thấy & sửa được mọi trang.

### 1.3 Gán vai trò cho tài khoản (kể cả nâng lên quyền hệ thống)

Vào **Phân quyền** → dòng tài khoản cần gán → "Gán vai trò" → tick 1 hay
nhiều vai trò (1 tài khoản có thể giữ nhiều vai trò cùng lúc, quyền được
CỘNG DỒN) → Lưu. Muốn cho tài khoản đó TOÀN QUYỀN hệ thống, tick vào vai
trò có sẵn đánh dấu "hệ thống" (xem mục Tổng quan).

**Chỉ tài khoản ĐANG LÀ vai trò hệ thống mới bấm được nút này cho người
khác** — tài khoản chỉ có quyền Sửa trang Phân quyền (không phải vai trò
hệ thống) sẽ bị chặn.

Gán vai trò xong, hệ thống **đăng xuất ngay phiên cũ** của tài khoản đó và
quyền có hiệu lực ngay lập tức, không cần đợi.

### 1.4 Bảng tra cứu các trang (Menu) ở etl-admin

| Trang (sidebar) | Có mức "chỉ xem" không |
|---|---|
| Dashboard | Có |
| Nguồn dữ liệu | Có |
| Đồng bộ | Có |
| Log | Có (chỉ xem, không ai sửa) |
| Nhật ký thao tác | Có (chỉ xem) |
| Chỉ tiêu Lãnh đạo Tập đoàn | Có |
| Chỉ tiêu HCRC | Có |
| Ánh xạ Điểm - STK_ID | **KHÔNG** — bắt buộc quyền Sửa |
| Danh sách hàng Core | **KHÔNG** — bắt buộc quyền Sửa |
| Phân quyền | Có |
| Vai trò | Có |
| Hướng dẫn | Xem tự do, không cần cấp quyền riêng |

---

## Phần 2 — API (api-admin)

Thao tác **giống hệt** Phần 1 (ETL) — cùng cơ chế Vai trò + quyền theo
trang, cùng ràng buộc "chỉ vai trò hệ thống gán được vai trò/đặt lại mật
khẩu/2FA người khác". Khác đúng 1 điểm về tên gọi:

> Trang quản lý tài khoản ở đây tên là **"Tài khoản quản trị"** (KHÔNG
> phải "Phân quyền" như etl-admin) — dễ nhầm, lưu ý khi hướng dẫn người
> khác. Trang "Vai trò" tên giống etl-admin.

**Lưu ý quan trọng khác biệt với các "Đối tác"**: quyền vào trang quản trị
api-admin (Vai trò/Tài khoản quản trị ở đây) **hoàn toàn KHÁC** quyền của
1 "Đối tác" (`api.ApiConsumers` — bên ngoài gọi API bằng API key riêng,
quản lý ở trang "Đối tác", không liên quan gì tới Vai trò/Tài khoản quản
trị trong mục này).

### Bảng tra cứu các trang (Menu) ở api-admin

| Trang (sidebar) | Có mức "chỉ xem" không |
|---|---|
| Đối tác | Có |
| Nguồn dữ liệu | Có |
| Endpoint realtime | Có |
| Endpoint ghi | Có |
| Báo cáo | Có |
| Kết nối hiện tại | Có (chỉ xem) |
| Lịch sử | Có (chỉ xem) |
| Top truy vấn | Có (chỉ xem) |
| Log | Có (chỉ xem) |
| Nhật ký thao tác | Có (chỉ xem) |
| Tài khoản quản trị | Có |
| Vai trò | Có |
| Cấu hình Voucher | Có |
| Hướng dẫn | Xem tự do |

---

## Phần 3 — Report (rp-user)

### 3.1 Tạo tài khoản

Vào **Hệ thống → Phân quyền → tab Người dùng** → "Tạo tài khoản" → điền
`Tên đăng nhập`, `Mật khẩu`, `Họ tên`, `Email` (tuỳ chọn) → Lưu.

**Cách thứ 2 — "Đồng bộ tài khoản" (HCRC Workspace)**: bấm nút "Đồng bộ
tài khoản" ở đầu trang Người dùng, hệ thống tự lấy danh bạ nhân sự từ HCRC
Workspace, khớp theo tên đăng nhập, tạo tài khoản mới cho người CHƯA có.
Tài khoản tạo kiểu này:
- **Chưa có mật khẩu riêng** (đăng nhập qua HCRC Workspace, không gõ mật
  khẩu ở đây).
- **Mặc định bị KHOÁ** (`Cho phép kết nối` = tắt) — admin phải vào bấm "Mở
  khoá" cho từng người thật sự cần dùng, KHÔNG tự động cho vào ngay.
- Lần đồng bộ SAU, người nào không còn thấy trong danh bạ HCRC Workspace
  sẽ **tự động bị khoá lại**.

Tài khoản tạo tay (không qua đồng bộ) luôn đăng nhập bằng mật khẩu riêng ở
đây, độc lập với HCRC Workspace.

Không có nút xoá tài khoản — chỉ Khoá/Mở khoá (cùng lý do giữ dấu vết nhật
ký như etl/api).

### 3.2 Tạo vai trò & gán quyền — mô hình 3 LỚP

Vào **Hệ thống → Phân quyền → tab Vai trò** → "Tạo vai trò mới" → điền Mã
+ Tên → Lưu → bấm "Gán quyền" ngay dòng vai trò đó. Khác HẲN etl/api, ở
đây có **3 khối quyền ĐỘC LẬP**, phải tick đủ cả 3 khối cần thiết (tick
khối 1 không tự kéo theo khối 2/3):

1. **"Menu được thấy"** — vai trò này nhìn thấy MỤC NÀO trong sidebar (vd
   "Báo cáo kinh doanh", "Hệ thống → Phân quyền"...). Chỉ quyết định menu
   có HIỆN hay không, KHÔNG tự cho xem báo cáo bên trong.
2. **"Báo cáo được chạy"** — trong các báo cáo ĐÃ ĐỊNH NGHĨA SẴN (ở
   "Biểu mẫu"), vai trò này được mở ĐÚNG báo cáo nào (tick từng báo cáo cụ
   thể, vd "Báo cáo doanh thu cuối ngày HCRC"). Thấy menu "Báo cáo kinh
   doanh" (khối 1) mà KHÔNG được tick báo cáo nào ở đây thì vào trang vẫn
   trống, không chọn được báo cáo nào.
3. **"Domain được tự khám phá (Báo cáo tự do)"** — KHÁC HẲN khối 2: đây là
   quyền tự chọn chỉ tiêu/chiều dữ liệu để TỰ DỰNG báo cáo mới (tính năng
   "Báo cáo tự do"), không phải xem báo cáo có sẵn. Vai trò không cần dùng
   "Báo cáo tự do" thì để trống khối này.

Vai trò hệ thống (có sẵn, `IsSystemRole=1`) bỏ qua cả 3 lớp — luôn thấy hết
mọi menu, mọi báo cáo, mọi Domain.

### 3.3 Gán vai trò cho tài khoản / nâng lên quyền hệ thống

Giống Phần 1 mục 1.3 (Hệ thống → Phân quyền → tab Người dùng → "Gán vai
trò"), **thêm 1 ràng buộc riêng của rp-user**: muốn gán vai trò HỆ THỐNG
(toàn quyền) cho 1 tài khoản, tài khoản đó phải đang đăng nhập bằng **mật
khẩu riêng** (tạo tay), KHÔNG được là tài khoản tạo qua "Đồng bộ tài khoản"
(đăng nhập qua HCRC Workspace) — vì vai trò Admin cần đăng nhập độc lập,
không phụ thuộc hệ thống HCRC Workspace có đang hoạt động hay không.

### 3.4 Bảng tra cứu các trang (Menu) ở rp-user

| Trang (sidebar) | Nhóm |
|---|---|
| Trang chủ | gốc |
| Dashboard | gốc |
| Báo cáo kinh doanh | gốc |
| Báo cáo vận hành | gốc |
| Báo cáo Mua hàng | gốc |
| Báo cáo tự do | gốc |
| **Hệ thống** (mục cha — chỉ hiện nếu có ≥1 mục con bên dưới được phép) | gốc |
| ├ Phân quyền | Hệ thống |
| ├ Biểu mẫu | Hệ thống |
| ├ Nhật ký thao tác | Hệ thống |
| ├ Danh mục | Hệ thống |
| ├ Thiết lập email | Hệ thống |
| ├ Lịch gửi email báo cáo | Hệ thống |
| ├ Cảnh báo bất thường | Hệ thống |
| ├ Xác thực HCRC Workspace | Hệ thống |
| └ Log | Hệ thống |
| Hướng dẫn | gốc — xem tự do |

---

## Bảo mật dùng chung (ETL / API / Report)

### Mật khẩu

Băm bằng `bcrypt` (cost 10) ngay khi tạo/đổi mật khẩu — CSDL không bao giờ
lưu mật khẩu dạng chữ thường. Đổi mật khẩu CHO NGƯỜI KHÁC (không phải tự
đổi của mình) cũng chỉ tài khoản vai trò hệ thống làm được.

### 2FA (xác thực 2 lớp) bắt buộc cho vai trò hệ thống

- Lần đăng nhập đầu tiên của 1 tài khoản VỪA được gán vai trò hệ thống
  (hoặc đã là vai trò hệ thống nhưng chưa từng bật 2FA): hệ thống hiện màn
  hình quét mã QR bằng app Authenticator (Google Authenticator, Microsoft
  Authenticator...) — PHẢI hoàn tất bước này mới vào được bất kỳ trang nào
  khác, không có cách bỏ qua.
- Sau khi xác nhận xong, hệ thống hiện **10 mã khôi phục dùng 1 lần** —
  chỉ hiện ĐÚNG 1 LẦN DUY NHẤT lúc đó, phải lưu lại ngay (dùng khi mất điện
  thoại cài Authenticator).
- Vai trò THƯỜNG (không phải vai trò hệ thống) không bị bắt buộc 2FA.
- Đổi thiết bị 2FA (còn truy cập được, chỉ muốn chuyển điện thoại) — tự
  làm ở trang "Tài khoản của tôi", không cần người khác hỗ trợ.
- **Mất cả điện thoại lẫn 10 mã khôi phục** — không có cách tự khôi phục
  qua giao diện. Một tài khoản vai trò hệ thống KHÁC vào trang quản lý tài
  khoản, bấm "Đặt lại 2FA" cho tài khoản bị mất — thao tác này XOÁ 2FA cũ,
  lần đăng nhập kế tiếp của người đó sẽ bị bắt thiết lập lại từ đầu (không
  tắt hẳn 2FA, chỉ reset). Nếu KHÔNG CÒN tài khoản vai trò hệ thống nào
  khác truy cập được (vd chỉ có đúng 1 admin và người đó bị mất), phải nhờ
  DBA sửa trực tiếp trong CSDL (tắt cờ `TwoFactorEnabled` của tài khoản đó)
  — xem `deploy/Hướng dẫn nghiệp vụ.md` mục 3 để biết thêm chi tiết thao
  tác DBA.
- Mọi thao tác "Đặt lại 2FA cho người khác" đều được ghi vào Nhật ký thao
  tác, tra lại được ai đã reset cho ai, lúc nào.
