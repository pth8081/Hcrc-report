# Báo cáo Doanh thu theo ngành hàng / Nhập hàng theo ngành hàng

Tài liệu tham chiếu chính thức cho 3 báo cáo — **đọc file này TRƯỚC khi sửa
bất kỳ logic nào liên quan** (`rp-server/scripts/seedNganhHangReports.js`,
`rp-server/lib/nganhHangBrgRunner.js`, `etl/scripts/seedNganhHangSync.js`,
`etl/scripts/seedHangHongHuySync.js`, `etl/lib/salesTargetsImport.js` phần
"generic" shape), cùng quy ước với "báo cáo doanh thu cuối ngày.md"/
"bc-don-dat-hang.md":

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
3. **2 báo cáo DOANH THU chia 3 KHỐI lặp lại cho CÙNG 12 ngành hàng** (bản
   9.63/9.67): "Toàn hệ thống BRG" (cộng dồn mọi siêu thị) / "LFL" ("Like
   For Like", siêu thị ỔN ĐỊNH) / "NSO" ("New Store Opening", siêu thị MỚI
   MỞ — xem mục 7). Thể hiện bằng 1 CỘT "Khối" + dòng "Tổng cộng" tô đậm
   riêng từng khối — KHÔNG phải dòng tiêu đề gộp ngang (colSpan) như ảnh
   mẫu gốc, vì bảng/Excel/PDF dùng chung cho nhiều báo cáo khác trong hệ
   thống hiện chưa hỗ trợ dòng tiêu đề gộp ngang trong thân bảng (xem mục 5).
   Báo cáo "Nhập hàng theo ngành hàng" KHÔNG chia khối — vẫn 1 dòng/ngành
   hàng phẳng như trước.
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
6. **2 báo cáo DOANH THU thêm cụm "Lãi gộp"** (bản 9.63/9.67) — "Giá trị"
   (lấy thẳng từ dữ liệu đã đồng bộ, KHÔNG trừ hàng hỏng hủy), "Tỷ lệ" (=
   Giá trị lãi gộp ÷ **Doanh thu cuối** × 100 ở khối "Toàn hệ thống BRG" —
   bản 9.64 sửa lại, ban đầu tính nhầm theo Thực đạt thô; khối LFL/NSO vẫn
   chia cho Thực đạt vì không có khái niệm Doanh thu cuối riêng), "% so chỉ
   tiêu", "% so cùng kỳ năm trước" — xem công thức đầy đủ ở mục 5.
7. **"Giá trị hàng hỏng hủy"/"Doanh thu cuối"** (= Thực đạt − Giá trị hàng
   hỏng hủy, bản 9.63) — CHỈ hiện số ở khối "Toàn hệ thống BRG" (hàng hỏng
   hủy không tách được theo siêu thị), khối "LFL"/"NSO" để trống "—". **Xem
   mục 8 — nguồn dữ liệu CHƯA CÓ, đang chờ người dùng xác nhận.**
8. **LFL/NSO** phân loại qua trang khai báo "Siêu thị NSO" (mục 7) — mã
   Điểm KHÔNG khai (hoặc đang "Khoá") MẶC ĐỊNH tính là LFL. Danh sách NÀY
   DÙNG CHUNG cho CẢ 2 báo cáo doanh thu (KHÔNG tách riêng theo báo cáo —
   theo yêu cầu người dùng bản 9.67).
