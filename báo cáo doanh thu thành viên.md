# Báo cáo doanh thu thành viên — Live đọc trực tiếp từng cửa hàng (bản 8.13)

File này ĐỘC LẬP nhưng KHÔNG lặp lại nội dung đã có ở
"báo cáo doanh thu cuối ngày.md" — chỉ ghi phần KHÁC/THÊM cho 2 báo cáo mới
`bc-doanh-thu-ldtd-thanh-vien`/`bc-doanh-thu-hcrc-thanh-vien`. Đọc trước
"báo cáo doanh thu cuối ngày.md" (đặc biệt Bước 1 "Script A") nếu chưa quen
kiến trúc chung.

## Vì sao có bản này

2 báo cáo gốc ("báo cáo doanh thu cuối ngày.md") đọc dữ liệu Live từ 1 CSDL
`DSMART16` TẬP TRUNG tại trung tâm (dữ liệu các chi nhánh đã được đồng bộ
về đó trước). Yêu cầu ở đây khác: có **35 siêu thị/cửa hàng "Thành viên"**,
mỗi cửa hàng chạy CSDL DSMART16 CỦA RIÊNG MÌNH — cần đọc Live TRỰC TIẾP từ
từng cửa hàng, KHÔNG qua bước tổng hợp về trung tâm trước.

**Quyết định kiến trúc đã chốt với người dùng** (xem lý do đầy đủ trong
lịch sử trao đổi, tóm tắt ở đây để tra cứu):

| Hạng mục | Quyết định |
|---|---|
| Domain mới | `doanhthu_chinhanh_thanhvien` / `giaodich_chinhanh_thanhvien` |
| Phần Live (35 cửa hàng) | VẪN qua ETL → `dwh.ReportFacts` như mọi domain khác (KHÔNG đọc thẳng VIEW mỗi lần xem báo cáo — đã cân nhắc và loại bỏ vì tải lên CSDL bán hàng thật + rủi ro tốc độ/bảo mật khi rp-server phải mở kết nối trực tiếp tới 35 CSDL). Bù lại rút ngắn chu kỳ đồng bộ xuống ~1-2 phút (xem Bước 3) thay vì 15 phút mặc định. |
| VIEW tại mỗi cửa hàng | Chạy NGUYÊN VĂN Script A ở "báo cáo doanh thu cuối ngày.md" — KHÔNG sửa gì. |
| Phần Lịch sử ("Cùng kỳ năm trước") | KHÔNG tạo VIEW/Nguồn dữ liệu mới — tái dùng nguyên vẹn Nguồn dữ liệu "DSMART16 - Lịch sử" + Script B đã có ở trung tâm, chỉ thêm 2 Sync Job mới trỏ domain "Thành viên" (xem Bước 4). |
| Báo cáo | 2 báo cáo mới, NỘI DUNG giống hệt 2 báo cáo gốc (cùng cột/công thức/nhóm), chỉ đổi domain Doanh thu/Giao dịch tham chiếu. |
| Chỉ tiêu HCRC/LDTD + Ánh xạ Điểm-STK_ID | KHÔNG tạo thêm luồng upload — tái dùng NGUYÊN VẸN domain `sales-targets-hcrc`/`sales-targets-ldtd` và bảng "Ánh xạ Điểm - STK_ID" hiện có (1 nguồn duy nhất qua ETL như trước). |
| Nguồn dữ liệu (35 dòng) | Tạo tay HOẶC Nhập hàng loạt (Excel, đã có sẵn) HOẶC Xuất/Nhập file mã hoá (mới, bản 8.13). |
| Sync Job (tối đa 70 dòng) | Tạo tay HOẶC Nhập hàng loạt (Excel, MỚI ở bản 8.13) — 2 cách dùng xen kẽ được, không xung đột (upsert theo Tên). |

