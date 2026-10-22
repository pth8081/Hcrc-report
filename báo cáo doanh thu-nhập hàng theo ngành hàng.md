# Báo cáo Doanh thu theo ngành hàng / Nhập hàng theo ngành hàng

Tài liệu tham chiếu chính thức cho 3 báo cáo — **đọc file này TRƯỚC khi sửa
bất kỳ logic nào liên quan** (`rp-server/scripts/seedNganhHangReports.js`,
`rp-server/lib/nganhHangBrgRunner.js`, `etl/scripts/seedNganhHangSync.js`,
`etl/lib/salesTargetsImport.js` phần "generic" shape), cùng quy ước với
"báo cáo doanh thu cuối ngày.md"/"bc-don-dat-hang.md":

| ReportId | Tiêu đề | SourceType | Domain Chỉ tiêu riêng |
|---|---|---|---|
| `bc-doanh-thu-nganhhang` | Báo cáo doanh thu theo ngành hàng | `nganhHangBrg` | `sales-targets-nganhhang-dt` |
| `bc-doanh-thu-nganhhang-ldtd` | Báo cáo doanh thu theo ngành hàng (LDTD) | `nganhHangBrg` | `sales-targets-nganhhang-dt-ldtd` |
| `bc-nhap-hang-nganhhang` | Báo cáo nhập hàng theo ngành hàng | `composite` | `sales-targets-nganhhang-nh` |

**Lịch sử quan trọng (bản 9.63 → 9.67, theo yêu cầu người dùng)**: bản 9.63
ban đầu định dựng 1 báo cáo THỨ 3 riêng "(BRGMART)" cho định dạng mới (3
khối + Lãi gộp + hàng hỏng hủy) — người dùng yêu cầu sửa lại ngay ("đừng
tách bc nhé... cần bạn cập nhật hai báo cáo này thôi"): định dạng mới áp
dụng TRỰC TIẾP cho 2 báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" ĐÃ CÓ,
mỗi báo cáo GIỮ NGUYÊN domain Chỉ tiêu riêng của nó (KHÔNG gộp chung, KHÔNG
tạo domain Chỉ tiêu "BRGMART" riêng nào khác) — xem mục 5/6. Báo cáo "Nhập
hàng theo ngành hàng" KHÔNG đổi gì (không có khái niệm Lãi gộp/hàng hỏng
hủy cho nhập hàng).

**Lịch sử quan trọng (bản 9.68, theo yêu cầu người dùng)**: thêm Bán lẻ/
Bán buôn (TRANS_CODE 211/212/221/222 — "Bạn xử lý tiếp báo cáo doanh thu
theo ngành hàng ldtd và hcrc đi nhé") + "Giá trị hàng hỏng hủy" (TRANS_CODE
318) cho 2 báo cáo DOANH THU — GIẢI QUYẾT HẲN mục 8 cũ (🔴 BLOCKED ở bản
9.63-9.67, "chưa có nguồn dữ liệu"): hàng hỏng hủy hoá ra CÙNG nguồn
`STRANS`/VIEW `V_HCRC_DOANHTHU_NGANHHANG` với doanh thu — KHÔNG CẦN domain/
job riêng (`hanghonghuy_nganhhang`/`seedHangHongHuySync.js` đã XOÁ), và vì
có `STK_ID` nên giờ hiện được ở CẢ 3 khối BRG/LFL/NSO (trước chỉ BRG). Cột
"Khối" ĐỔI từ 1 CỘT thường sang 1 DÒNG TIÊU ĐỀ NGANG merge hết cột
(`__isSectionHeader` — tính năng MỚI, opt-in, thêm vào DataTable.jsx/
exportExcel.js/exportPdf.js dùng chung nhưng KHÔNG ảnh hưởng báo cáo nào
khác chưa dùng cờ này) — theo đúng góp ý người dùng. Xem mục 1/2/5/8 MỚI.

## 1. Yêu cầu nghiệp vụ (đã chốt qua nhiều vòng trao đổi với người dùng)

1. **Mỗi dòng LUÔN là 1 ngành hàng** — khác hẳn báo cáo doanh thu/nhập hàng
   theo chi nhánh (mỗi dòng là 1 siêu thị). Không có khái niệm "dòng =
   siêu thị + ngành hàng".
2. **Danh mục 12 ngành hàng CỐ ĐỊNH, mã tăng dần** (áp dụng cho 2 báo cáo
   DOANH THU — bản 9.63/9.67, theo đúng mẫu Excel `MAU_BAO_CAO_THEO_NGANH_HANG.xlsx`
   người dùng gửi, hiện ĐỦ cả 12 dòng/khối dù ngành hàng đó không phát sinh
   dữ liệu trong kỳ):

   | Mã | Tên |
   |---|---|
   | 1001 | UltraFresh |
   | 1002 | Fresh |
   | 2001 | Bánh kẹo sữa thạch |
   | 2002 | Đồ uống, thuốc lá |
   | 2003 | Thực phẩm công nghệ |
   | 2004 | Nông sản, bột các loại |
   | 2005 | Mỹ phẩm (Cosmetic) |
   | 2006 | Hóa phẩm (Chemical) |
   | 2007 | Giấy và bông (Tissue and diaper) |
   | 3001 | Quần áo, giày dép, bông vải sợi |
   | 3002 | Gia dụng, VPP, đồ chơi |
   | 3003 | Other Nonfood |

   Báo cáo "Nhập hàng theo ngành hàng" KHÔNG áp dụng danh mục cố định này —
   vẫn tự xếp theo dữ liệu thực tế như trước (không đổi).
