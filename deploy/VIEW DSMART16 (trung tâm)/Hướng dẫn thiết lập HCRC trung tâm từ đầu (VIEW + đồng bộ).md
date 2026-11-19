# Hướng dẫn thiết lập HCRC trung tâm từ đầu (VIEW + đồng bộ)

**Dùng khi nào**: dựng 1 môi trường HOÀN TOÀN MỚI (server mới), hoặc trỏ hệ
thống sang 1 cặp máy chủ `DSMART16`/`DSMART16_EOM` khác — gom đủ thông tin
cần thiết vào 1 chỗ, không phải lục lại hội thoại cũ hay đọc hết file
"báo cáo doanh thu cuối ngày.md" (file đó vẫn là tài liệu GỐC giải thích
đầy đủ công thức/nghiệp vụ — xem khi cần hiểu TẠI SAO, không cần đọc lại
mỗi lần deploy).

Domain `doanhthu_chinhanh`/`giaodich_chinhanh` dựng ở đây được DÙNG CHUNG
bởi nhiều báo cáo: "Báo cáo nhanh doanh thu — Lãnh đạo Tập đoàn/HCRC",
"Báo cáo tổng hợp doanh thu siêu thị (HCRC)/(LĐTĐ)" — làm ĐÚNG 1 LẦN ở
đây là đủ cho tất cả, không cần lặp lại cho từng báo cáo.

## Bước 1 — Tạo 2 VIEW nguồn trên DSMART16

Chạy file **"Thiết lập VIEW Doanh thu-Giao dịch chi nhánh (Script A+B,
DSMART16 + DSMART16_EOM).sql"** (cùng thư mục với file này):
- **Script A** — chạy trên CSDL `DSMART16` (Live).
- **Script B** — chạy trên CSDL `DSMART16_EOM` (Lịch sử), kèm theo đoạn
  tạo stored procedure + SQL Server Agent Job tự chạy lại hàng tháng
  (BẮT BUỘC, không chạy đoạn này thì VIEW lịch sử sẽ "quên" các bảng
  tháng mới DSMART16 tự tạo sau này).

Ai chạy: DBA/IT quản trị DSMART16 (tài khoản tạo VIEW cần quyền cao hơn
tài khoản chỉ-đọc dùng ở Bước 2). Sau khi tạo VIEW xong, DBA cấp thêm
quyền `SELECT` trên đúng 2 VIEW đó cho tài khoản chỉ-đọc sẽ dùng ở Bước 2.

Kiểm tra: mở rộng CẢ 2 CSDL → Views → thấy đủ `V_HCRC_DOANHTHU_CHINHANH`
và `V_HCRC_GIAODICH_CHINHANH`.

## Bước 2 — Tạo 2 Nguồn dữ liệu + 4 Job đồng bộ (bằng script, không cần bấm tay)

Thư mục `etl/`, thêm vào `.env`:

```bash
DSMART16_SERVER=<địa chỉ máy chủ SQL Server DSMART16>
DSMART16_USER=<tài khoản CHỈ ĐỌC, đã được DBA cấp quyền SELECT ở Bước 1>
DSMART16_PASSWORD=<mật khẩu tài khoản trên>

# Tuỳ chọn — CHỈ cần khai nếu khác mặc định (2 CSDL CÙNG 1 máy chủ, CÙNG
# 1 tài khoản là trường hợp phổ biến nhất, không cần khai thêm gì):
# DSMART16_PORT=1433
# DSMART16_LIVE_DB=DSMART16
# DSMART16_EOM_DB=DSMART16_EOM
# DSMART16_EOM_SERVER=<khác DSMART16_SERVER nếu 2 CSDL ở 2 máy chủ riêng>
# DSMART16_EOM_PORT=<khác DSMART16_PORT nếu cần>
# DSMART16_EOM_USER=<khác DSMART16_USER nếu cần>
# DSMART16_EOM_PASSWORD=<khác DSMART16_PASSWORD nếu cần>
# DSMART16_ENCRYPT=false       # tắt mã hoá kết nối (mặc định bật)
# DSMART16_TRUST_CERT=true     # tin chứng chỉ TLS tự ký (mặc định tắt)
```

