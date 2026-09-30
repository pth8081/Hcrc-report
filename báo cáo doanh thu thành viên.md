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

Chạy NGUYÊN VĂN 2 câu `CREATE OR ALTER VIEW` dưới đây trên CSDL `DSMART16`
tại TỪNG cửa hàng — KHÔNG sửa gì (copy y hệt "Script A" ở "báo cáo doanh
thu cuối ngày.md" sang đây để IT không phải mở thêm file khác khi triển
khai — xem file đó nếu cần đọc lại TOÀN BỘ lịch sử/lý do chọn công thức
này, không bắt buộc để làm theo). Tài khoản chạy `CREATE VIEW` cần quyền
tạo VIEW trên CSDL đó (thường là DBA/IT quản trị tại cửa hàng hoặc tài
khoản quản trị chung nếu quản lý tập trung được).

```sql
-- VIEW 1: Doanh thu + Lãi gộp + Diện tích + Nhóm chuỗi, gộp theo (chi nhánh, ngày)
-- STRANS = bảng CHI TIẾT giao dịch thật. STOCK.TYPE (KHÔNG phải STYPE_ID —
-- cột đó luôn trống) phân loại '01'=MART, '02'=MINIMART, đã xác nhận qua
-- tên chi nhánh thật.
--
-- Công thức DBA DSMART16 cung cấp trực tiếp (bản 8.10 — xem đầy đủ lịch sử
-- ở "giá vốn dsmart.md" mục 8 nếu cần): STRANS có sẵn cột SURPLUS, chính
-- là LÃI GỘP hệ thống POS đã tự tính SẴN cho TỪNG DÒNG giao dịch tại thời
-- điểm bán — KHÔNG cần tra cứu/tính giá vốn từ đâu khác. AMOUNT KHÔNG bao
-- gồm SURPLUS — doanh thu đúng = AMOUNT + SURPLUS. TRANS_CODE phân loại
-- giao dịch: 211/221/232 = bán, 212/222 = TRẢ HÀNG tương ứng (ghi AMOUNT
-- DƯƠNG, phải TRỪ RIÊNG chứ không tự netting qua SUM). VIEW chỉ lấy 5 mã
-- này — các mã khác (vd 333) bị LOẠI HẲN khỏi "Doanh thu" (nghi là loại
-- giao dịch khác — bán sỉ/chuyển kho nội bộ..., CHƯA XÁC ĐỊNH nghĩa chính
-- xác). STATUS đọc THẲNG từ STRANS (không cần JOIN TRANSHDR).
CREATE OR ALTER VIEW V_HCRC_DOANHTHU_CHINHANH AS
SELECT
    d.STK_ID, CAST(d.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.QTY ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.AMOUNT + d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.AMOUNT + d.SURPLUS ELSE 0 END) AS doanhThu,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.VAT_AMT ELSE 0 END) AS TienVAT,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.DISCOUNT ELSE 0 END) AS TienGiamGia,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.COMM_AMT ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.COMM_AMT ELSE 0 END) AS HoaHong,
    SUM(CASE WHEN d.TRANS_CODE IN ('211','221','232') THEN d.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN d.TRANS_CODE IN ('212','222') THEN d.SURPLUS ELSE 0 END) AS laiGop,
    MAX(s.DIMENSION) AS dienTich,
    MAX(CASE WHEN s.TYPE = '01' THEN 'MART'
             WHEN s.TYPE = '02' THEN 'MINIMART'
             ELSE s.TYPE END) AS chain
FROM STRANS d
JOIN STOCK s ON s.STK_ID = d.STK_ID
WHERE d.STATUS <> 'D' -- 'D' = Huỷ; cột có sẵn trong STRANS, không cần JOIN TRANSHDR
  AND d.TRANS_CODE IN ('211','221','232','212','222')
GROUP BY d.STK_ID, CAST(d.TRAN_DATE AS DATE);
GO

-- VIEW 2: Số giao dịch, gộp theo (chi nhánh, ngày) — BU_ID có sẵn TRỰC TIẾP
-- trong STRANS (không cần TRANSHDR), đếm SoGiaoDich = COUNT(DISTINCT
-- TRANS_NUM) thay vì COUNT(*) dòng header — cùng lọc TRANS_CODE/trừ trả
-- hàng như VIEW 1. BU_ID GIỮ NGUYÊN ĐẦY ĐỦ (KHÔNG rút gọn LEFT(BU_ID,3))
-- làm EntityCode, khớp đúng etl.DiemStkMapping.MaDiem như trước giờ.
CREATE OR ALTER VIEW V_HCRC_GIAODICH_CHINHANH AS
SELECT BU_ID, CAST(TRAN_DATE AS DATE) AS TRAN_DATE,
    COUNT(DISTINCT CASE WHEN TRANS_CODE IN ('211','221','232') THEN TRANS_NUM ELSE NULL END)
      - COUNT(DISTINCT CASE WHEN TRANS_CODE IN ('212','222') THEN TRANS_NUM ELSE NULL END) AS SoGiaoDich,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN AMOUNT + SURPLUS ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN AMOUNT + SURPLUS ELSE 0 END) AS TongTien,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN DISCOUNT ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN DISCOUNT ELSE 0 END) AS TongGiamGia,
    SUM(CASE WHEN TRANS_CODE IN ('211','221','232') THEN VAT_AMT ELSE 0 END)
      - SUM(CASE WHEN TRANS_CODE IN ('212','222') THEN VAT_AMT ELSE 0 END) AS TongVAT
FROM STRANS
WHERE STATUS <> 'D' -- 'D' = Huỷ
  AND TRANS_CODE IN ('211','221','232','212','222')
GROUP BY BU_ID, CAST(TRAN_DATE AS DATE);
GO
```