3. **2 báo cáo DOANH THU chia 3 KHỐI lặp lại cho CÙNG 12 ngành hàng**
   (bản 9.63/9.67): "Toàn hệ thống BRG" (cộng dồn mọi siêu thị) / "LFL"
   ("Like For Like", siêu thị ỔN ĐỊNH) / "NSO" ("New Store Opening", siêu
   thị MỚI MỞ — xem mục 7). Mỗi khối mở đầu bằng **1 DÒNG TIÊU ĐỀ NGANG
   merge hết cột** (bản 9.68, theo yêu cầu người dùng — "Chỗ khối phải quy
   ngang trên dòng đầu tiên của khối và cover all cột theo kiểu merge lại
   thành 1 dòng") + kết bằng 1 dòng "Tổng cộng ..." tô đậm — KHÔNG CÒN là
   1 CỘT "Khối" thường như bản 9.63/9.67 (lúc đó hạ tầng bảng/Excel/PDF
   dùng chung chưa hỗ trợ dòng tiêu đề gộp ngang trong thân bảng — bản 9.68
   THÊM tính năng này qua cờ `__isSectionHeader`, opt-in, không ảnh hưởng
   báo cáo nào khác chưa dùng cờ — xem mục 5). Báo cáo "Nhập hàng theo
   ngành hàng" KHÔNG chia khối — vẫn 1 dòng/ngành hàng phẳng như trước.
4. **Bộ lọc "Chi nhánh" tuỳ chọn** (Báo cáo "Nhập hàng theo ngành hàng" —
   giữ nguyên cơ chế cũ) — không chọn gì = cộng dồn TOÀN HỆ THỐNG (mọi siêu
   thị); chọn 1/vài siêu thị = chỉ cộng dồn đúng (các) siêu thị đó, vẫn ra
   đúng 1 dòng/ngành hàng. 2 báo cáo DOANH THU (định dạng mới) KHÔNG còn bộ
   lọc này — khối "LFL"/"NSO" đã tự động phân theo siêu thị rồi.
5. **Chỉ tiêu nhập THEO TOÀN CÔNG TY** — 1 con số/ngành hàng/tháng, KHÔNG
   tách theo chi nhánh (khác chỉ tiêu LDTD/HCRC vốn theo từng siêu thị).
   Chọn bộ lọc "Chi nhánh" ở báo cáo "Nhập hàng theo ngành hàng" KHÔNG làm
   thay đổi cột "Chỉ tiêu" — chỉ thay đổi cột "Thực đạt"/"Thực nhập" (cộng
   dồn đúng phạm vi đã chọn).
6. **2 báo cáo DOANH THU thêm cụm "Lãi gộp"** (bản 9.63/9.67, SỬA LẠI bản
   9.68) — "Tỷ lệ" (= Giá trị lãi gộp ÷ **Doanh thu cuối** × 100, ÁP DỤNG
   CẢ 3 KHỐI từ bản 9.68 — trước đây CHỈ khối "Toàn hệ thống BRG" vì hàng
   hỏng hủy khi đó chỉ có ở khối đó), "Giá trị" (bản 9.68: ĐÃ TRỪ giá trị
   hàng hỏng hủy — trước đây lấy thẳng KHÔNG trừ), "% so chỉ tiêu", "% so
   cùng kỳ năm trước" — xem công thức đầy đủ ở mục 5.
7. **Bán lẻ/Bán buôn** (bản 9.68, theo yêu cầu người dùng — TRANS_CODE
   211/212=Bán buôn/Trả bán buôn, 221/222=Bán lẻ/Trả bán lẻ) — MỖI 1 trong
   8 chỉ số (4 Doanh thu + 4 Lãi gộp) có 3 CỘT CON "Total"/"Bán lẻ"/"Bán
   buôn" (đúng cấu trúc file mẫu Excel gốc) — xem mục 5 công thức đầy đủ +
   2 giả định đã nêu với người dùng (mã 232 chỉ cộng "Total"; "Chỉ tiêu"
   không tách kênh).
8. **"Giá trị hàng hỏng hủy"** (TRANS_CODE 318, bản 9.63 → GIẢI QUYẾT bản
   9.68) — hiện ở CẢ 3 khối BRG/LFL/NSO (trước đây CHỈ "Toàn hệ thống BRG",
   vì nguồn khi đó không có `STK_ID`) — dùng để tính "Doanh thu cuối"
   (NGẦM, không hiện cột riêng — đúng file mẫu gốc không có cột này) và trừ
   trực tiếp vào "Lãi gộp — Giá trị" kênh "Bán lẻ" (xem mục 5/8 MỚI).
9. **LFL/NSO** phân loại qua trang khai báo "Siêu thị NSO" (mục 7) — mã
   Điểm KHÔNG khai (hoặc đang "Khoá") MẶC ĐỊNH tính là LFL. Danh sách NÀY
   DÙNG CHUNG cho CẢ 2 báo cáo doanh thu (KHÔNG tách riêng theo báo cáo —
   theo yêu cầu người dùng bản 9.67).
10. Phase 1 chỉ làm cho **hệ gốc/trung tâm** (domain `doanhthu_nganhhang`/
   `nhaphang_nganhhang`, đọc trực tiếp CSDL DSMART16 trung tâm) — CHƯA làm
   bản "(Thành viên)" 34 cửa hàng riêng.

## 2. Nguồn dữ liệu DSMART16

Xác nhận qua SQL thật (không đoán):

- **Doanh thu theo ngành hàng** — cùng công thức VIEW
  `V_HCRC_DOANHTHU_CHINHANH` đã chốt (STRANS, TRANS_CODE
  `211/221/232`=bán, `212/222`=trả hàng, `STATUS<>'D'`, doanh thu =
  `AMOUNT+SURPLUS`, lãi gộp = `SURPLUS`), CHỈ GỘP THÊM theo ngành hàng
  (`SKU_DEF.DEPT_ID` → `DEPTLIST.DEPT_NAME_U`, cột Unicode tránh lỗi font —
  cùng pattern đã sửa cho `SUPP_NAME`/`SUPP_NAME_U` ở bc-don-dat-hang.md).
  View này ĐÃ sẵn `STK_ID` (dimension, cho phép tách LFL/NSO theo siêu thị
  ở 2 báo cáo doanh thu — mục 5) và `LaiGop` (giá trị lãi gộp tuyệt đối)
  ngay từ khi tạo ở bản 9.41, KHÔNG cần đồng bộ mới cho cụm Lãi gộp.
- **Bán lẻ/Bán buôn/Hàng hỏng hủy** (bản 9.68, theo yêu cầu người dùng —
  "Bảng trans có cột trans_code để phân biệt bán buôn và bán lẻ. Bán buôn
  là mã 211, trả lại bán buôn 212 và bán lẻ mã 221, trả lại bán lẻ 222,
  hỏng hủy ở giao dịch 318 cũng cột trans_code"): CÙNG `STRANS`/
  `V_HCRC_DOANHTHU_NGANHHANG`, THÊM 5 cột `DoanhThuBanLe`/`DoanhThuBanBuon`/
  `LaiGopBanLe`/`LaiGopBanBuon`/`GiaTriHongHuy` — xem SQL đầy đủ bên dưới.
  GIẢI QUYẾT hẳn mục 8 cũ (trước đây 🔴 BLOCKED, tưởng cần nguồn/VIEW riêng
  `V_HCRC_HANGHONGHUY_NGANHHANG` — hoá ra KHÔNG CẦN, cùng nguồn STRANS/
  STK_ID với doanh thu).
- **Nhập hàng theo ngành hàng** — nguồn là **`STRANS`** (KHÔNG phải
  `RV_ORDER`), `TRANS_CODE='333'`, `STATUS NOT IN ('D','E')` — ĐÃ XÁC NHẬN
  lại qua bc-don-dat-hang.md (từng giả định sai là `RV_ORDER` ở bản nháp
  đầu, đã sửa).
- Join ngành hàng: `SKU_DEF.SKU_ID` → `DEPT_ID`, `DEPTLIST.DEPT_ID` →
  `DEPT_NAME_U` (tên Unicode, KHÔNG dùng `DEPT_NAME` — cột garbled font cũ).

### VIEW Live (CSDL `DSMART16`)

```sql
CREATE OR ALTER VIEW dbo.V_HCRC_DOANHTHU_NGANHHANG AS
SELECT
    s.STK_ID + '_' + d.DEPT_ID AS MaThucThe,
    s.STK_ID, d.DEPT_ID, dl.DEPT_NAME_U AS TenNganhHang,
    CAST(s.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.QTY ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.QTY ELSE 0 END) AS SoLuongBan,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThu,
    -- Bản 9.68 — tách riêng Bán lẻ (221/222) / Bán buôn (211/212). Mã 232
    -- (không rõ kênh) CHỈ cộng vào "DoanhThu"/"LaiGop" (Total) ở trên,
    -- KHÔNG cộng vào 2 cột Bán lẻ/Bán buôn dưới đây (giả định đã nêu với
    -- người dùng, đang để ngỏ nếu 232 thực ra thuộc 1 trong 2 kênh).
    SUM(CASE WHEN s.TRANS_CODE = '221' THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '222' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThuBanLe,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.AMOUNT + s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS DoanhThuBanBuon,
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.SURPLUS ELSE 0 END) AS LaiGop,
    SUM(CASE WHEN s.TRANS_CODE = '221' THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '222' THEN s.SURPLUS ELSE 0 END) AS LaiGopBanLe,
    SUM(CASE WHEN s.TRANS_CODE = '211' THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE = '212' THEN s.SURPLUS ELSE 0 END) AS LaiGopBanBuon,
    -- "Giá trị hàng hỏng hủy" (TRANS_CODE 318) — KHÔNG trừ trả hàng (không
    -- có mã "trả hàng hỏng hủy" riêng); GIẢ ĐỊNH cùng công thức AMOUNT+
    -- SURPLUS như các mã khác (chưa có xác nhận riêng của DBA về ý nghĩa 2
    -- cột này cho giao dịch 318 — báo lại nếu số ra sai với thực tế).
    SUM(CASE WHEN s.TRANS_CODE = '318' THEN s.AMOUNT + s.SURPLUS ELSE 0 END) AS GiaTriHongHuy
FROM dbo.STRANS s
JOIN dbo.SKU_DEF d ON d.SKU_ID = s.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = d.DEPT_ID
WHERE s.STATUS <> 'D' AND s.TRANS_CODE IN ('211','221','232','212','222','318')
GROUP BY s.STK_ID, d.DEPT_ID, dl.DEPT_NAME_U, CAST(s.TRAN_DATE AS DATE);

CREATE OR ALTER VIEW dbo.V_HCRC_NHAPHANG_NGANHHANG AS
SELECT
    m.STK_ID + '_' + d.DEPT_ID AS MaThucThe,
    m.STK_ID, d.DEPT_ID, dl.DEPT_NAME_U AS TenNganhHang,
    CAST(m.TRAN_DATE AS DATE) AS WORK_DATE,
    SUM(m.QTY) AS SoLuongNhap, SUM(m.AMOUNT) AS GiaTriNhap
FROM dbo.STRANS m
JOIN dbo.SKU_DEF d ON d.SKU_ID = m.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = d.DEPT_ID
WHERE m.TRANS_CODE = '333' AND m.STATUS NOT IN ('D','E')
GROUP BY m.STK_ID, d.DEPT_ID, dl.DEPT_NAME_U, CAST(m.TRAN_DATE AS DATE);
```

Đã chạy thật, kết quả hợp lý (danh mục ngành hàng gặp thật: Thực phẩm
tươi, Hoá phẩm, Tạp hoá, Đồ uống/Thuốc lá, Mỹ phẩm, Hoá chất, Giấy vệ
sinh, Nông sản, Gia dụng, Thời trang, Phi thực phẩm khác, Vận chuyển).

### VIEW Lịch sử (CSDL `DSMART16_EOM`)

`SKU_DEF`/`DEPTLIST` **KHÔNG có** trên `DSMART16_EOM` (xác nhận qua
`INFORMATION_SCHEMA.TABLES`, kết quả rỗng) — mirror kỹ thuật "Script B"
(báo cáo doanh thu cuối ngày.md) + VIEW Đơn đặt hàng Lịch sử: UNION ALL
toàn bộ bảng `STRANS_YYYYMM`/`STRANS_EOM` (sinh SQL tự động từ
`sys.tables`), JOIN CHÉO `DSMART16.dbo.SKU_DEF`/`DEPTLIST` (cùng 1 SQL
Server instance, có tiền lệ hoạt động thật với `STOCK`/`SUPPLIER`). Xem
file đầy đủ: `deploy/Thiết lập VIEW Doanh thu-Nhập hàng theo Ngành hàng
Lịch sử (DSMART16_EOM).sql`.

## 3. Đồng bộ (ETL)

`etl/scripts/seedNganhHangSync.js` — tạo/cập nhật 2 (hoặc 4 với
`--with-history`) job đồng bộ, domain MỚI hoàn toàn
(`doanhthu_nganhhang`/`nhaphang_nganhhang`), KHÔNG đụng domain
`doanhthu_chinhanh` hiện có:

```
node etl/scripts/seedNganhHangSync.js                  # 2 job Live
node etl/scripts/seedNganhHangSync.js --with-history    # + 2 job Lịch sử (sau khi đã chạy VIEW Lịch sử)
```

Tái dùng NGUYÊN VẸN 2 "Nguồn dữ liệu" đã có sẵn từ
`seedLdtdHcrcSync.js` ("DSMART16 - Live"/"DSMART16 - Lịch sử") — không tạo
nguồn dữ liệu mới.

**"Giá trị hàng hỏng hủy" + Bán lẻ/Bán buôn** (bản 9.63 → GIẢI QUYẾT bản
9.68) — KHÔNG CÒN domain/job riêng (`hanghonghuy_nganhhang`/
`seedHangHongHuySync.js` đã XOÁ bỏ) — GỘP LUÔN vào `measureColumns` của 2
job doanh thu ở trên (`DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGopBanLe`/
`LaiGopBanBuon`/`GiaTriHongHuy`, xem mục 2), vì cùng 1 VIEW nguồn — chạy
LẠI `seedNganhHangSync.js` (không cần script riêng nào khác) sau khi VIEW
đã có đủ cột mới là tự đồng bộ đủ cả hàng hỏng hủy lẫn Bán lẻ/Bán buôn.

## 4. Chỉ tiêu "theo toàn công ty"

Khác hẳn chỉ tiêu LDTD/HCRC (theo từng siêu thị, `EntityCode = MaSieuThi`)
— chỉ tiêu ngành hàng dùng `EntityCode = MaNganhHang` (= `DEPT_ID`),
**KHÔNG tách chi nhánh**. Cơ chế nhập (xem
`etl/lib/salesTargetsImport.js:parseGenericShape()`): file Excel shape
"generic" — để **TRỐNG** `MaSieuThi`, CHỈ điền `MaNganhHang` = chỉ tiêu
theo toàn công ty cho đúng ngành hàng đó.

**Bản 9.73** (theo yêu cầu người dùng — "tách chỉ tiêu bán buôn, bán lẻ
... không cần mã siêu thị đâu") — RIÊNG 2 domain **Chỉ tiêu Doanh thu
theo ngành hàng**/**(LDTD)** dưới đây: file mẫu/nhập/xuất **BỎ HẲN cột
`MaSieuThi`** (không chỉ để trống — domain này LUÔN "theo toàn công ty",
không bao giờ có khái niệm siêu thị), và `ChiTieuDoanhThu`/`ChiTieuLaiGop`
(1 số Total duy nhất) **TÁCH thành 2 cột mỗi bên**
(`ChiTieuDoanhThuBanLe`/`BanBuon`, `ChiTieuLaiGopBanLe`/`BanBuon`) — cột
"Total" trên báo cáo (`lib/nganhHangBrgRunner.js`) tự CỘNG 2 cột lại,
không nhập riêng. Cơ chế opt-in qua tham số `genericNoStoreCode=true`
truyền vào `createSalesTargetsRouter(...)` (xem `etl/server.js`) —
`matchShape()`/`parseGenericShape()` giờ nhận dạng ĐƯỢC CẢ file có
`MaSieuThi` (hành vi cũ, domain Nhập hàng vẫn dùng) LẪN file CHỈ có
`Thang`+`MaNganhHang` (domain này, không có cột `MaSieuThi` nào cả).
Domain **Chỉ tiêu Nhập hàng theo ngành hàng** (`sales-targets-nganhhang-nh`)
**KHÔNG đổi** — vẫn giữ cột `MaSieuThi` (để trống) + `ChiTieuGiaTriNhap`
1 cột duy nhất như cũ, không có yêu cầu tách Bán lẻ/Bán buôn cho nhập hàng.

**Bản 9.89** (theo yêu cầu người dùng — tách thêm chỉ tiêu theo khối Toàn
hệ thống BRG/LFL/NSO, KHÔNG dùng chung 1 bộ 4 cột Total cho cả 3 khối như
trước) — 4 cột ở trên GIỜ LÀ chỉ tiêu khối "Toàn hệ thống BRG" (Total)
riêng, thêm 8 cột MỚI hậu tố `_LFL`/`_NSO` cho 2 khối còn lại (tổng 12
cột) — xem mục 12 bên dưới.

3 trang etl-admin (router `createSalesTargetsRouter(..., shape='generic', genericTargetColumns, genericNoStoreCode)`):

- **Chỉ tiêu Doanh thu theo ngành hàng** (`/sales-targets-nganhhang-dt`,
  domain `sales-targets-nganhhang-dt`, cột `ChiTieuDoanhThuBanLe`/
  `ChiTieuDoanhThuBanBuon` + `ChiTieuLaiGopBanLe`/`ChiTieuLaiGopBanBuon`
  — bản 9.73, xem trên; `genericNoStoreCode=true`).
- **Chỉ tiêu Doanh thu theo ngành hàng (LDTD)** (`/sales-targets-nganhhang-dt-ldtd`,
  domain `sales-targets-nganhhang-dt-ldtd`, cùng 4 cột trên — trang RIÊNG
  của đội Lãnh đạo Tập đoàn, KHÔNG ghi đè Chỉ tiêu của trang trên).
- **Chỉ tiêu Nhập hàng theo ngành hàng** (`/sales-targets-nganhhang-nh`,
  domain `sales-targets-nganhhang-nh`, cột `ChiTieuGiaTriNhap` — KHÔNG đổi,
  vẫn còn cột `MaSieuThi`, `genericNoStoreCode` mặc định `false`).

KHÔNG đối chiếu `findUnknownEntityCodes` (actualDataDomain bỏ trống) — mã
ngành hàng (`DEPT_ID`) khác hẳn granularity entityCode của domain thực đạt
(`<STK_ID>_<DEPT_ID>`), so khớp chuỗi CHÍNH XÁC ở đây sẽ báo sai cho MỌI
dòng.

## 5. Cơ chế tính — 2 báo cáo DOANH THU (`SourceType='nganhHangBrg'`, bản 9.63/9.67/9.68)

Dedicated runner `rp-server/lib/nganhHangBrgRunner.js` (mirror
`lib/purchaseOrderRunner.js`) — KHÔNG dùng `SourceType='composite'` vì hình
dạng đặc thù (nhân 3 khối cho CÙNG 1 lần đọc domain, điều cơ chế composite
(mục "Cơ chế ghép" bên dưới, vẫn dùng cho "Nhập hàng theo ngành hàng")
không hỗ trợ sẵn). Tái dùng các hàm đọc/gộp `dwh.ReportFacts` đã có
(`fetchAllReportRows`, `remapEntityCode`, `aggregateDailyRowsByEntity`,
`resolveRequestedRange` — lộ thêm từ `compositeReportRunner.js`, additive,
không đổi báo cáo khác).

**`targetDomain` đọc từ `definition.targetDomain`** (KHÔNG hardcode trong
runner) — MỖI ReportId trỏ đúng domain Chỉ tiêu RIÊNG của nó (bảng đầu
file). Thiếu `targetDomain` trong `DefinitionJson` → runner throw lỗi rõ
ràng ngay, không âm thầm chạy sai.

**Luồng xử lý mỗi lần chạy**:

1. Đọc `doanhthu_nganhhang` 2 lần (kỳ hiện tại + cùng kỳ năm trước, dịch
   đúng 1 năm) — CHỈ 1 domain, Bán lẻ/Bán buôn/hàng hỏng hủy đã nằm SẴN
   trong đó từ bản 9.68 (KHÔNG còn fetch thêm domain `hanghonghuy_nganhhang`
   riêng nữa như bản 9.63/9.67).
2. Tra `targetMap` theo `MaNganhHang`, từ ĐÚNG `targetDomain` của báo cáo
   đang chạy.
3. Với MỖI `STK_ID` xuất hiện trong dữ liệu — phân loại LFL/NSO (mục 7),
   gộp vào 1 trong 2 tập `lflStkIds`/`nsoStkIds`.
4. Với MỖI khối (BRG = không lọc, LFL = lọc theo `lflStkIds`, NSO = lọc
   theo `nsoStkIds`) — gộp dữ liệu theo `DEPT_ID`, PUSH 1 dòng
   `__isSectionHeader` (tiêu đề ngang mở đầu khối) + 1 dòng/ngành hàng
   ĐÃ CÓ Chỉ tiêu trong kỳ đang xem (bản 9.77, xem dưới — KHÔNG còn cố
   định đủ 12 dòng) + 1 dòng "Tổng cộng" (`__isSubtotal`).

**Bản 9.77** (theo yêu cầu người dùng — "up ngành hàng nào chỉ hiện ra
được báo cáo ngành hàng đó"): DANH SÁCH 12 ngành hàng ở `NGANH_HANG_LIST`
(`rp-server/lib/nganhHangBrgRunner.js`) là danh mục ĐẦY ĐỦ tối đa, nhưng
MỖI LẦN CHẠY báo cáo chỉ hiện dòng cho ngành hàng NÀO ĐÃ CÓ Chỉ tiêu nhập
trong ĐÚNG kỳ/khoảng ngày đang xem — lọc bằng
`NGANH_HANG_LIST.filter(item => targetMap.has(item.code))` (`targetMap`
dựng từ `runSalesTargetsBlockRange()`, ĐÃ cộng dồn theo `entityCode` cho
khoảng `[fromPeriod, toPeriod]` của kỳ báo cáo). Ngành hàng CHƯA nhập
Chỉ tiêu trong kỳ đó — dù CÓ phát sinh doanh thu thật trong
`doanhthu_nganhhang` — sẽ KHÔNG có dòng riêng VÀ KHÔNG cộng vào dòng
"Tổng cộng" mỗi khối (Tổng cộng = tổng CHỈ các dòng ĐANG hiển thị, để
luôn khớp đúng số cộng người xem thấy trên báo cáo — KHÔNG phải tổng
doanh thu toàn công ty nếu có ngành hàng còn thiếu Chỉ tiêu). Áp dụng
ĐỒNG NHẤT cả 3 khối BRG/LFL/NSO (dùng CHUNG 1 `targetMap`, không phân
biệt theo khối). Muốn 1 ngành hàng hiện trong báo cáo — chỉ cần nhập ÍT
NHẤT 1 trong 4 cột Chỉ tiêu (Bán lẻ/Bán buôn của Doanh thu hoặc Lãi gộp)
cho đúng ngành hàng đó, đúng kỳ (tháng) nằm trong khoảng ngày đang xem
(xem `etl/lib/salesTargetsImport.js`/trang "Chỉ tiêu theo ngành hàng" ở
etl-admin).

**Công thức từng cột** — bản 9.68, SỬA LẠI cột "Chỉ tiêu" ở bản 9.73: MỖI
1 trong 8 chỉ số (4 Doanh thu + 4 Lãi gộp) có 3 CỘT CON "Total"/"Bán lẻ"/
"Bán buôn" (đúng cấu trúc file mẫu Excel gốc, mọi tỷ lệ làm tròn 1 chữ số
thập phân; thiếu mẫu số → `null`, hiển thị "—", KHÔNG phải `0`/lỗi):

| Cột | Total | Bán lẻ | Bán buôn |
|---|---|---|---|
| Chỉ tiêu | = Bán lẻ + Bán buôn (kênh nào CHƯA nhập coi như 0 khi cộng — "có dữ liệu" khi ÍT NHẤT 1 trong 2 kênh có số, bản 9.73) | `target.ChiTieuDoanhThuBanLe` | `target.ChiTieuDoanhThuBanBuon` |
| Thực đạt | `current.measures.DoanhThu` | `current.measures.DoanhThuBanLe` | `current.measures.DoanhThuBanBuon` |
| % so chỉ tiêu | Thực đạt Total ÷ Chỉ tiêu Total × 100 | Thực đạt Bán lẻ ÷ Chỉ tiêu Bán lẻ × 100 (bản 9.73, trước đây luôn `null`) | tương tự, theo Bán buôn |
| % so cùng kỳ năm trước | Thực đạt Total ÷ Thực đạt Total cùng kỳ × 100 | Thực đạt Bán lẻ ÷ Thực đạt Bán lẻ cùng kỳ × 100 | tương tự, theo Bán buôn |
| **Giá trị hàng hỏng hủy** | = Bán lẻ + Bán buôn | `current.measures.GiaTriHongHuy` TOÀN BỘ (giả định — "bán buôn thường không có hàng hỏng hủy") | luôn `0` |
| Lãi gộp — Tỷ lệ | Lãi gộp Giá trị Total ÷ **Doanh thu cuối** (= Thực đạt Total − Giá trị hàng hỏng hủy Total) × 100 — ÁP DỤNG CẢ 3 KHỐI từ bản 9.68 | Lãi gộp Giá trị Bán lẻ ÷ Thực đạt Bán lẻ × 100 | Lãi gộp Giá trị Bán buôn ÷ Thực đạt Bán buôn × 100 |
| Lãi gộp — Giá trị | = Bán lẻ + Bán buôn (ĐÃ trừ hàng hỏng hủy — KHÁC bản 9.63/9.67 lấy thẳng KHÔNG trừ) | `current.measures.LaiGopBanLe` − Giá trị hàng hỏng hủy Bán lẻ | `current.measures.LaiGopBanBuon` − Giá trị hàng hỏng hủy Bán buôn (= không đổi, vì luôn 0) |
| Lãi gộp — % so chỉ tiêu | Lãi gộp Giá trị Total ÷ Chỉ tiêu Lãi gộp Total × 100 | Lãi gộp Giá trị Bán lẻ ÷ `target.ChiTieuLaiGopBanLe` × 100 (bản 9.73, trước đây luôn `null`) | tương tự, theo Bán buôn |
| Lãi gộp — % so cùng kỳ năm trước | Lãi gộp Giá trị Total ÷ Lãi gộp Giá trị Total cùng kỳ (đã trừ hàng hỏng hủy cùng kỳ) × 100 | tương tự, theo Bán lẻ | tương tự, theo Bán buôn |

**Cấp banner thứ 3 "Doanh thu"/"Giá trị hàng hỏng hủy"/"Lãi gộp"**
(`definition.columnSuperGroups`, bản 9.73 — theo yêu cầu người dùng, khớp
đúng 3 CẤP tiêu đề của file mẫu Excel gốc: "Doanh thu" gộp ngang 4 nhóm
con Chỉ tiêu/Thực đạt/%CT/%CK, "Lãi gộp" gộp 4 nhóm con còn lại. "Giá trị
hàng hỏng hủy" (cột MỚI THÊM bản 9.68, không có trong file mẫu gốc) —
bản 9.73 ban đầu để KHÔNG thuộc super-group nào, tạo khoảng trắng đứt
quãng giữa "Doanh thu"/"Lãi gộp"; bản 9.74 (theo phản hồi người dùng —
"merge cái dòng ở trên cho đồng bộ liền mạch... nhìn nó đẹp") đổi sang
TỰ CÓ banner riêng (`groupLabels` chỉ 1 phần tử, tự thành 1 "super-group"
của chính nó) — màu HEX riêng `8B2E2E` (không dùng tên màu `red` có sẵn,
vì tên đó trùng đúng màu nhạt của dòng nhóm con bên dưới — mất phân cấp
đậm/nhạt như 2 bên cạnh) — cơ chế dùng chung opt-in mới ở CẢ 3 nơi xuất/hiển thị
(`rp-server/lib/exportExcel.js`/`lib/exportPdf.js`/
`rp-user/src/components/DataTable.jsx`), thêm ĐÚNG 1 dòng tiêu đề MỚI phía
TRÊN dòng `columnGroups` hiện có — KHÔNG đổi báo cáo nào khác (không khai
field này thì vẽ như cũ, 2 dòng tiêu đề). `routes/reports.js`:/export VÀ
`jobs/reportEmailScheduler.js` (gửi email tự động) TRƯỚC ĐÂY chỉ đọc
`definition.columnGroups`/`standaloneColumnColors` TĨNH từ DefinitionJson
— lỗi THẬT đã gặp: báo cáo này tính 2 field đó (và `columnSuperGroups`)
ĐỘNG lúc chạy (`lib/nganhHangBrgRunner.js`, không lưu tĩnh), nên Excel/PDF
xuất ra (cả nút "Xuất" lẫn email tự động) LUÔN mất hẳn màu/3 khối
BRG-LFL-NSO dù xem trên web vẫn đúng — đã sửa đọc từ KẾT QUẢ
`runDefinition()` (ưu tiên hơn `definition.*` tĩnh, AN TOÀN cho mọi báo
cáo khác vì 2 giá trị đó LUÔN giống hệt nhau ở mọi SourceType khác).

Dòng "Tổng cộng" mỗi khối: CỘNG DỒN giá trị tuyệt đối của 12 dòng (bao gồm
3 kênh) rồi tính LẠI % từ tổng (không lấy trung bình cộng % từng dòng) —
`__isSubtotal: true`; riêng dòng Tổng cộng khối "Toàn hệ thống BRG" thêm
`__isGrandTotal: true` (tô màu đồng nhất, xem `lib/reportCellFormat.js`).

**Dòng tiêu đề ngang mở đầu mỗi khối** (`__isSectionHeader: true` +
`__sectionLabel`/`__sectionColor`) — tính năng MỚI bản 9.68 (theo yêu cầu
người dùng — "Khối phải quy ngang trên dòng đầu tiên... cover all cột
theo kiểu merge lại thành 1 dòng"): render 1 Ô duy nhất MERGE hết số cột
(`colSpan`/`mergeCells`/vẽ 1 hình chữ nhật trải hết bề rộng, tuỳ nơi
render), nền màu `__sectionColor` (hex 6 ký tự), chữ trắng đậm. Đã thêm
opt-in vào CẢ 3 nơi hiển thị/xuất dùng chung —
`rp-user/src/components/DataTable.jsx`, `rp-server/lib/exportExcel.js`,
`rp-server/lib/exportPdf.js` — và vào `lib/reportCellFormat.js`
(`computeSttValues`/`computeZebraFlags` bỏ qua dòng này, không đánh STT,
không tính vào đếm xen kẽ zebra). KHÔNG ảnh hưởng báo cáo nào khác (chỉ áp
dụng khi `row.__isSectionHeader === true`, không báo cáo nào khác đặt cờ
này).

`columnGroups`: 9 nhóm, mỗi nhóm 3 cột con Total/Bán lẻ/Bán buôn — 4 nhóm
"Doanh thu — ..." (xanh lá), 1 nhóm "Giá trị hàng hỏng hủy" (đỏ — bản 9.74
có thử đổi ngắn gọn thành "Hàng hỏng hủy" rồi ĐỔI LẠI theo yêu cầu người
dùng, giữ nguyên "Giá trị hàng hỏng hủy"), 4 nhóm "Lãi gộp — ..." (cam).
Từ bản 9.73 CÒN THÊM `columnSuperGroups` — 1 dòng tiêu đề CAO HƠN gộp
"Doanh thu" (4 nhóm Doanh thu) và "Lãi gộp" (4 nhóm Lãi gộp) — bản 9.74
THÊM "Giá trị hàng hỏng hủy" làm super-group thứ 3 (tự nó 1 nhóm, trước
đó để trống dòng này tạo khoảng trắng đứt quãng giữa "Doanh thu"/"Lãi
gộp", theo phản hồi người dùng "merge cho đồng bộ liền mạch"). Bản 9.75
(cùng phản hồi người dùng, ý tiếp theo — "total/bán lẻ/bán buôn merge
thành 2 dòng luôn") sửa tiếp: super-group CHỈ CÓ ĐÚNG 1 nhóm con (như
"Giá trị hàng hỏng hủy") GỘP LUÔN với dòng nhãn nhóm (CẤP 2) ngay bên
dưới thành 1 Ô duy nhất cao gấp đôi (`rowSpan`/merge dọc Excel, màu/chữ
TRẮNG của chính super-group) — TRƯỚC ĐÓ vẫn vẽ 2 Ô CHỒNG NHAU cùng 1 chữ
lặp lại (banner CẤP 1 riêng + nhãn nhóm CẤP 2 riêng, dù cùng 1 nội dung).
Dòng Total/Bán lẻ/Bán buôn (CẤP 3, lá) GIỮ NGUYÊN màu NHẠT của chính
nhóm, không đổi theo màu đậm của banner gộp phía trên. KHÔNG còn
`standaloneColumnColors` ("Doanh thu cuối" không còn là cột hiển thị
riêng — chỉ dùng NGẦM để tính mẫu số Tỷ lệ lãi gộp Total, đúng file mẫu
gốc không có cột này).

**2 giả định đã nêu rõ với người dùng lúc demo, CHƯA có xác nhận cuối
cùng** (nếu sai, chỉ cần sửa `rp-server/lib/nganhHangBrgRunner.js`, không
đụng VIEW/ETL):

1. Mã 232 (gộp sẵn vào Total từ trước, không rõ kênh) CHỈ cộng vào
   "Total", KHÔNG cộng vào "Bán lẻ"/"Bán buôn" — 2 cột đó có thể KHÔNG
   cộng đúng bằng Total nếu 232 khác 0 trong kỳ.
2. "Giá trị hàng hỏng hủy" GÁN HẾT cho kênh "Bán lẻ" ("bán buôn thường
   không có hàng hỏng hủy" — theo người dùng) — mã 318 không tự phân biệt
   kênh trong `STRANS`, không có cách tách thật nếu giả định này sai.

## 5b. Cơ chế ghép trong báo cáo — "Nhập hàng theo ngành hàng" (`SourceType='composite'`, KHÔNG đổi)

Entity thực đạt (domain `nhaphang_nganhhang`) ở khoá chi tiết
`<STK_ID>_<DEPT_ID>` (để LỌC được theo chi nhánh), còn chỉ tiêu ở khoá thô
`DEPT_ID`. 2 khối LỆCH khoá — cơ chế ghép-theo-entityCode thường (Map
trong `runCompositeReport()`) không tự khớp được. Giải quyết bằng
`block.remapEntityCode` — áp dụng NGAY SAU khi khối trả rows thô (TRƯỚC
bước ghép giữa các khối): lọc rows theo `filterField`/`filterValuesField`
(vd `STK_ID`/`branches` — bộ lọc "Chi nhánh" người dùng chọn), rồi gộp lại
theo `field` (vd `DEPT_ID`) thành entityCode MỚI, CỘNG DỒN measures. Xem
chú thích đầy đủ (code + lý do) ở `rp-server/lib/compositeReportRunner.js`.

## 6. Định nghĩa báo cáo

`rp-server/scripts/seedNganhHangReports.js` — cả 3 `ReportId`:

- `bc-doanh-thu-nganhhang`/`bc-doanh-thu-nganhhang-ldtd`: `SourceType =
  'nganhHangBrg'`, `DefinitionJson` CHỈ cần `title`/`exportTitle`/
  `exportFileCode`/`domain`/`targetDomain`/`filters` — cột/khối/công thức
  KHÔNG khai ở đây, runner tự khai trong code (mục 5), không đọc từ
  `DefinitionJson`.
- `bc-nhap-hang-nganhhang`: `SourceType = 'composite'`, giữ nguyên 3 khối
  `current`/`lastYear`/`target` + `columns` như trước (không đổi).

```
node rp-server/scripts/seedNganhHangReports.js [menuCode]   # mặc định reports-mua-hang
```

## 7. Siêu thị NSO — phân loại LFL/NSO cho 2 báo cáo doanh thu (bản 9.63)

Bảng `etl.NsoStores` (`etl-db/schema.sql`): `MaDiem` (NVARCHAR, UNIQUE),
`TenSieuThi` (tuỳ chọn), `IsActive`, `ImportedAt`/`ImportedBy`. Trang
etl-admin "Siêu thị NSO" (menu `nso-stores`, mirror ĐẦY ĐỦ bộ nút trang
"Ánh xạ Điểm - STK_ID": tải file mẫu, nhập Excel, sửa/thêm 1 dòng, khoá/
kích hoạt, xuất Excel, chọn nhiều + xoá hàng loạt). **DÙNG CHUNG đúng 1
danh sách cho CẢ 2 báo cáo doanh thu** (gốc + LDTD) — KHÔNG tách riêng
theo báo cáo, theo yêu cầu người dùng bản 9.67 ("mã NSO sẽ được cập nhật
chung từ file upload vào báo cáo này").

Phân loại 1 `STK_ID` cụ thể đi qua 2 bước tra cứu:

1. `STK_ID` → `MaDiem` (qua "Ánh xạ Điểm - STK_ID" đã có, dùng `MaStkMoi`
   — xem `rp-server/lib/diemStkMapping.js:buildStkIdLookup()`).
2. `MaDiem` → có trong `etl.NsoStores` (IsActive=1) không? CÓ → NSO; KHÔNG
   (hoặc `STK_ID` không tra được `MaDiem` nào) → LFL.

`etl-db/grants.sql` — `GRANT SELECT ON etl.NsoStores TO
etl_diem_stk_reader;` (đọc qua pool `ETL_DIEM_STK` của `rp-server`, cùng
cơ chế với "Ánh xạ Điểm - STK_ID" — xem `rp-server/lib/nsoStores.js`, cache
60s, lỗi kết nối trả `Set` rỗng, KHÔNG làm sập báo cáo).

## 8. "Giá trị hàng hỏng hủy" + Bán lẻ/Bán buôn — ✅ GIẢI QUYẾT bản 9.68

**Lịch sử**: mục này TỪNG 🔴 BLOCKED (bản 9.63-9.67) — lúc đó tưởng cần 1
VIEW/nguồn RIÊNG `V_HCRC_HANGHONGHUY_NGANHHANG` mà DSMART không có. Người
dùng sau đó xác nhận (18/10/2026): hàng hỏng hủy nằm NGAY TRONG `STRANS`
(TRANS_CODE **318**, cùng bảng dùng cho doanh thu) — KHÔNG CẦN VIEW/domain
riêng. CÙNG lúc, người dùng cũng cung cấp mã TRANS_CODE phân biệt Bán lẻ/
Bán buôn (**211**=Bán buôn, **212**=Trả bán buôn, **221**=Bán lẻ,
**222**=Trả bán lẻ) — gộp XỬ LÝ chung 1 lần vì cùng ảnh hưởng tới VIEW/
runner này.

**Nguồn dữ liệu** — xem công thức VIEW đầy đủ ở mục 2 (`GiaTriHongHuy`,
`DoanhThuBanLe`/`DoanhThuBanBuon`, `LaiGopBanLe`/`LaiGopBanBuon`, tất cả
trong `V_HCRC_DOANHTHU_NGANHHANG`). KHÔNG cần `NganhHang`/`NgayGhiNhan`
riêng như dự kiến cũ (mục này trước đây đoán sai hình dạng nguồn, do chưa
biết nó cùng bảng `STRANS`) — `DEPT_ID`/`STK_ID`/`WORK_DATE` đã có sẵn
trong VIEW, join/group giống hệt các cột doanh thu khác.

**2 giả định CHƯA xác nhận cuối cùng với DBA/người dùng** (đã nêu rõ ở
mục 5, lặp lại ở đây để dễ tìm):

1. Mã 232 không tách được Bán lẻ/Bán buôn — chỉ cộng vào "Total".
2. Hàng hỏng hủy (318) gán HẾT cho kênh "Bán lẻ" (bán buôn thường không
   có, theo người dùng) — mã 318 không tự phân biệt kênh.

Nếu DBA xác nhận khác (vd 318 cũng có thể thuộc Bán buôn trong 1 số
trường hợp, hoặc 232 thực ra luôn thuộc 1 kênh cố định) — CHỈ cần sửa
`rp-server/lib/nganhHangBrgRunner.js` (hàm `computeRowFields()`), KHÔNG
cần đổi VIEW/ETL.

**Việc còn lại khi deploy** (xem `deploy/Nhật ký triển khai (từ bản
8.31).md` mục 9.68 để biết đầy đủ các bước, kể cả cho server ĐÃ chạy bản
9.67 trước đó):

1. Chạy lại VIEW `V_HCRC_DOANHTHU_NGANHHANG` (mục 2) trên `DSMART16` — và
   VIEW Lịch sử (`deploy/Thiết lập VIEW Doanh thu-Nhập hàng theo Ngành
   hàng Lịch sử (DSMART16_EOM).sql`) nếu server đã có job Lịch sử.
2. Chạy lại `node etl/scripts/seedNganhHangSync.js` (và `--with-history`
   nếu có job Lịch sử) — cập nhật `MeasureColumnsJson` của 2 job doanh thu
   đã có, KHÔNG tạo job mới.
3. KHÔNG cần chạy `etl/scripts/seedHangHongHuySync.js` nữa (đã XOÁ) — nếu
   server trước đó ĐÃ tạo job/domain `hanghonghuy_nganhhang` (không có
   trong thực tế vì domain đó luôn rỗng — chưa từng chạy được), không cần
   dọn gì thêm.
4. Vào etl-admin → Đồng bộ → "Chạy thử" 2 job Live đã cập nhật, xác nhận
   đồng bộ xong không lỗi, kiểm tra vài dòng có số ở `DoanhThuBanLe`/
   `DoanhThuBanBuon`/`GiaTriHongHuy`.
5. Mở lại 2 báo cáo doanh thu — kiểm tra 24 cột giá trị mới + nhóm "Giá
   trị hàng hỏng hủy" hiện đúng số, dòng tiêu đề ngang mỗi khối hiện đúng
   (web/Excel/PDF).

## 9. "Cùng kỳ năm trước" — ĐÃ XÁC ĐỊNH VIEW Lịch sử chạy đúng, còn 1 bước

VIEW Lịch sử (mục 2) đã chạy thật trên `DSMART16_EOM`, kết quả đúng (ngày
2026-10-05 — dữ liệu quá khứ thật, tên ngành hàng Unicode đúng, số liệu hợp
lý). **KHÔNG cần sửa gì** ở `rp-server/scripts/seedNganhHangReports.js` —
cả 3 báo cáo chỉ khai `domain` (KHÔNG khai `historicalDomain`, khác báo
cáo "(Thành viên)"), vì `etl/scripts/seedNganhHangSync.js` cho CẢ 2 job
Live VÀ Lịch sử (`--with-history`) cùng ghi vào CHUNG 1 `TargetDomain`
(`doanhthu_nganhhang`/`nhaphang_nganhhang`), chỉ khác `SourceSystem` (theo
`DataSourceId`) — `dwh.ReportFacts` cho phép 2 dòng cùng entityCode+ngày
miễn khác SourceSystem, và `compositeReportRunner.js:aggregateDailyRowsByEntity()`
(tái dùng ở `nganhHangBrgRunner.js` qua `aggregateDailyRowsByEntity`) tự
khử trùng theo (entityCode, ngày) nếu có chồng lấn. Vì vậy chỉ cần `domain`
đơn thuần là đã đọc được CẢ dữ liệu Live lẫn Lịch sử.

**Việc còn lại**:

1. Chạy `node etl/scripts/seedNganhHangSync.js --with-history` trên server
   ETL thật — tạo 2 job đồng bộ "Lịch sử (DSMART16_EOM)" (script tự kiểm
   tra VIEW/cột trước khi ghi job, báo lỗi rõ nếu thiếu).
2. Vào etl-admin → Đồng bộ → "Chạy thử" 2 job Lịch sử vừa tạo, xác nhận
   đồng bộ xong không lỗi.
3. Chạy lại báo cáo (web/Excel) với 1 khoảng ngày của NĂM TRƯỚC (vd đúng
   ngày 2026-10-05 ở kết quả test trên) — xác nhận cột "% so cùng kỳ năm
   trước" đã có số.
4. Vào Hệ thống → Phân quyền gán quyền xem 3 báo cáo cho đúng vai trò.

## 10. Bán lẻ/Bán buôn chỉ đúng từ ngày deploy bản 9.68 trở đi — lỗi watermark job Live (đã có script sửa)

**Hiện tượng người dùng báo cáo (bản 9.86, xem báo cáo tháng 10/2026)**:
"Doanh thu — Thực đạt" cột **Total đúng cho CẢ THÁNG**, nhưng cột **Bán
lẻ/Bán buôn chỉ đúng như của 1-2 NGÀY gần nhất** (những ngày job Live chạy
SAU KHI VIEW đã có 5 cột mới) — các ngày đầu tháng Bán lẻ/Bán buôn gần như
= 0, khiến Bán lẻ + Bán buôn lệch xa Total (vd lệch ~6 tỷ/~6,5 tỷ Total 1
ngành hàng, không thể do riêng giả định "mã 232 không tách kênh" ở mục 8 —
giả định đó chỉ gây lệch NHỎ, không gây lệch gần hết số).

**Nguyên nhân — ĐÚNG lỗi cơ chế watermark đã gặp ở bản 8.1 cho job "Doanh
thu chi nhánh - Live" (xem `etl/scripts/resyncDoanhThuChinhanhLive.js` —
comment đầu file giải thích đầy đủ cơ chế, mirror y hệt ở đây)**:
job "Doanh thu theo ngành hàng - Live (DSMART16)" dùng `WORK_DATE` làm CẢ
`DateColumn` LẪN `UpdatedAtColumn` (xem mục 3 + `etl/scripts/seedNganhHangSync.js`),
tức câu đồng bộ là `WHERE WORK_DATE >= mốc_đã_đồng_bộ` (mốc = watermark
LƯU Ở LẦN CHẠY TRƯỚC, xem `etl/lib/tableSyncEngine.js`). `WORK_DATE` của 1
dòng nguồn KHÔNG đổi theo thời gian — nên khi VIEW `V_HCRC_DOANHTHU_NGANHHANG`
được thêm 5 cột `DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGopBanLe`/
`LaiGopBanBuon`/`GiaTriHongHuy` ở bản 9.68, watermark của job Live **đã
vượt qua** các ngày đầu tháng từ lâu (cột `DoanhThu`/Total đã đồng bộ
đúng cho các ngày đó từ VIEW CŨ) — job sẽ KHÔNG BAO GIỜ tự quét lại các
ngày đó để lấy 5 cột MỚI, dù chạy lại bao nhiêu lần/đợi bao lâu. Chỉ các
ngày có `WORK_DATE >= watermark hiện tại` (tức từ lúc job chạy lần đầu
SAU KHI VIEW đã đổi, ~ngày deploy bản 9.68 trở đi) mới có đủ 5 cột mới —
khớp đúng hiện tượng "như đang lấy Bán lẻ/Bán buôn ngày today".

**Cách sửa (CHẠY 1 LẦN, KHÔNG cần sửa code/VIEW gì thêm — VIEW và
`measureColumns` đã đúng từ bản 9.68, chỉ cần BẮT JOB QUÉT LẠI)**:

```bash
cd etl
node scripts/resyncDoanhThuNganhHangLive.js            # xem trước, KHÔNG đổi gì
node scripts/resyncDoanhThuNganhHangLive.js --confirm  # thực sự xoá dữ liệu Live cũ + reset mốc đồng bộ về epoch
```

Script tự xoá đúng các dòng `dwh.ReportFacts` mà job "Live" (không phải
job "Lịch sử") đã ghi (lọc theo `SourceSystem`), rồi reset mốc đồng bộ
(`etl.SyncState.LastSyncedAt`) của job đó về `1970-01-01` — lượt chạy kế
tiếp (tối đa 15 phút sau, theo lịch `*/15 * * * *`) sẽ tự quét lại TOÀN BỘ
dữ liệu còn trong nguồn Live (idempotent, không tạo trùng — xem comment
đầu file script) với đủ 8 cột đo. KHÔNG đụng tới job "Nhập hàng theo ngành
hàng - Live" (measureColumns job đó không đổi, không có lỗi này) và KHÔNG
đụng tới job "Lịch sử (DSMART16_EOM)" (SourceSystem khác, đang chạy dở
kéo lịch sử nhiều năm — không bị ảnh hưởng).

**Kiểm tra sau khi chạy**: etl-admin → Đồng bộ → Log, xác nhận job "Doanh
thu theo ngành hàng - Live (DSMART16)" chạy xong không lỗi (vài phút, vì
job Live chỉ còn dữ liệu gần đây, không phải nhiều năm). Sau đó mở lại báo
cáo "Doanh thu theo ngành hàng"/"(LDTD)" với khoảng ngày đầu tháng — cột
Bán lẻ + Bán buôn phải cộng lại gần khớp Total (chỉ lệch nhỏ do mã 232,
xem mục 8), không còn gần như 0 ở các ngày đầu tháng.

**Lưu ý — câu hỏi "Total có PHẢI bằng Bán lẻ + Bán buôn + hàng hỏng hủy
không?"**: KHÔNG — theo đúng thiết kế đã xác nhận ở mục 8:
- Doanh thu Total = Bán lẻ + Bán buôn **+ phần mã 232 không tách được
  kênh** (232 chỉ cộng vào Total, không cộng riêng Bán lẻ/Bán buôn) — vì
  vậy Total có thể LỚN HƠN (Bán lẻ + Bán buôn) một chút nếu mã 232 khác 0
  trong kỳ, đây là CHÊNH LỆCH NHỎ đã biết, không phải lỗi.
- "Giá trị hàng hỏng hủy" KHÔNG trừ vào Doanh thu Total hiển thị (cột
  riêng) — chỉ trừ vào "Lãi gộp" (mẫu số "Tỷ lệ lãi gộp" dùng "Doanh thu
  cuối" = Total − hàng hỏng hủy, xem mục 8), không liên quan tới công thức
  Doanh thu Total/Bán lẻ/Bán buôn.
- Sau khi chạy script ở trên, chênh lệch Total vs (Bán lẻ + Bán buôn) chỉ
  còn ở mức NHỎ (do 232) — nếu vẫn lệch LỚN như trước thì có nghĩa script
  chưa chạy/job Live chưa chạy xong lượt tiếp theo, kiểm tra lại Log.

## 11. Job "Lịch sử (DSMART16_EOM)" Timeout liên tục, không bao giờ kéo được dữ liệu quá khứ — ✅ ĐÃ SỬA bản 9.88

**Hiện tượng người dùng báo cáo**: job "Doanh thu theo ngành hàng - Lịch
sử (DSMART16_EOM)" chạy (tự động theo lịch `0 3 * * *`, hoặc bấm "Chạy
thử") liên tục báo lỗi trong pm2 log (`hcrc-etl-error`):
```
Lỗi mạng khi trích xuất lô dữ liệu (lần 1/2): Timeout: Request failed to
complete in 90000ms — chi tiết: mã lỗi: ETIMEOUT — làm mới kết nối, thử
lại sau 5s...
Lỗi đồng bộ: Timeout: Request failed to complete in 90000ms
```
Tìm dữ liệu quá khứ (vd năm 2019) ở báo cáo luôn KHÔNG có, dù job đã
"Chạy thử"/tự chạy theo lịch nhiều lần.

**Nguyên nhân — LỖI TRONG CHÍNH ENGINE ETL dùng chung cho MỌI job "Lịch
sử" (`etl/jobs/runSync.js`), không riêng domain này**: engine có 2 mức
`requestTimeout` cho mỗi câu truy vấn trích xuất 1 lô dữ liệu — DÀI (10
phút, dành cho job "Lịch sử" đọc VIEW gộp UNION ALL hàng chục bảng lưu trữ
nhiều năm, KHÔNG có index hỗ trợ sắp xếp/phân trang — 1 lô 5000 dòng có
thể mất vài phút để trả về) và NGẮN (90 giây, dành cho job "Live" hằng
ngày — phát hiện treo nhanh, không chiếm connection lâu, bản 8.86). Engine
TRƯỚC ĐÂY chọn mức nào CHỈ dựa vào "`lastSyncedAt` (mốc đồng bộ) có đúng
bằng epoch `1970-01-01` hay không" — coi đó là "lượt chạy đầu tiên". Nhưng
mốc đồng bộ được LƯU TẠM SAU MỖI LÔ (bản 9.26) — nên NGAY KHI job "Lịch
sử" xử lý xong dù chỉ 1 LÔ ĐẦU TIÊN (rất dễ xảy ra, job tự chạy mỗi đêm
theo lịch), mốc đồng bộ không còn = epoch nữa → MỌI lượt chạy SAU ĐÓ (dù
job vẫn còn cách "bắt kịp hiện tại" NHIỀU NĂM dữ liệu) bị coi NHẦM là
"lượt incremental nhỏ hằng ngày" → dùng timeout NGẮN 90 giây → timeout
ngay lô kế tiếp, vĩnh viễn không tiến xa hơn được.

**Đã sửa** (`etl/jobs/runSync.js`, bản 9.88): đổi tiêu chí chọn timeout
dài từ "mốc đồng bộ = epoch chính xác" sang "mốc đồng bộ còn cách hiện tại
quá XA (> 365 ngày)" — job "Lịch sử" giữ được timeout dài XUYÊN SUỐT nhiều
lượt chạy cho tới khi thật sự bắt kịp gần hiện tại (không chỉ đúng 1 lượt
đầu tiên), job "Live" vận hành bình thường (mốc đồng bộ luôn trong vài
ngày gần đây) không bị ảnh hưởng, giữ nguyên hành vi timeout ngắn như bản
8.86.

**Việc cần làm trên server**: `git pull origin main` rồi
`pm2 restart hcrc-etl` (KHÔNG cần đổi CSDL/chạy script gì thêm — thuần sửa
code). Sau đó vào etl-admin → Đồng bộ → "Chạy thử" job "Doanh thu theo
ngành hàng - Lịch sử (DSMART16_EOM)" (và job "Nhập hàng theo ngành hàng -
Lịch sử" nếu có) — theo dõi Log, lần này sẽ KHÔNG còn timeout ở 90 giây
(sẽ đợi tới 10 phút/lô nếu lô đó thật sự chậm) — job có thể mất NHIỀU GIỜ
chạy nền (không cần ngồi chờ, cron tự tiếp tục lượt sau mỗi đêm) để kéo
hết nhiều năm lịch sử, nhưng sẽ KHÔNG còn bị "kẹt cứng" ở timeout nữa.
Kiểm tra sau vài ngày: mở báo cáo với khoảng ngày năm trước, xác nhận đã
có dữ liệu.

## 12. Chỉ tiêu RIÊNG theo từng khối Toàn hệ thống BRG/LFL/NSO — ✅ SỬA bản 9.89

**Hiện tượng người dùng báo cáo**: "Doanh thu ngành hàng HCRC và LDTD
muốn nhập file chỉ tiêu có tách doanh thu tổng, doanh thu theo LFL và
doanh thu NSO, hiện tại upload chỉ tiêu đang chỉ theo tổng nên số liệu
tính chưa đúng."

**Nguyên nhân**: báo cáo có 3 khối lặp lại (mục 5 — "Toàn hệ thống BRG"/
"LFL"/"NSO", LFL/NSO là 2 TẬP CON siêu thị tách theo `etl.NsoStores`),
nhưng TRƯỚC bản này `runNganhHangBrgReport()` chỉ đọc ĐÚNG 1 `targetMap`
(không hậu tố) rồi dùng CHUNG cho CẢ 3 khối — "% so chỉ tiêu" của khối LFL
và NSO vì vậy lấy đúng Thực đạt của khối đó chia cho Chỉ tiêu TOÀN HỆ
THỐNG (sai, vì LFL/NSO chỉ là 1 phần siêu thị, không bao giờ nên so với
chỉ tiêu của TOÀN BỘ).

**Đã sửa**:

1. **Nguồn dữ liệu — KHÔNG có VIEW/domain mới**, chỉ thêm CỘT vào file
   Excel chỉ tiêu đã có (cơ chế "generic" ở `etl/lib/salesTargetsImport.js`
   tự nhận MỌI tên cột, không cần sửa code parser). Mỗi 1 trong 4 chỉ số
   (`ChiTieuDoanhThuBanLe`/`ChiTieuDoanhThuBanBuon`/`ChiTieuLaiGopBanLe`/
   `ChiTieuLaiGopBanBuon`) giờ có **3 BẢN ĐỘC LẬP**:
   - Không hậu tố — chỉ tiêu khối **"Toàn hệ thống BRG"** (Total).
   - Hậu tố `_LFL` (vd `ChiTieuDoanhThuBanLe_LFL`) — chỉ tiêu khối **LFL**.
   - Hậu tố `_NSO` (vd `ChiTieuDoanhThuBanLe_NSO`) — chỉ tiêu khối **NSO**.

   Tổng **12 cột chỉ tiêu** (xem `etl/server.js:NGANH_HANG_DOANH_THU_TARGET_COLUMNS`,
   dùng chung cho cả 2 trang Chỉ tiêu Doanh thu theo ngành hàng gốc/LDTD).
   **3 số HOÀN TOÀN ĐỘC LẬP** (người dùng xác nhận khi được hỏi) — hệ
   thống KHÔNG tự kiểm tra/ép buộc Tổng = LFL + NSO, admin tự nhập đúng 3
   số theo kế hoạch kinh doanh thật (có thể công ty đặt mục tiêu Tổng khác
   phép cộng đơn thuần 2 nhóm siêu thị).

2. **Các bước triển khai** (ĐÚNG thứ tự):
   1. `git pull origin main` rồi `pm2 restart hcrc-etl` (đổi
      `etl/server.js`, cần restart để route `/template`/`/export` trả
      đúng 12 cột mới).
   2. `cd rp-server && pm2 restart hcrc-rp-server` (đổi
      `lib/nganhHangBrgRunner.js` — nơi thực sự ĐỌC đúng bộ cột theo từng
      khối lúc chạy báo cáo).
   3. Vào etl-admin → "Chỉ tiêu Doanh thu theo ngành hàng"/"(LDTD)" → "Tải
      file mẫu" — xác nhận file mẫu MỚI có đủ 12 cột (`Thang`,
      `MaNganhHang`, 4 cột không hậu tố, 4 cột `_LFL`, 4 cột `_NSO`).
   4. Điền chỉ tiêu riêng cho CẢ 3 khối (đặc biệt `_LFL`/`_NSO` — trước
      đây CHƯA TỪNG có 2 bộ cột này, nếu bỏ trống thì khối đó hiện "—" ở
      "% so chỉ tiêu", KHÔNG dùng tạm số của khối khác nữa) rồi nhập lại
      file qua "Nhập chỉ tiêu" (ghi đè đúng dòng/tháng đã có — dữ liệu Chỉ
      tiêu "Total" (không hậu tố) đã nhập từ trước vẫn giữ nguyên, không
      mất, chỉ cần BỔ SUNG thêm 8 cột `_LFL`/`_NSO` còn thiếu).

3. **Cách kiểm tra sau khi triển khai xong**: mở báo cáo (web/Excel/PDF),
   kiểm tra cột "% so chỉ tiêu" (cả Doanh thu VÀ Lãi gộp) ở khối LFL và
   NSO — phải khác số ở khối "Toàn hệ thống BRG" (trước đây 3 khối luôn ra
   CÙNG 1 tỷ lệ % nếu Thực đạt mỗi khối khác nhau nhưng Chỉ tiêu lại y hệt
   nhau — dấu hiệu rõ nhất của lỗi cũ). Khối nào CHƯA kịp nhập chỉ tiêu
   `_LFL`/`_NSO` sẽ hiện "—" (dấu gạch ngang) thay vì 1 con số sai.

## 13. Bộ lọc "Siêu thị" riêng theo từng khối + "Bỏ hàng hỏng hủy" — bản 9.90

**Theo yêu cầu người dùng**: "3 filter theo Total: chọn siêu thị, LFL:
Chọn siêu thị, NSO: chọn siêu thị trong NSO. Và thêm lọc Bỏ Hàng hỏng hủy:
không đưa hàng hỏng hủy vào và lãi theo doanh thu không trừ hàng hỏng
hủy."

**4 bộ lọc mới** (áp dụng cho CẢ 2 báo cáo "Doanh thu theo ngành hàng"/
"(LDTD)", xem `rp-server/scripts/seedNganhHangReports.js`):

1. **"Siêu thị — khối Toàn hệ thống BRG"** (multiSelect) — không chọn =
   mọi siêu thị (hành vi CŨ, không đổi); có chọn = CHỈ cộng dồn đúng (các)
   siêu thị đã chọn vào khối này.
2. **"Siêu thị — khối LFL"** (multiSelect, dropdown CHỈ liệt kê siêu thị
   thuộc LFL) — không chọn = mọi siêu thị LFL (hành vi CŨ); có chọn = thu
   hẹp xuống đúng tập đã chọn (GIAO với tập LFL thật — lỡ chọn nhầm 1 siêu
   thị thực ra thuộc NSO sẽ KHÔNG có tác dụng gì, an toàn).
3. **"Siêu thị — khối NSO"** (multiSelect, cùng cơ chế trên, đảo lại cho
   NSO).
4. **"Lãi gộp có trừ Giá trị hàng hỏng hủy?"** (select, mặc định "Có trừ"
   — GIỮ NGUYÊN công thức cũ) — chọn "Không trừ" thì:
   - Lãi gộp (Giá trị VÀ Tỷ lệ, cả % so chỉ tiêu/% so cùng kỳ năm trước,
     CẢ 3 khối) = margin THÔ theo Doanh thu, KHÔNG trừ Giá trị hàng hỏng
     hủy nữa (mẫu số "Tỷ lệ Lãi gộp Total" dùng thẳng Thực đạt Total thay
     vì "Doanh thu cuối").
   - Cột **"Giá trị hàng hỏng hủy" VẪN hiện đúng số THẬT** (không ẩn,
     không về 0) — chỉ đổi cách nó ảnh hưởng Lãi gộp, không đổi số liệu
     hiển thị của chính cột đó (minh bạch, người xem vẫn biết có bao
     nhiêu hàng hỏng hủy).
   - Báo cáo tự hiện 1 dòng cảnh báo (⚠️) nhắc đang bật bộ lọc này, tránh
     hiểu nhầm số Lãi gộp cao hơn bình thường là do dữ liệu sai.

**KHÔNG đổi hành vi mặc định** — không chọn bất kỳ bộ lọc nào trong 4 bộ
lọc trên (mặc định khi mở báo cáo) cho ra **ĐÚNG Y HỆT** kết quả trước bản
9.90 (đã verify qua mock test: không lọc → BRG/LFL/NSO ra đúng số như
công thức cũ).

**Nguồn dữ liệu — KHÔNG có VIEW/domain/cột CSDL mới**:
- Dropdown "Siêu thị" theo từng khối đọc TRỰC TIẾP domain
  `doanhthu_nganhhang` đã có (quét mọi STK_ID từng có dữ liệu, phân loại
  LFL/NSO bằng ĐÚNG cơ chế "Ánh xạ Điểm - STK_ID" + "Siêu thị NSO" đã dùng
  cho 3 khối — xem `lib/nganhHangBrgRunner.js:resolveNganhHangBranchOptions()`).
- "Bỏ hàng hỏng hủy" THUẦN đổi công thức tính ở tầng ứng dụng
  (`computeRowFields()`), không đụng gì tới dữ liệu đã đồng bộ.

**Các bước triển khai** (ĐÚNG thứ tự):
1. `git pull origin main` rồi `pm2 restart hcrc-rp-server` (áp dụng code
   mới của `lib/nganhHangBrgRunner.js`/`routes/reports.js`).
2. `cd rp-server && node scripts/seedNganhHangReports.js` — BẮT BUỘC chạy
   lại để ghi 4 bộ lọc mới vào `DefinitionJson` của 2 báo cáo (CSDL
   `HCRC_RP`, bảng `app.ReportCatalog`) — thiếu bước này, code đã deploy
   nhưng giao diện/API KHÔNG hiện 4 ô lọc mới (vẫn đọc definition CŨ trong
   CSDL).
3. Kiểm tra: mở báo cáo "Doanh thu theo ngành hàng" — thấy đủ 4 ô lọc mới
   dưới "Khoảng ngày báo cáo". Bấm "Lọc" KHÔNG chọn gì cả — số liệu phải
   GIỐNG HỆT trước khi deploy (xác nhận không phá vỡ báo cáo cũ). Chọn thử
   1-2 siêu thị ở ô "Siêu thị — khối LFL" — số Thực đạt khối LFL phải THU
   HẸP lại đúng (các) siêu thị đã chọn, 2 khối BRG/NSO không đổi. Chọn
   "Không trừ" ở ô "Lãi gộp có trừ..." — số Lãi gộp (Giá trị) phải TĂNG
   lên đúng bằng Giá trị hàng hỏng hủy đang hiện, kèm 1 dòng cảnh báo phía
   trên bảng.

## 14. Khối NSO ra 0 dù đã khai đủ "Siêu thị NSO" + "Ánh xạ Điểm - STK_ID" — ✅ SỬA bản 9.91

**Hiện tượng người dùng báo cáo**: đã khai đủ 4 siêu thị ở "Siêu thị NSO"
(etl.NsoStores, đúng Mã Điểm) VÀ đã có dòng tương ứng ở "Ánh xạ Điểm -
STK_ID" (etl.DiemStkMapping, đúng `MaStkMoi` khớp mã kho THẬT đang có
trong `dwh.ReportFacts` domain `doanhthu_nganhhang` — đã đối chiếu kỹ qua
SQL, khớp hoàn toàn) — nhưng khối "NSO" trên báo cáo vẫn hiện Thực đạt =
0 cho mọi ngành hàng (trong khi Chỉ tiêu vẫn hiện đúng số vì nhập trực
tiếp, không qua chuỗi tra này).

**Nguyên nhân — ĐÚNG lỗi đã gặp 1 lần trước đó ở chỗ KHÁC trong hệ thống
(bản 9.58, xem `rp-server/lib/reportFactsHelpers.js`)**: cột `STK_ID` ở
nguồn DSMART là kiểu CHAR cố định độ dài, SQL Server tự động đệm khoảng
trắng phía sau cho đủ độ dài cột — mắt thường nhìn qua SSMS KHÔNG thấy
được (SSMS hiển thị `"12782"` y hệt `"12782 "`), nhưng so sánh chuỗi
trong JavaScript coi 2 giá trị đó KHÁC NHAU. `rp-server/lib/nganhHangBrgRunner.js`
đọc `STK_ID` thẳng từ `JSON.parse(row.Dimensions)` (qua
`lib/reportEngine.js`/`lib/compositeReportRunner.js`) — ĐƯỜNG DỮ LIỆU
KHÁC với `reportFactsHelpers.js:loadLatestDimensionsForDomain()` (nơi đã
được vá `.trim()` ở bản 9.58) — nên lỗi y hệt vẫn còn NGUYÊN ở đường này,
chưa từng được vá. Trong khi đó `MaStkMoi` đọc từ "Ánh xạ Điểm - STK_ID"
(`lib/diemStkMapping.js:parseStkList()`) ĐÃ trim sẵn — 2 bên lệch nhau
đúng 1 khoảng trắng, so khớp luôn SAI, STK_ID "không tra được Mã Điểm" →
mặc định rơi về khối LFL (xem chú thích đầu file) — ĐÚNG lý do khối NSO
không BAO GIỜ nhận được dù khai đúng mọi thứ ở 2 trang quản trị (lỗi này
âm thầm, không lộ ra ở khối LFL vì LFL VỐN LÀ khối "mặc định" khi tra
không khớp — chỉ lộ rõ ở khối NSO vì khối đó bắt buộc phải tra khớp mới
nhận được).

**Đã sửa**: thêm `.trim()` khi đọc `STK_ID` từ Dimensions ở 2 chỗ còn
thiếu trong `nganhHangBrgRunner.js` (vòng lặp phân loại LFL/NSO VÀ
`groupByDeptId()` lọc theo khối) — khớp đúng cách `diemStkMapping.js` đã
trim `MaStkMoi`. Đã verify qua mock test: STK_ID có khoảng trắng thừa giả
lập vẫn khớp đúng sau khi sửa.

**Việc cần làm trên server**: `git pull origin main` rồi
`pm2 restart hcrc-rp-server` (thuần sửa code, KHÔNG cần đổi dữ liệu đã
khai ở "Siêu thị NSO"/"Ánh xạ Điểm - STK_ID" — những gì đã nhập trước đó
vẫn đúng, chỉ là trước đây code so sánh sai). Mở lại báo cáo, xác nhận
khối NSO đã ra số Thực đạt > 0.

## 15. Dropdown "Siêu thị — khối ..." hiện mã số thay vì tên — bản 9.92 (làm rõ nhãn, KHÔNG phải lỗi)

**Hiện tượng người dùng báo cáo**: mở 1 trong 3 dropdown "Siêu thị" mới
(bản 9.90), nhiều mục hiện thẳng mã số (vd `20081`, `24001`) thay vì tên
siêu thị. **Cùng hiện tượng này CŨNG gặp ở dropdown "Chi nhánh" của báo
cáo "Core stock = 0" (Mart/Minimart)** — 2 báo cáo KHÔNG liên quan nhau
nhưng dùng CHUNG 1 nguồn lấy tên.

**Nguyên nhân — KHÔNG phải lỗi, là THIẾU DỮ LIỆU KHAI BÁO** (hành vi đã
có từ bản 9.56 cho "Core stock = 0", nay áp dụng mirror cho dropdown mới
ở bản 9.90): tên siêu thị hiển thị CHỈ lấy được từ cột `TenSieuThi` khai
tay ở **"Ánh xạ Điểm - STK_ID"** — domain `doanhthu_nganhhang` (VIEW
nguồn, xem mục 2) KHÔNG có cột tên siêu thị nào khác để dự phòng. Mã kho
nào CHƯA được khai ở "Ánh xạ Điểm - STK_ID" thì không có tên để hiện —
TRƯỚC bản 9.92, trường hợp này hiện THẲNG mã số (dễ hiểu nhầm là lỗi).

**Đã sửa (bản 9.92)**: đổi cách hiện cho RÕ NGHĨA hơn — mã CHƯA khai tên
giờ hiện dạng `<mã> (chưa khai tên)` (vd `20081 (chưa khai tên)`) thay vì
`20081` trần trụi — áp dụng ĐỒNG NHẤT cho CẢ 2 nơi
(`lib/nganhHangBrgRunner.js:resolveNganhHangBranchOptions()` VÀ
`lib/coreZeroStockRunner.js:resolveEligibleBranchOptions()`). KHÔNG đổi
`value` gửi lên khi lọc (vẫn đúng mã kho thật) — CHỈ đổi chữ hiển thị,
không ảnh hưởng gì tới việc lọc báo cáo.

**Cách có TÊN ĐẦY ĐỦ ở mọi dropdown**: vào etl-admin → "Ánh xạ Điểm -
STK_ID" → bổ sung đủ dòng cho các mã kho còn thiếu (cột `TenSieuThi`) —
đây là việc khai dữ liệu, KHÔNG cần deploy code gì thêm, tên sẽ tự hiện
đúng ngay khi khai xong (cache 60 giây, xem `lib/diemStkMapping.js`).

**Việc cần làm trên server (cho phần đổi nhãn)**: `git pull origin main`
rồi `pm2 restart hcrc-rp-server`.

## 16. "% so cùng kỳ năm trước" — cột Bán lẻ/Bán buôn trống, Total vẫn có số — bản 9.96

**Hiện tượng người dùng báo cáo** (ảnh chụp thật): cột "Doanh thu — % so
cùng kỳ năm trước"/"Lãi gộp — % so cùng kỳ năm trước" — `Total` vẫn ra số
bình thường (vd 14%, 13%, 11%), nhưng `Bán lẻ`/`Bán buôn` TRỐNG 100%.

**Nguyên nhân — ĐÃ XÁC NHẬN qua SQL thật (KHÔNG phải watermark/tốc độ
đồng bộ như mục 10/11)**: job **"Doanh thu theo ngành hàng - Lịch sử
(DSMART16_EOM)"** đang chạy với `MeasureColumnsJson =
["SoLuongBan","DoanhThu","LaiGop"]` — cấu hình CŨ, **từ lần đầu job này
được tạo ở mục 9, TRƯỚC KHI bản 9.68 thêm 5 cột mới vào VIEW** — và CHƯA
BAO GIỜ được chạy lại `seedNganhHangSync.js --with-history` sau bản 9.68
để cập nhật cấu hình. Vì vậy job này **CHƯA BAO GIỜ lấy**
`DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGopBanLe`/`LaiGopBanBuon`/
`GiaTriHongHuy` cho BẤT KỲ ngày nào nó đã đồng bộ — kể cả khi watermark đã
chạy rất xa (xác nhận SQL: `LastSyncedAt` đã tới 2026-10-05, dữ liệu
2025-10 có `DoanhThu`/`LaiGop` nhưng Measures JSON KHÔNG CÓ `DoanhThuBanLe`
v.v.). `Total` vẫn đúng vì `DoanhThu` là field GỐC, có từ trước bản 9.68.

**Khác mục 10/11 (lỗi watermark khiến job KHÔNG BAO GIỜ quay lại ngày cũ)**
— ở đây job VẪN đi qua đúng mọi ngày, chỉ là CHƯA TỪNG yêu cầu đủ cột ngay
từ đầu — 2 lớp lỗi khác nhau, cùng 1 hậu quả (thiếu dữ liệu), cách sửa
khác nhau.

**Cách sửa (bản 9.96, đã chốt với người dùng — nạp lại TOÀN BỘ lịch sử,
chấp nhận chậm thay vì build thêm script nạp ưu tiên theo khoảng ngày)**:

1. `cd etl && node scripts/seedNganhHangSync.js --with-history` — cập
   nhật `MeasureColumnsJson` của job lên đủ 8 số đo (AN TOÀN, chạy lại
   nhiều lần được, KHÔNG tự xoá dữ liệu cũ).
2. `node scripts/resyncDoanhThuNganhHangLichSu.js` (xem trước, KHÔNG đổi
   gì — script tự kiểm tra Bước 1 đã làm chưa, báo lỗi rõ nếu chưa đủ 8
   số đo) rồi `node scripts/resyncDoanhThuNganhHangLichSu.js --confirm`
   (thực sự xoá dữ liệu Lịch sử cũ + reset watermark về đầu).

**‼️ CẢNH BÁO đã báo trước với người dùng, KHÔNG phải lỗi phát sinh mới**:
job "Lịch sử" quét ~93 bảng nhiều năm — nạp lại TỪ ĐẦU có thể mất **NHIỀU
TUẦN** (lần đầu tiên cũng mất nhiều ngày/tuần, xem mục 11). Trong lúc đang
nạp lại: cột "% so cùng kỳ năm trước" sẽ **TRỐNG HẲN** (kể cả `Total` đang
có số cũng tạm mất), cho tới khi job quét tới đúng ngày cần so sánh —
XẤU HƠN tạm thời so với hiện trạng (chỉ thiếu Bán lẻ/Bán buôn), nhưng là
đánh đổi cần thiết để có dữ liệu ĐÚNG VÀ ĐỦ lâu dài, thay vì vá tạm.

**Theo dõi tiến độ**: SQL giống mục 11 —
```sql
SELECT j.Name, s.LastSyncedAt
FROM etl.SyncJobs j JOIN etl.SyncState s ON s.SyncJobId = j.Id
WHERE j.Name = N'Doanh thu theo ngành hàng - Lịch sử (DSMART16_EOM)';
```
Khi `LastSyncedAt` tiến tới đúng ngày "cùng kỳ năm trước" cần xem, báo
cáo tự có đủ số — không cần làm gì thêm, không cần deploy lại.

**KHÔNG đụng tới**: job "Live" (đã đúng từ bản 9.86), job "Nhập hàng theo
ngành hàng - Lịch sử" (measureColumns riêng, không liên quan lỗi này).

## 17. "Lãi gộp — % so chỉ tiêu" đổi vị trí — bản 9.98

**Theo yêu cầu người dùng**: cột "Lãi gộp — % so chỉ tiêu" (`ChiTieuLaiGopBanLe`/
`ChiTieuLaiGopBanBuon` so với Lãi gộp thực đạt — đã có công thức từ bản
9.73/9.74, KHÔNG phải tính năng mới) nằm Ở CUỐI nhóm "Lãi gộp" (ngay trước
"% so cùng kỳ năm trước"), người dùng muốn nó đứng NGAY SAU "Giá trị hàng
hỏng hủy" và TRƯỚC "Lãi gộp — Tỷ lệ" — dễ đối chiếu Lãi gộp đạt được so
kế hoạch TRƯỚC KHI xem chi tiết Tỷ lệ/Giá trị.

**Đã sửa**: đổi thứ tự trong `COLUMNS`/`COLUMN_GROUPS`/
`COLUMN_SUPER_GROUPS` ở `rp-server/lib/nganhHangBrgRunner.js` — THUẦN đổi
VỊ TRÍ HIỂN THỊ, KHÔNG đổi field/công thức tính nào (đã kiểm tra khớp đúng
key giữa 3 mảng sau khi đổi). Thứ tự MỚI của nhóm "Lãi gộp": % so chỉ tiêu
→ Tỷ lệ → Giá trị → % so cùng kỳ năm trước.

**Lưu ý nếu cột vẫn hiện trống sau khi deploy**: cột này chỉ có số khi
Chỉ tiêu Lãi gộp (`ChiTieuLaiGopBanLe`/`ChiTieuLaiGopBanBuon`, xem mục 4 —
12 cột Chỉ tiêu bản 9.89) ĐÃ ĐƯỢC NHẬP cho đúng kỳ đang xem (qua etl-admin
→ "Chỉ tiêu theo ngành hàng" → Nhập Excel) — nếu chưa nhập, cột hiện "—"
(không phải lỗi, đúng hành vi "chưa có dữ liệu" của mọi cột Chỉ tiêu
khác). Kiểm tra đã nhập đúng kỳ (`Thang` dạng `YYYY-MM`) chưa trước khi
báo lỗi.

**Việc cần làm trên server**: `git pull origin main` rồi `pm2 restart`
đúng tiến trình `rp-server` (code nằm ở backend, KHÔNG cần build lại
`rp-user`).