> **GIẢ ĐỊNH CẦN XÁC NHẬN VỚI DBA/IT**: báo cáo dùng CHUNG bảng "Ánh xạ Điểm
> - STK_ID" và chỉ tiêu HCRC/LDTD hiện có — nghĩa là `STK_ID`/`BU_ID` đọc từ
> VIEW tại MỖI cửa hàng "Thành viên" phải TRÙNG với mã đã khai trong bảng
> ánh xạ đó (ánh xạ theo mã, không theo "cửa hàng nào chạy VIEW nào"). Nếu
> hệ POS tại từng cửa hàng dùng LẠI đúng mã kho/mã Điểm như hệ trung tâm
> (thường đúng vì cùng 1 phần mềm cài đặt phân tán) thì không cần làm gì
> thêm; nếu KHÔNG, cột Doanh thu/Chỉ tiêu sẽ TRỐNG cho tới khi bổ sung đúng
> ánh xạ (an toàn — không sai âm thầm, xem `requireDiemStkMapping` ở
> `rp-server/lib/compositeReportRunner.js`).

## Bước 1 — Tạo VIEW tại MỖI cửa hàng (35 lần)

Chạy NGUYÊN VĂN "Script A" (`CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH`
+ `V_HCRC_GIAODICH_CHINHANH`) trong "báo cáo doanh thu cuối ngày.md" trên
CSDL `DSMART16` tại TỪNG cửa hàng — KHÔNG sửa gì trong script đó, VIEW đã
đúng công thức `SURPLUS`/`TRANS_CODE` (bản 8.10). Tài khoản chạy `CREATE
VIEW` cần quyền tạo VIEW trên CSDL đó (thường là DBA/IT quản trị tại cửa
hàng hoặc tài khoản quản trị chung nếu quản lý tập trung được).

## Bước 2 — Khai "Nguồn dữ liệu" cho từng cửa hàng (etl-admin)

