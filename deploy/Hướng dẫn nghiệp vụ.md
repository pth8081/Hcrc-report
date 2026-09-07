# Hướng dẫn nghiệp vụ — Hệ thống Báo cáo HCRC

> **Phiên bản trước của file này bị SAI** — mô tả nghiệp vụ của một ứng
> dụng "HCRC Voucher Redemption App" không hề tồn tại trong repo này
> (nhầm với nội dung 1 file tham khảo khác). File này đã được viết lại
> HOÀN TOÀN, khớp đúng với hệ thống báo cáo thật đang có trong repo
> `hcrc-report`.

Tài liệu này giúp người MỚI (quản lý nghiệp vụ, IT vận hành) hiểu **hệ
thống này dùng để làm gì, có những trang nào, đăng nhập ra sao, và tìm
đúng chỗ để cấu hình 1 báo cáo/API mới**. Nếu cần các CÔNG THỨC cấu hình
chi tiết từng kịch bản báo cáo cụ thể (đã có sẵn, rất đầy đủ), xem file
`hướng_dẫn_báo_cáo.md` ở thư mục gốc repo — file này chỉ là bản đồ định
hướng, KHÔNG lặp lại nội dung đó. Nếu cần cài đặt/triển khai máy chủ, xem
file `Hướng dẫn triển khai PM2.md` (cùng thư mục — có thêm file
`Hướng dẫn triển khai sử dụng PM2 + Nginx.md` nếu cần domain/HTTPS).

**Ghi chú cập nhật**: mọi thay đổi/tính năng nghiệp vụ mới nên bổ sung
vào CHÍNH file này (phần bản đồ định hướng) và/hoặc `hướng_dẫn_báo_cáo.md`
(phần công thức chi tiết theo kịch bản) — không bổ sung vào 2 file
hướng dẫn triển khai.

## Mục lục

