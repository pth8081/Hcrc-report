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