Mỗi cửa hàng = 1 "Nguồn dữ liệu" (Server/Port/Database/Username/Password
trỏ ĐÚNG CSDL DSMART16 tại cửa hàng đó — xem ảnh minh hoạ ở trang "Nguồn dữ
liệu"). 3 cách, dùng xen kẽ tuỳ ý:

1. **Tạo tay** — form ở đầu trang "Nguồn dữ liệu", từng cửa hàng một.
2. **Nhập hàng loạt** (Excel, đã có sẵn trước bản 8.13) — cột bắt buộc
   `Name, Server, DatabaseName, Username, Password`, cột tuỳ chọn `Engine`
   (mặc định `mssql`), `Port`, `Encrypt`, `TrustServerCert`. File chứa mật
   khẩu THẬT dạng chữ thường — xoá khỏi máy sau khi nhập xong (xem cảnh báo
   ngay trên trang).
3. **Xuất/Nhập file mã hoá** (MỚI, bản 8.13) — nút "Xuất file mã hoá" tải
   về TOÀN BỘ danh sách Nguồn dữ liệu hiện có dưới dạng 1 file `.hcrcenc`
   KHÔNG đọc được bằng bất kỳ công cụ nào (kể cả Excel) — chỉ chính hệ
   thống này (giữ khoá `ETL_ENCRYPTION_KEY`) giải mã + nhập lại được qua
   "Nhập file mã hoá". Dùng để sao lưu/di chuyển cấu hình kết nối 35 cửa
   hàng mà KHÔNG lộ mật khẩu thật ở bất kỳ bước nào (mật khẩu giữ nguyên
   dạng đã mã hoá sẵn trong CSDL, không giải mã rồi mã hoá lại).

**Đặt tên nguồn có quy tắc** để dễ tra cứu khi tạo Sync Job ở Bước 3, ví dụ
`DSMART16 - <Tên cửa hàng>` (vd `DSMART16 - ST Hải Phòng`).

## Bước 3 — Tạo Sync Job Live cho từng cửa hàng (etl-admin → Đồng bộ)

Mỗi cửa hàng cần **2 job** (Doanh thu + Giao dịch), TargetDomain =
`doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien`. 2 cách:

1. **Tạo tay** — form "Thêm đồng bộ mới", Loại "Theo bảng", chọn đúng Nguồn
   dữ liệu của cửa hàng đó, chọn VIEW đã tạo ở Bước 1 từ dropdown (đọc
   schema thật, không gõ tay).
2. **Nhập hàng loạt** (Excel, MỚI ở bản 8.13) — cột bắt buộc `Name,
   DataSourceName, TargetDomain, SourceSchema, SourceTable, KeyColumn,
   DateColumn, UpdatedAtColumn`, cột tuỳ chọn `DimensionColumns,
   MeasureColumns` (nhiều cột cách nhau bằng dấu phẩy), `CronExpression`,
   `KeepHistory`, `IsActive`. `DataSourceName` phải KHỚP đúng Tên nguồn đã
   tạo ở Bước 2. Mỗi dòng được đối chiếu với schema THẬT của nguồn (gọi
   mạng) trước khi ghi — file 70 dòng có thể mất vài chục giây tới vài
   phút, đợi tới khi trang báo kết quả xong.

**2 dòng mẫu** (điền `Name`/`DataSourceName` theo từng cửa hàng, các cột
còn lại GIỐNG HỆT nhau cho cả 35 cửa hàng — copy xuống dưới rồi chỉ sửa 2
cột đó):

| Cột | Job Doanh thu | Job Giao dịch |
|---|---|---|
| Name | `Doanh thu (TV) - ST Hải Phòng` | `Giao dịch (TV) - ST Hải Phòng` |
| DataSourceName | `DSMART16 - ST Hải Phòng` | `DSMART16 - ST Hải Phòng` |
| TargetDomain | `doanhthu_chinhanh_thanhvien` | `giaodich_chinhanh_thanhvien` |
| SourceSchema | `dbo` | `dbo` |
| SourceTable | `V_HCRC_DOANHTHU_CHINHANH` | `V_HCRC_GIAODICH_CHINHANH` |
| KeyColumn | `STK_ID` | `BU_ID` |
| DateColumn | `WORK_DATE` | `TRAN_DATE` |
| UpdatedAtColumn | `WORK_DATE` | `TRAN_DATE` |
| DimensionColumns | `dienTich,chain` | (để trống) |
| MeasureColumns | `doanhThu,laiGop` | `SoGiaoDich` |
| CronExpression | `*/2 * * * *` | `*/2 * * * *` |
| KeepHistory | `TRUE` | `TRUE` |

**Vì sao `CronExpression = */2 * * * *`** (mỗi 2 phút, khác `*/15 * * * *`
mặc định của 2 báo cáo gốc) — người dùng chọn giữ mô hình qua
`dwh.ReportFacts` (không đọc thẳng VIEW) nhưng muốn dữ liệu gần sát thời
gian thực hơn — rút ngắn chu kỳ đồng bộ là cách đạt được điều đó mà KHÔNG
đổi kiến trúc. Chỉnh lại số phút tuỳ tải thực tế (không nên dưới 1 phút —
1 lượt đồng bộ cho 35 nguồn cần thời gian chạy thật, đặt quá ngắn có thể
chồng lấn, dù `jobs/scheduler.js` đã tự chặn 2 lượt cùng job chạy chồng).

> **Lưu ý `UpdatedAtColumn = DateColumn`** (cùng WORK_DATE/TRAN_DATE) —
> giống hệt cách 2 báo cáo gốc cấu hình (xem `scripts/seedLdtdHcrcSync.js`)
> — nghĩa là nếu SAU NÀY còn sửa lại công thức VIEW `V_HCRC_DOANHTHU_CHINHANH`/
> `V_HCRC_GIAODICH_CHINHANH` (vd đợt sửa Lãi gộp tương lai), NHỮNG NGÀY ĐÃ
> ĐỒNG BỘ sẽ KHÔNG tự kéo lại giá trị mới (cùng vấn đề watermark đã gặp ở
> bản 8.5) — cần script resync riêng cho domain "Thành viên" khi đó, viết
> tương tự `etl/scripts/resyncDoanhThuChinhanhLive.js` nhưng đổi tên miền/
> job cho phù hợp (chưa cần làm ngay — chỉ cần biết trước để không bất ngờ).

## Bước 4 — Tạo 2 job "Lịch sử (Thành viên)" tập trung (chạy 1 lần)

```
cd etl
node scripts/seedThanhVienHistorySync.js
```

Script này tái dùng Nguồn dữ liệu "DSMART16 - Lịch sử" và 2 VIEW Script B
ĐÃ CÓ SẴN (không sửa gì ở CSDL trung tâm) — chỉ thêm 2 Sync Job mới trỏ
domain `doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien`. Yêu
cầu đã chạy `scripts/seedLdtdHcrcSync.js` trước đó (2 báo cáo gốc đã có) —
script báo lỗi rõ ràng và dừng lại nếu chưa.

## Bước 5 — Tạo/cập nhật 4 báo cáo (rp-server)

```
cd rp-server
node scripts/seedLdtdHcrcReports.js
```

Script đã được viết lại ở bản 8.13 để tạo/cập nhật **CẢ 4** báo cáo (2 gốc
+ 2 "Thành viên") trong 1 lượt chạy — an toàn chạy lại (khớp theo ReportId,
không tạo trùng). Nếu trước đó đã có 2 báo cáo gốc, chạy lại KHÔNG ảnh
hưởng gì tới chúng, chỉ thêm 2 báo cáo mới:

- `bc-doanh-thu-ldtd-thanh-vien` — "Báo cáo doanh thu cuối ngày LDTD (Thành viên)"
- `bc-doanh-thu-hcrc-thanh-vien` — "Báo cáo doanh thu cuối ngày HCRC (Thành viên)"

(Tên chính xác trên — nối theo đúng khuôn đặt tên của 2 báo cáo gốc, KHÔNG
phải trích nguyên văn yêu cầu ban đầu "Báo cáo doanh thu hcrc (Thành
viên)"/"...LDTD (Thành viên)" — đổi lại dễ ở `REPORTS` trong
`rp-server/scripts/seedLdtdHcrcReports.js` nếu muốn tên khác.)