9. Phase 1 chỉ làm cho **hệ gốc/trung tâm** (domain `doanhthu_nganhhang`/
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
    SUM(CASE WHEN s.TRANS_CODE IN ('211','221','232') THEN s.SURPLUS ELSE 0 END)
      - SUM(CASE WHEN s.TRANS_CODE IN ('212','222') THEN s.SURPLUS ELSE 0 END) AS LaiGop
FROM dbo.STRANS s
JOIN dbo.SKU_DEF d ON d.SKU_ID = s.SKU_ID
LEFT JOIN dbo.DEPTLIST dl ON dl.DEPT_ID = d.DEPT_ID
WHERE s.STATUS <> 'D' AND s.TRANS_CODE IN ('211','221','232','212','222')
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

**"Giá trị hàng hỏng hủy"** (bản 9.63, domain MỚI `hanghonghuy_nganhhang`,
job riêng `etl/scripts/seedHangHongHuySync.js`) — xem mục 8, CHƯA triển
khai được vì chưa xác định nguồn dữ liệu thật.

## 4. Chỉ tiêu "theo toàn công ty"

Khác hẳn chỉ tiêu LDTD/HCRC (theo từng siêu thị, `EntityCode = MaSieuThi`)
— chỉ tiêu ngành hàng dùng `EntityCode = MaNganhHang` (= `DEPT_ID`),
**KHÔNG tách chi nhánh**. Cơ chế nhập (xem
`etl/lib/salesTargetsImport.js:parseGenericShape()`): file Excel shape
"generic" (`MaSieuThi`+`Thang`+`MaNganhHang`+cột chỉ tiêu tuỳ ý) — để
**TRỐNG** `MaSieuThi`, CHỈ điền `MaNganhHang` = chỉ tiêu theo toàn công ty
cho đúng ngành hàng đó.

3 trang etl-admin (router `createSalesTargetsRouter(..., shape='generic', genericTargetColumns)`):

- **Chỉ tiêu Doanh thu theo ngành hàng** (`/sales-targets-nganhhang-dt`,
  domain `sales-targets-nganhhang-dt`, cột `ChiTieuDoanhThu` **+
  `ChiTieuLaiGop`** — bản 9.67, thêm cột mẫu cho cột "% so chỉ tiêu" của
  cụm Lãi gộp; cơ chế field-động đã tự nhận MỌI tên cột từ trước, KHÔNG
  cần đổi code để "hoạt động" — chỉ đổi cột mẫu hiển thị gợi ý).
- **Chỉ tiêu Doanh thu theo ngành hàng (LDTD)** (`/sales-targets-nganhhang-dt-ldtd`,
  domain `sales-targets-nganhhang-dt-ldtd`, cùng 2 cột trên — trang RIÊNG
  của đội Lãnh đạo Tập đoàn, KHÔNG ghi đè Chỉ tiêu của trang trên).
- **Chỉ tiêu Nhập hàng theo ngành hàng** (`/sales-targets-nganhhang-nh`,
  domain `sales-targets-nganhhang-nh`, cột `ChiTieuGiaTriNhap` — KHÔNG đổi).

KHÔNG đối chiếu `findUnknownEntityCodes` (actualDataDomain bỏ trống) — mã
ngành hàng (`DEPT_ID`) khác hẳn granularity entityCode của domain thực đạt
(`<STK_ID>_<DEPT_ID>`), so khớp chuỗi CHÍNH XÁC ở đây sẽ báo sai cho MỌI
dòng.

## 5. Cơ chế tính — 2 báo cáo DOANH THU (`SourceType='nganhHangBrg'`, bản 9.63/9.67)

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
   đúng 1 năm) và `hanghonghuy_nganhhang` 1 lần (chỉ kỳ hiện tại).
2. Tra `targetMap` theo `MaNganhHang`, từ ĐÚNG `targetDomain` của báo cáo
   đang chạy.
3. Với MỖI `STK_ID` xuất hiện trong dữ liệu — phân loại LFL/NSO (mục 7),
   gộp vào 1 trong 2 tập `lflStkIds`/`nsoStkIds`.
4. Với MỖI khối (BRG = không lọc, LFL = lọc theo `lflStkIds`, NSO = lọc
   theo `nsoStkIds`) — gộp dữ liệu theo `DEPT_ID`, build đủ 12 dòng ngành
   hàng + 1 dòng "Tổng cộng".

**Công thức từng cột** (mọi tỷ lệ làm tròn 1 chữ số thập phân; thiếu mẫu
số → `null`, hiển thị "—", KHÔNG phải `0`/lỗi):

| Cột | Công thức |
|---|---|
| Chỉ tiêu | `target.ChiTieuDoanhThu` (từ `targetDomain` của báo cáo) |
| Thực đạt | `current.measures.DoanhThu` |
| % so chỉ tiêu | Thực đạt ÷ Chỉ tiêu × 100 |
| % so cùng kỳ năm trước | Thực đạt ÷ Thực đạt cùng kỳ × 100 |
| Giá trị hàng hỏng hủy | *(chỉ khối BRG)* tổng `GiaTriHongHuy` theo tên ngành hàng — xem mục 8 |
| Doanh thu cuối | *(chỉ khối BRG)* Thực đạt − Giá trị hàng hỏng hủy |
| Lãi gộp — Tỷ lệ | Giá trị lãi gộp ÷ MẪU SỐ × 100 — mẫu số = **Doanh thu cuối** ở khối BRG (bản 9.64), = **Thực đạt** ở khối LFL/NSO |
| Lãi gộp — Giá trị | `current.measures.LaiGop` — lấy THẲNG từ cột `LaiGop` đã đồng bộ, KHÔNG trừ hàng hỏng hủy |
| Lãi gộp — % so chỉ tiêu | Giá trị lãi gộp ÷ `target.ChiTieuLaiGop` × 100 |
| Lãi gộp — % so cùng kỳ năm trước | Giá trị lãi gộp ÷ Giá trị lãi gộp cùng kỳ × 100 |