Không có dòng lỗi đỏ ở khung kết quả là thành công. Kiểm tra: mở rộng CSDL
đó → mục Views → thấy đủ `V_HCRC_DOANHTHU_CHINHANH` và
`V_HCRC_GIAODICH_CHINHANH`.

## Bước 2+3 — Khai "Nguồn dữ liệu" + tạo Sync Job Live cho từng cửa hàng

Mỗi cửa hàng cần 1 "Nguồn dữ liệu" (Server/Port/Database/Username/Password
trỏ ĐÚNG CSDL DSMART16 tại cửa hàng đó) + **2 Sync Job** (Doanh thu + Giao
dịch), TargetDomain = `doanhthu_chinhanh_thanhvien`/`giaodich_chinhanh_thanhvien`.
4 cách, dùng xen kẽ tuỳ ý:

1. **Script tự động (MỚI, bản 8.15 — khuyên dùng, nhanh nhất cho cả 35
   cửa hàng)**:
   ```
   cd etl
   node scripts/seedThanhVienLiveSync.js
   ```
   Mở file `etl/scripts/seedThanhVienLiveSync.js`, sửa mảng `STORES` ở đầu
   file (35 dòng, mỗi dòng 3 giá trị `name`/`server`/`password` — tên cửa
   hàng thật, IP/tên máy chủ SQL Server thật, mật khẩu tài khoản
   `etl_reader` thật; `Username` đã CỐ ĐỊNH `etl_reader` cho cả 35 dòng,
   không cần sửa), lưu file, rồi chạy lệnh trên — script tự tạo/cập nhật
   ĐỦ 35 Nguồn dữ liệu + tối đa 70 Sync Job trong 1 lượt chạy (idempotent,
   an toàn chạy lại nhiều lần khi cần sửa thêm cửa hàng). Cửa hàng nào
   chưa kết nối được (IP sai/mạng chưa mở/VIEW Bước 1 chưa tạo) vẫn được
   tạo Nguồn dữ liệu nhưng BỊ BỎ QUA tạo Sync Job — script in rõ danh sách
   bị bỏ qua kèm lý do, sửa lại rồi chạy lại file (không ảnh hưởng các cửa
   hàng đã thành công).