`exportFileCode` (mã ghép tên file tải xuống) đặt tạm là `BCDDTLDTDTV`/
`BCDTHCRCTV` (thêm hậu tố "TV") — mã TỰ CHỌN (khác 2 mã gốc do chính người
dùng cung cấp), đổi lại dễ nếu cần mã khác.

## Bước 6 — Gán quyền xem (rp-user → Hệ thống → Phân quyền)

Script ở Bước 5 KHÔNG tự gán quyền (đúng quy ước hiện có, xem đầu file
`seedLdtdHcrcReports.js`) — vào rp-user gán quyền xem 2 báo cáo mới cho
đúng nhóm người dùng, tương tự đã làm với 2 báo cáo gốc.

## Bước 7 — Kiểm tra lại

1. etl-admin → Nguồn dữ liệu: đủ 35 dòng, "Kiểm tra kết nối"/kết quả nhập
   hàng loạt đều thành công.
2. etl-admin → Đồng bộ: đủ 70 job Live (35 cửa hàng × 2) + 2 job Lịch sử
   (Thành viên), tất cả "Bật", "Kiểm tra schema" ra ✅.
3. etl-admin → Log: sau vài phút, thấy job Live các cửa hàng đã chạy ít
   nhất 1 lần thành công.
4. rp-user → Báo cáo: mở 2 báo cáo "Thành viên", so số với báo cáo gốc
   (khác nhau vì nguồn Live khác, nhưng cấu trúc/công thức giống hệt) —
   nếu cột Doanh thu/Chỉ tiêu trống toàn bộ, xem lại phần "GIẢ ĐỊNH CẦN XÁC
   NHẬN" ở đầu file (khả năng cao là STK_ID/mã Điểm chưa khớp ánh xạ).
