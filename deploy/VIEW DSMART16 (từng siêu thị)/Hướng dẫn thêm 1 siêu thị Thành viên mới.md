# Hướng dẫn thêm 1 siêu thị "Thành viên" mới

**"Thành viên"** = siêu thị/cửa hàng chạy CSDL DSMART16 RIÊNG trên server
của chính mình (KHÁC hẳn khối "HCRC trung tâm" — nhiều siêu thị dùng
CHUNG 1 CSDL DSMART16 tập trung, xem
`deploy/VIEW DSMART16 (trung tâm)/Hướng dẫn thiết lập HCRC trung tâm từ
đầu (VIEW + đồng bộ).md`). Mỗi siêu thị Thành viên cần 1 Nguồn dữ liệu +
2 Job đồng bộ (Doanh thu + Giao dịch) RIÊNG, trỏ đúng vào server của nó.

Domain `doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien` dựng ở
đây phục vụ 2 báo cáo "Báo cáo doanh thu cuối ngày LDTD/HCRC (Thành
viên)" — xem "báo cáo doanh thu thành viên.md" (tài liệu gốc, giải thích
đầy đủ TẠI SAO tách riêng domain Thành viên khỏi domain gốc).

## Bước 1 — Tạo VIEW + tài khoản chỉ-đọc TRÊN SERVER CỦA SIÊU THỊ MỚI

Chạy file **"Thiết lập VIEW + tài khoản etl_reader tại mỗi siêu thị
Thành viên.sql"** (cùng thư mục với file này) trên ĐÚNG máy chủ SQL
Server của siêu thị mới — file này TỰ ĐỦ (đã có cả câu tạo 2 VIEW
`V_HCRC_DOANHTHU_CHINHANH`/`V_HCRC_GIAODICH_CHINHANH` LẪN câu tạo tài
khoản `etl_reader` + cấp quyền SELECT).

Ai chạy: DBA/IT quản trị DSMART16 của siêu thị đó.

## Bước 2 — Tạo Nguồn dữ liệu + 2 Job đồng bộ (bằng script)

Thư mục `etl/`, mở file `etl/scripts/addThanhVienStore.js`, điền thông
tin siêu thị mới vào object `STORE` ở đầu file:

```js
const STORE = {
  name: 'TÊN SIÊU THỊ MỚI',      // vd 'BRGMart Núi Trúc'
  server: 'IP HOẶC TÊN SERVER'   // vd '172.16.74.110'
  // Chỉ thêm dòng nào KHÁC mặc định (port 1433, database 'DSMART16',
  // username 'etl_reader', password mặc định, encrypt/trustServerCert
  // false) — xem DEFAULT_* trong chính file này.
};
```

Rồi chạy:

```bash
cd etl
node scripts/addThanhVienStore.js
```

Script tự kiểm tra VIEW ở Bước 1 đã tồn tại đủ cột trước khi tạo job —
báo lỗi rõ và DỪNG LẠI nếu thiếu (chạy lại script sau khi tạo xong VIEW
là được, an toàn chạy lại nhiều lần). Tạo: 1 Nguồn dữ liệu (tên = đúng
`name` đã điền) + 2 Job đồng bộ Live (Doanh thu + Giao dịch, chu kỳ 2
phút/lần, `RescanLookbackDays` 7 ngày — KHÔNG có job "Lịch sử" riêng,
"cùng kỳ năm trước" đọc thẳng từ domain gốc, xem `seedThanhVienHistorySync.js`
đã deprecate từ bản 8.27).

**LƯU Ý BẢO MẬT**: nếu điền `password` RIÊNG (khác mặc định) vào `STORE`,
XOÁ lại về rỗng SAU KHI chạy xong, TRƯỚC KHI commit — không lưu mật khẩu
thật vào Git.

## Bước 3 — Ghi lại siêu thị mới vào code (để dựng lại môi trường sau này không bị thiếu)

Thêm đúng 1 dòng `{ name: '...', server: '...' }` vào mảng `STORES` trong
`etl/scripts/seedThanhVienLiveSync.js` (file chứa toàn bộ danh sách siêu
thị Thành viên hiện có), rồi commit — để nếu sau này có ai chạy lại file
đó (vd dựng môi trường hoàn toàn mới), siêu thị này vẫn được tạo đầy đủ,
không chỉ tồn tại ở CSDL hiện tại mà "biến mất" khỏi code.

## Bước 4 — Kiểm tra

1. `etl-admin → Nguồn dữ liệu`: thấy đúng Nguồn dữ liệu siêu thị mới,
   trạng thái kết nối OK.
2. `etl-admin → Đồng bộ`: thấy đủ 2 job (Doanh thu + Giao dịch) của siêu
   thị đó, bấm "Chạy thử" — "Lần chạy gần nhất" ra thành công.
3. Mở báo cáo "Báo cáo doanh thu cuối ngày LDTD/HCRC (Thành viên)" — thấy
   số liệu thật của siêu thị mới.