1. [Hệ thống này làm gì](#1-hệ-thống-này-làm-gì)
2. [3 giao diện — cái nào dùng để làm gì](#2-3-giao-diện--cái-nào-dùng-để-làm-gì)
3. [Đăng nhập lần đầu + 2FA](#3-đăng-nhập-lần-đầu--2fa)
4. [Phân quyền](#4-phân-quyền)
5. [Bản đồ chức năng — etl-admin](#5-bản-đồ-chức-năng--etl-admin)
6. [Bản đồ chức năng — api-admin](#6-bản-đồ-chức-năng--api-admin)
7. [Bản đồ chức năng — rp-user](#7-bản-đồ-chức-năng--rp-user)
8. [Muốn làm 1 việc cụ thể — tra ở đâu](#8-muốn-làm-1-việc-cụ-thể--tra-ở-đâu)
9. [Câu hỏi thường gặp](#9-câu-hỏi-thường-gặp)

---

## 1. Hệ thống này làm gì

Hệ thống Báo cáo HCRC gồm **3 service backend** phối hợp với nhau:

```
  Nguồn dữ liệu (nhiều siêu thị/chi nhánh, nhiều CSDL/hệ thống khác nhau)
                          │
                          ▼
         ┌─────────────────────────────┐
         │  etl/  — đồng bộ định kỳ     │   quản trị bằng etl-admin/
         │  (chọn bảng/cột, không cần   │
         │   biết code)                 │
         └─────────────────────────────┘
                          │  ghi vào
                          ▼
         ┌─────────────────────────────┐
         │  Data Warehouse (HCRC_DWH)   │   1 nơi TỔNG HỢP cho mọi báo cáo
         └─────────────────────────────┘
                  │                │
                  ▼                ▼
   ┌─────────────────────┐  ┌─────────────────────────┐
   │ rp-server/ + rp-user/ │  │ api-server/ + api-admin/ │
   │ báo cáo NỘI BỘ cho    │  │ dữ liệu "hôm nay" realtime│
   │ nhân viên/quản lý     │  │ + API cấp cho ĐỐI TÁC NGOÀI│
   └─────────────────────┘  └─────────────────────────┘
```

- **`etl/`** đồng bộ dữ liệu định kỳ (hoặc chạy tay) từ các nguồn (SQL
  Server/MySQL/MariaDB của từng chi nhánh/hệ thống) vào **Data Warehouse**
  (`HCRC_DWH`) — nơi tổng hợp DUY NHẤT mà các báo cáo tổng hợp/theo kỳ/so
  sánh cùng kỳ đọc dữ liệu. Cấu hình bằng cách CHỌN bảng/cột thật qua giao
  diện, không cần viết code cho phần lớn trường hợp.
- **`rp-server/` + `rp-user/`** phục vụ báo cáo cho người dùng nội bộ
  (nhân viên xem số liệu, quản lý xem báo cáo tổng hợp/dashboard). Đọc dữ
  liệu chủ yếu từ Data Warehouse, có thể phối thêm dữ liệu "hôm nay" từ
  `api-server/` khi cần số liệu tức thời chưa kịp đồng bộ.
- **`api-server/` + `api-admin/`** cấp API cho **đối tác/ứng dụng khác
  ngoài hệ thống này** gọi vào (xác thực bằng API key/HMAC/OAuth2), đồng
  thời phục vụ các báo cáo cần dữ liệu **tức thời** (không đợi chu kỳ
  đồng bộ của `etl/`) — ví dụ tra cứu 1 mã (voucher, đơn hàng...) ngay
  lúc phát sinh.

**Nguyên tắc chọn đường**: dữ liệu lịch sử/tổng hợp/so sánh theo kỳ → đi
qua `etl/` vào Data Warehouse rồi `rp-user/` đọc. Dữ liệu cần ĐÚNG NGAY
LÚC ĐÓ (không đợi lịch đồng bộ) hoặc cần cấp ra ngoài cho đối tác → đi
qua `api-server/`. Rất nhiều báo cáo thực tế PHỐI CẢ HAI (vd: hôm nay lấy
từ `api-server`, các ngày trước + cùng kỳ năm trước lấy từ Data
Warehouse) — xem `hướng_dẫn_báo_cáo.md` mục 2 cho ví dụ đầy đủ.

## 2. 3 giao diện — cái nào dùng để làm gì

| Giao diện | Dùng để | Ai dùng | Domain (sau triển khai) |
|---|---|---|---|
| **rp-user** | Xem báo cáo (nhân viên) + cấu hình báo cáo/hệ thống báo cáo (quản trị) — 2 vai trò dùng CHUNG 1 app, phân biệt bằng menu được cấp quyền | Nhân viên + quản trị báo cáo | `report.*` (công khai) |
| **api-admin** | Quản trị đối tác được cấp API, xem lịch sử/thống kê truy vấn API, khai nguồn dữ liệu + endpoint realtime | Quản trị viên API/tích hợp | `api-admin.*` (nội bộ/VPN) |
| **etl-admin** | Quản trị nguồn dữ liệu, cấu hình job đồng bộ, xem log đồng bộ, nhập chỉ tiêu kinh doanh | Quản trị viên dữ liệu/ETL | `etl-admin.*` (nội bộ/VPN) |

**Không có 1 trang "cổng vào chung"** — mỗi giao diện có địa chỉ (domain)
riêng, vào thẳng đúng địa chỉ cần dùng.

## 3. Đăng nhập lần đầu + 2FA

Tài khoản đăng nhập của 3 giao diện là **3 hệ thống HOÀN TOÀN riêng**
(không dùng chung 1 lần đăng nhập cho cả 3) — mỗi hệ thống có tài khoản
quản trị đầu tiên do IT tạo sẵn bằng lệnh (xem `Hướng dẫn triển khai
PM2.md` mục 6), sau đó đăng nhập bằng tên đăng nhập/mật khẩu đó tại đúng
domain tương ứng (mục 2).

**Lần đăng nhập ĐẦU TIÊN của mọi tài khoản vai trò `admin`** (cả 3 hệ
thống) sẽ bị bắt buộc thiết lập **xác thực hai yếu tố (2FA)** trước khi
vào được trang nào khác:

1. Màn hình hiện mã QR — quét bằng app Authenticator trên điện thoại
   (Google Authenticator, Microsoft Authenticator, Authy...).
2. Nhập mã 6 số app vừa hiện ra để xác nhận.
3. Hệ thống hiện **10 mã khôi phục** dùng 1 lần — chép lại/in ra, cất nơi
   an toàn (dùng khi mất điện thoại, không còn cách nào lấy mã 6 số).

Từ lần đăng nhập sau, chỉ cần nhập thêm mã 6 số hiện tại trên app
Authenticator sau khi nhập đúng mật khẩu. **Vai trò khác `admin`** (vd
`viewer`, nhân viên xem báo cáo thường) KHÔNG bị bắt buộc 2FA.

**Quên/mất điện thoại xác thực** — 1 admin khác trong CÙNG hệ thống có
thể vào trang "Phân quyền"/"Tài khoản quản trị" bấm "Đặt lại 2FA" giúp;
lần đăng nhập kế tiếp sẽ bắt thiết lập lại từ đầu. Nếu KHÔNG còn admin
nào khác và cũng mất luôn mã khôi phục — cần DBA can thiệp trực tiếp CSDL
(xem `deploy/README.md` mục 5).

## 4. Phân quyền

- **`etl-admin`**: vai trò `admin` (thấy tất cả), `viewer` (chỉ xem),
  `target_importer` (CHỈ thấy trang "Nhập chỉ tiêu", không thấy gì khác).
- **`api-admin`**: vai trò `admin` (thấy tất cả, kể cả CRUD đối tác/luân
  chuyển key), `viewer` (chỉ xem).
- **`rp-user`**: phân quyền THEO TỪNG MỤC MENU (`app.RoleMenuAccess`),
  không chỉ 2-3 vai trò cố định — trang "Phân quyền" cho phép tạo Vai
  trò tuỳ ý, tick chọn từng mục menu vai trò đó được thấy, rồi gán Vai
  trò cho từng Tài khoản người dùng. Vai trò `Quản trị hệ thống` (tạo sẵn
  lúc chạy `seed:admin`) mặc định thấy toàn bộ menu.

## 5. Bản đồ chức năng — etl-admin

| Trang | Việc làm được |
|---|---|
| **Dashboard** | Tổng số job/nguồn, job lỗi 24h qua, các lượt chạy gần nhất |
| **Nguồn dữ liệu** | CRUD nguồn (SQL Server hoặc MySQL/MariaDB), kiểm tra kết nối, import hàng loạt bằng file Excel |
| **Đồng bộ** | Tạo job "theo bảng" (duyệt bảng/cột thật của nguồn, không cần gõ tay, tuỳ chọn thêm 1 bảng liên kết) hoặc "tuỳ biến" (connector viết sẵn cho trường hợp phức tạp); chạy thử/bật-tắt/xoá job; ánh xạ mã chi nhánh khi 1 chi nhánh có nhiều mã khác nhau giữa các hệ thống |
| **Nhập chỉ tiêu** | Upload Excel chỉ tiêu (target/KPI) theo tháng — trang DUY NHẤT vai trò `target_importer` thấy được |
| **Ánh xạ mã chi nhánh** | Quy đổi mã chi nhánh khi các nguồn đặt tên/mã khác nhau cho cùng 1 chi nhánh thật |
| **Log** | Lịch sử chạy job đồng bộ, lọc theo trạng thái |
| **Nhật ký thao tác (Audit Log)** | Ai làm gì, lúc nào (tạo/sửa/xoá nguồn, job, chỉ tiêu...) |
| **Phân quyền** | CRUD tài khoản quản trị (`admin`/`viewer`/`target_importer`), đặt lại 2FA cho admin khác |

## 6. Bản đồ chức năng — api-admin

| Trang | Việc làm được |
|---|---|
| **Đối tác** | CRUD đối tác được cấp API (`api.ApiConsumers`), luân chuyển API key/HMAC secret (chỉ vai trò `admin`) |
| **Nguồn dữ liệu** | Khai nguồn dữ liệu (thường là CSDL vận hành của từng siêu thị) dùng cho endpoint realtime |
| **Endpoint realtime** | Tạo endpoint tra cứu tức thời (vd tra 1 mã voucher/đơn hàng) — duyệt bảng/cột thật của nguồn đã khai, không viết code, tuỳ chọn ghép thêm 1 bảng liên kết |
| **Báo cáo** | Định nghĩa báo cáo tổng hợp phục vụ qua `/api/v1/reports` (đọc từ Data Warehouse) |
| **Kết nối hiện tại** | Request `/api/v1/*` đang xử lý (tức thời) + số kết nối CSDL đang dùng trong từng pool |
| **Lịch sử** | Nhật ký request API, lọc theo endpoint/thời gian |
| **Top truy vấn** | Tổng hợp theo endpoint/đối tác, 1 giờ/24 giờ/7 ngày qua |
| **Nhật ký thao tác (Audit Log)** | Ai làm gì, lúc nào |
| **Phân quyền** | CRUD tài khoản quản trị (`admin`/`viewer`), đặt lại 2FA cho admin khác |

## 7. Bản đồ chức năng — rp-user

| Trang | Việc làm được |
|---|---|
| **Trang chủ** | Trang mặc định sau đăng nhập |
| **Dashboard** | Tổng hợp nhiều biểu đồ trong 1 màn hình, có lọc chéo giữa các biểu đồ |
| **Báo cáo kinh doanh / vận hành / Mua hàng** | 3 nhóm báo cáo (dùng chung 1 trang, chọn tab) — mỗi báo cáo có bộ lọc động, xem trước, xuất Excel/PDF, có thể có biểu đồ/pivot/drill-through |
| **Hệ thống → Phân quyền** | Tạo Vai trò, tick quyền theo từng mục menu, gán Vai trò cho Tài khoản người dùng |
| **Hệ thống → Biểu mẫu** | Tạo/sửa ĐỊNH NGHĨA báo cáo mới (nguồn dữ liệu, bộ lọc, cột hiển thị, biểu đồ, dashboard) — đây là nơi thêm 1 báo cáo mới vào hệ thống |
| **Hệ thống → Log** | Nhật ký thao tác quản trị + lịch sử gửi email báo cáo tự động |
| **Hệ thống → Danh mục** | Danh mục dùng chung cho bộ lọc dạng chọn (select/multiSelect) |
| **Hệ thống → Thiết lập email** | Cấu hình SMTP gửi báo cáo định kỳ |
| **Hệ thống → Lịch gửi email báo cáo** | Đặt lịch gửi tự động (nhiều khung giờ/1 báo cáo) |
| **Hệ thống → Cảnh báo bất thường** | Cấu hình tự động phát hiện chi nhánh/thực thể lệch khác thường (so kỳ % hoặc ngưỡng tuyệt đối) |
| **Hệ thống → Xác thực HCRC Workspace** | Cấu hình đăng nhập/đồng bộ tài khoản qua hệ thống xác thực chung HCRC Workspace (nếu công ty dùng) |

## 8. Muốn làm 1 việc cụ thể — tra ở đâu

`hướng_dẫn_báo_cáo.md` (thư mục gốc repo) đã có sẵn CÔNG THỨC từng bước
cho các kịch bản phổ biến — tra theo mục số:

| Muốn làm gì | Xem mục nào trong `hướng_dẫn_báo_cáo.md` |
|---|---|
| Báo cáo doanh thu từ dữ liệu đã đồng bộ (Data Warehouse) | Mục 1 |
| Báo cáo có số liệu "hôm nay" (chưa kịp đồng bộ) | Mục 2 |
| Tra cứu 1 mã (voucher, đơn hàng...) qua API tức thời | Mục 3 |
| Báo cáo đối chiếu siêu thị ↔ trung tâm, gửi qua email | Mục 4 |
| Cảnh báo tự động khi 1 chi nhánh lệch khác thường | Mục 5 |
| Chỉ tiêu (KPI) theo ngành hàng/SKU, không chỉ theo chi nhánh | Mục 6 |
| Đăng nhập/đồng bộ tài khoản qua HCRC Workspace | Mục 7 |
| Thêm biểu đồ cho 1 báo cáo | Mục 8 |
| Dashboard nhiều biểu đồ + lọc chéo | Mục 9 |
| Drill-through (bấm 1 điểm nhảy sang báo cáo khác đã lọc sẵn) | Mục 10 |
| Kết nối 1 nguồn dữ liệu cụ thể (DSMART16) | Mục 11 |

## 9. Câu hỏi thường gặp

**Tạo được tài khoản `admin` ở `etl-admin` rồi thì có tự đăng nhập được
`rp-user`/`api-admin` không?** — Không. 3 hệ thống có bảng tài khoản
RIÊNG (mục 3) — phải tạo đủ cả 3 (xem `Hướng dẫn triển khai PM2.md` mục 6).

**Muốn thêm 1 báo cáo mới thì vào đâu?** — `rp-user`, menu "Hệ thống →
Biểu mẫu" (mục 7) — hoặc thêm trực tiếp 1 dòng vào `app.ReportCatalog`
nếu quen làm việc trực tiếp trên CSDL (xem `rp-server/README.md`).

**Muốn cấp API cho 1 đối tác mới thì vào đâu?** — `api-admin`, menu "Đối
tác" (mục 6) — tạo đối tác, chọn phương thức xác thực (API key/HMAC/
OAuth2), rồi cấp quyền gọi endpoint/report cụ thể.

**Vì sao có 2 khái niệm "Nguồn dữ liệu" khác nhau (ở `etl-admin` và
`api-admin`)?** — Đây là 2 nguồn ĐỘC LẬP, phục vụ 2 mục đích khác nhau:
"Nguồn dữ liệu" ở `etl-admin` dùng để ĐỒNG BỘ ĐỊNH KỲ vào Data Warehouse;
"Nguồn dữ liệu" ở `api-admin` dùng để TRA CỨU TỨC THỜI (không đồng bộ,
gọi thẳng vào CSDL nguồn mỗi lần có request) — khai riêng ở đúng nơi cần
dùng, không dùng chung 1 chỗ khai cho cả 2 mục đích.