Dòng "Tổng cộng" mỗi khối: CỘNG DỒN giá trị tuyệt đối của 12 dòng rồi tính
LẠI % từ tổng (không lấy trung bình cộng % từng dòng) — `__isSubtotal:
true`; riêng dòng Tổng cộng khối "Toàn hệ thống BRG" thêm `__isGrandTotal:
true` (tô màu đồng nhất, xem `lib/reportCellFormat.js`).

`columnGroups`: `Doanh thu` (xanh lá, 4 cột Chỉ tiêu/Thực đạt/2 cột %) +
`Lãi gộp` (cam, 4 cột Tỷ lệ/Giá trị/2 cột %). `standaloneColumnColors`:
`giaTriHongHuy` đỏ, `doanhThuCuoi` xanh dương (không thuộc nhóm nào).

**Bán lẻ/Bán buôn** (cột "Total"/"Bán lẻ"/"Bán buôn" theo mẫu Excel gốc) —
CHƯA LÀM, chờ DBA xác nhận cột/cờ phân biệt 2 kênh trong DSMART.

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

## 8. "Giá trị hàng hỏng hủy" — 🔴 BLOCKED, CHƯA có nguồn dữ liệu

**ĐÃ XÁC NHẬN với người dùng (18/10/2026)**: view dự kiến
`V_HCRC_HANGHONGHUY_NGANHHANG` KHÔNG tồn tại, và DSMART **HIỆN CHƯA LƯU dữ
liệu hàng hỏng hủy ở bất kỳ đâu** (không phải chỉ thiếu VIEW gộp — thiếu
hẳn nguồn gốc). Người dùng đang tự kiểm tra bảng/nghiệp vụ nào (nếu có) ghi
nhận việc này.

Dự kiến 3 cột cần có khi tìm được nguồn (CÓ THỂ ĐỔI tuỳ cấu trúc bảng gốc
thật):

| Cột | Ý nghĩa |
|---|---|
| `GiaTriHongHuy` | Giá trị hàng hỏng hủy (số tiền) |
| `NganhHang` | **TÊN** ngành hàng (KHÔNG phải mã), PHẢI khớp (sau `.trim()`) đúng 1 trong 12 tên ở mục 1 |
| `NgayGhiNhan` | Ngày ghi nhận hàng hỏng hủy |

**Bộ lệnh kiểm tra** (gửi DBA chạy trên DSMART16 trung tâm):

```sql
-- 1) View đã tồn tại chưa?
SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME = 'V_HCRC_HANGHONGHUY_NGANHHANG';

-- 2) Tìm bảng gốc khả nghi
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%HONGHUY%' OR TABLE_NAME LIKE '%HUHONG%'
   OR TABLE_NAME LIKE '%HAOHUT%' OR TABLE_NAME LIKE '%HUYHANG%'
   OR TABLE_NAME LIKE '%DISCARD%' OR TABLE_NAME LIKE '%DAMAGE%'
   OR TABLE_NAME LIKE '%SCRAP%' OR TABLE_NAME LIKE '%WRITEOFF%'
   OR TABLE_NAME LIKE '%ADJUST%' OR TABLE_NAME LIKE '%DIEUCHINH%';

-- 3) Nếu STRANS có TRANS_CODE lạ ngoài 211/221/232/212/222/333 đã biết:
SELECT TRANS_CODE, COUNT(*) AS SoDong FROM dbo.STRANS
WHERE TRAN_DATE >= DATEADD(day, -30, GETDATE())
GROUP BY TRANS_CODE ORDER BY TRANS_CODE;
```

**Cho tới khi có nguồn dữ liệu**: `etl/scripts/seedHangHongHuySync.js`
không tạo được job đồng bộ thật (domain rỗng) — 2 báo cáo doanh thu vẫn
chạy ĐÚNG với mọi cột khác, "Giá trị hàng hỏng hủy" tự ra `0` (an toàn,
không lỗi), "Doanh thu cuối" = Thực đạt, Tỷ lệ lãi gộp tự dùng đúng Thực
đạt làm mẫu số (vì Doanh thu cuối = Thực đạt lúc hàng hỏng hủy = 0).

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