Rồi chạy:

```bash
cd etl
node scripts/seedLdtdHcrcSync.js
```

Script này (an toàn chạy lại nhiều lần — khớp theo `Name`, UPDATE thay vì
tạo trùng):
1. Tạo/cập nhật 2 **Nguồn dữ liệu**: `DSMART16 - Live`, `DSMART16 - Lịch sử`.
2. **Tự kiểm tra** 2 VIEW ở Bước 1 đã tồn tại đủ cột cần dùng trước khi tạo
   job — báo lỗi rõ ràng và DỪNG LẠI nếu thiếu, không tạo job nửa vời.
3. Tạo/cập nhật 4 **Job đồng bộ** (vào `etl.SyncJobs`, domain
   `doanhthu_chinhanh`/`giaodich_chinhanh`):

| Job | Nguồn | Chu kỳ | Quét lại (RescanLookbackDays) |
|---|---|---|---|
| Doanh thu chi nhánh - Live (DSMART16) | DSMART16 - Live | 2 phút/lần | 7 ngày |
| Doanh thu chi nhánh - Lịch sử (DSMART16_EOM) | DSMART16 - Lịch sử | Hàng ngày 3h sáng | 40 ngày |
| Giao dịch chi nhánh - Live (DSMART16) | DSMART16 - Live | 15 phút/lần | — |
| Giao dịch chi nhánh - Lịch sử (DSMART16_EOM) | DSMART16 - Lịch sử | Hàng ngày 3h sáng | 40 ngày |

Scheduler ETL tự nạp job mới trong tối đa 60 giây — KHÔNG cần khởi động
lại tiến trình `etl`.

## Bước 3 — Kiểm tra sau khi triển khai xong

1. `etl-admin → Nguồn dữ liệu`: thấy đủ 2 nguồn `DSMART16 - Live`/
   `DSMART16 - Lịch sử`, trạng thái kết nối OK.
2. `etl-admin → Đồng bộ`: thấy đủ 4 job ở bảng trên, bấm "Chạy thử" từng
   job — "Lần chạy gần nhất" ra thành công, không lỗi.
3. Mở 1 báo cáo đang dùng domain này (vd "Báo cáo tổng hợp doanh thu siêu
   thị (HCRC)") — có số liệu thật, không rỗng.
4. (Tuỳ, nếu cần gán `Nhóm chuỗi`/`Mã QLKV` cho từng mã Điểm) — vào
   etl-admin → "Ánh xạ Điểm - STK_ID", khai `LoaiChuoi`/`MaQLKV`/`BuId`
   theo đúng danh sách mã Điểm thật của môi trường này.

## Việc KHÔNG nằm trong phạm vi file này

- Chỉ tiêu (Kế hoạch doanh thu/bill) — xem các trang "Nhập chỉ tiêu"
  riêng (etl-admin), không liên quan tới VIEW/đồng bộ ở đây.
- Từng siêu thị "Thành viên" (chạy CSDL riêng, KHÔNG thuộc DSMART16 trung
  tâm) — xem
  `deploy/VIEW DSMART16 (từng siêu thị)/Hướng dẫn thêm 1 siêu thị Thành
  viên mới.md`.
- Các báo cáo KHÁC domain `doanhthu_chinhanh`/`giaodich_chinhanh` (Bán
  buôn chi tiết, Đơn đặt hàng, Tồn kho...) — mỗi báo cáo đó có VIEW/script
  riêng, xem đúng file `.sql` cùng tên trong thư mục
  `deploy/VIEW DSMART16 (trung tâm)/` và file `bc-*.md`/`báo cáo *.md`
  tương ứng ở gốc repo (bảng tra cứu đầy đủ: mục 17 "Danh mục báo cáo"
  trong `hướng_dẫn_báo_cáo.md`).