2. **Tạo tay** — form ở trang "Nguồn dữ liệu" rồi form "Thêm đồng bộ mới"
   (trang "Đồng bộ"), từng cửa hàng một.
3. **Nhập hàng loạt qua Excel** (Nguồn dữ liệu: có sẵn trước bản 8.13;
   Sync Job: mới ở bản 8.13) — dùng khi muốn chỉnh sửa hàng loạt qua bảng
   tính thay vì sửa trong code. Cả 2 trang đều có nút **"Tải file mẫu"**
   (MỚI, bản 8.17) ngay cạnh ô chọn file — file mẫu Sync Job đã điền sẵn 2
   dòng ví dụ ĐÚNG khuôn báo cáo Thành viên (chỉ cần đổi `Name`/
   `DataSourceName` theo từng cửa hàng), khỏi tự gõ lại cột. Nguồn dữ liệu —
   cột bắt buộc `Name, Server, DatabaseName, Username, Password`, cột tuỳ
   chọn `Engine` (mặc định `mssql`), `Port`, `Encrypt`, `TrustServerCert`.
   Sync Job — cột bắt buộc `Name, DataSourceName, TargetDomain,
   SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn`, cột
   tuỳ chọn `DimensionColumns, MeasureColumns` (nhiều cột cách nhau bằng
   dấu phẩy), `CronExpression`, `KeepHistory`, `IsActive`; `DataSourceName`
   phải KHỚP đúng Tên nguồn. File Nguồn dữ liệu chứa mật khẩu THẬT dạng chữ
   thường — xoá khỏi máy sau khi nhập xong.
4. **Xuất/Nhập file mã hoá** (MỚI, bản 8.13, riêng cho Nguồn dữ liệu) —
   nút "Xuất file mã hoá" tải về TOÀN BỘ danh sách Nguồn dữ liệu hiện có
   dưới dạng 1 file `.hcrcenc` KHÔNG đọc được bằng bất kỳ công cụ nào (kể
   cả Excel) — chỉ chính hệ thống này (giữ khoá `ETL_ENCRYPTION_KEY`) giải
   mã + nhập lại được. Dùng để sao lưu/di chuyển cấu hình kết nối 35 cửa
   hàng mà KHÔNG lộ mật khẩu thật ở bất kỳ bước nào.

**Mẫu cấu hình mỗi cặp Sync Job** (script ở cách 1 đã tự điền sẵn, chỉ ghi
lại đây để đối chiếu khi dùng cách 2/3):

| Cột | Job Doanh thu | Job Giao dịch |
|---|---|---|
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
chồng lấn, dù `jobs/scheduler.js` đã tự chặn 2 lượt cùng job chạy chồng —
sửa `LIVE_CRON` ở đầu `seedThanhVienLiveSync.js` nếu dùng cách 1).

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

## Bước 6 — Gán quyền xem

Script ở Bước 5 KHÔNG tự gán quyền (đúng quy ước hiện có, xem đầu file
`seedLdtdHcrcReports.js`). 2 cách:

1. **Script tự động (MỚI, bản 8.15 — khuyên dùng)**:
   ```
   cd rp-server
   node scripts/seedThanhVienReportPermissions.js
   ```
   Copy NGUYÊN VẸN danh sách vai trò đang được xem 2 báo cáo gốc
   (`bc-doanh-thu-hcrc`/`bc-doanh-thu-ldtd`) sang 2 báo cáo "Thành viên"
   tương ứng — không cần vào giao diện bấm tay lại. An toàn chạy lại nhiều
   lần. Hiệu lực trong tối đa 60 giây (cache quyền), không cần khởi động
   lại rp-server.
2. **Tay** (rp-user → Hệ thống → Phân quyền) — nếu muốn gán KHÁC với 2 báo
   cáo gốc (vd nhóm người dùng xem "Thành viên" không hoàn toàn trùng nhóm
   xem báo cáo gốc), chỉnh trực tiếp qua giao diện như bình thường.

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
