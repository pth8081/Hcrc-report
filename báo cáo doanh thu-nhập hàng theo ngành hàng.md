# Báo cáo Doanh thu theo ngành hàng / Nhập hàng theo ngành hàng

Tài liệu tham chiếu chính thức cho 2 báo cáo mới (bản 9.41+) — **đọc file
này TRƯỚC khi sửa bất kỳ logic nào liên quan**
(`rp-server/scripts/seedNganhHangReports.js`, `etl/scripts/seedNganhHangSync.js`,
`etl/lib/salesTargetsImport.js` phần "generic" shape), cùng quy ước với
"báo cáo doanh thu cuối ngày.md"/"bc-don-dat-hang.md".

## 1. Yêu cầu nghiệp vụ (đã chốt qua nhiều vòng trao đổi với người dùng)

1. **Mỗi dòng LUÔN là 1 ngành hàng** — khác hẳn báo cáo doanh thu/nhập hàng
   theo chi nhánh (mỗi dòng là 1 siêu thị). Không có khái niệm "dòng =
   siêu thị + ngành hàng".
2. **Bộ lọc "Chi nhánh" tuỳ chọn** — không chọn gì = cộng dồn TOÀN HỆ
   THỐNG (mọi siêu thị); chọn 1/vài siêu thị = chỉ cộng dồn đúng (các) siêu
   thị đó, vẫn ra đúng 1 dòng/ngành hàng.
3. **Chỉ tiêu nhập THEO TOÀN CÔNG TY** — 1 con số/ngành hàng/tháng, KHÔNG
   tách theo chi nhánh (khác chỉ tiêu LDTD/HCRC vốn theo từng siêu thị).
   Chọn bộ lọc "Chi nhánh" ở báo cáo KHÔNG làm thay đổi cột "Chỉ tiêu" —
   chỉ thay đổi cột "Thực đạt" (cộng dồn đúng phạm vi đã chọn).
4. Đầy đủ các cột như báo cáo doanh thu chi nhánh: **Chỉ tiêu, Thực đạt,
   Tỷ lệ đạt, Cùng kỳ năm trước, % LFL**.
5. Phase 1 (bản này) chỉ làm cho **hệ gốc/trung tâm** (domain
   `doanhthu_nganhhang`/`nhaphang_nganhhang`, đọc trực tiếp CSDL DSMART16
   trung tâm) — CHƯA làm bản "(Thành viên)" 34 cửa hàng riêng (có thể làm
   sau nếu cần, theo đúng mẫu `historicalDomain`/domain `_thanhvien` đã có
   ở báo cáo doanh thu chi nhánh).

## 2. Nguồn dữ liệu DSMART16

Xác nhận qua SQL thật (không đoán):

- **Doanh thu theo ngành hàng** — cùng công thức VIEW
  `V_HCRC_DOANHTHU_CHINHANH` đã chốt (STRANS, TRANS_CODE
  `211/221/232`=bán, `212/222`=trả hàng, `STATUS<>'D'`, doanh thu =
  `AMOUNT+SURPLUS`, lãi gộp = `SURPLUS`), CHỈ GỘP THÊM theo ngành hàng
  (`SKU_DEF.DEPT_ID` → `DEPTLIST.DEPT_NAME_U`, cột Unicode tránh lỗi font —
  cùng pattern đã sửa cho `SUPP_NAME`/`SUPP_NAME_U` ở bc-don-dat-hang.md).
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

## 4. Chỉ tiêu "theo toàn công ty"

Khác hẳn chỉ tiêu LDTD/HCRC (theo từng siêu thị, `EntityCode = MaSieuThi`)
— chỉ tiêu ngành hàng dùng `EntityCode = MaNganhHang` (= `DEPT_ID`),
**KHÔNG tách chi nhánh**. Cơ chế nhập (xem
`etl/lib/salesTargetsImport.js:parseGenericShape()`): file Excel shape
"generic" (`MaSieuThi`+`Thang`+`MaNganhHang`+cột chỉ tiêu tuỳ ý) — để
**TRỐNG** `MaSieuThi`, CHỈ điền `MaNganhHang` = chỉ tiêu theo toàn công ty
cho đúng ngành hàng đó.

2 trang etl-admin (router `createSalesTargetsRouter(..., shape='generic', genericTargetColumns)`):

- **Chỉ tiêu Doanh thu theo ngành hàng** (`/sales-targets-nganhhang-dt`,
  domain `sales-targets-nganhhang-dt`, cột `ChiTieuDoanhThu`).
- **Chỉ tiêu Nhập hàng theo ngành hàng** (`/sales-targets-nganhhang-nh`,
  domain `sales-targets-nganhhang-nh`, cột `ChiTieuGiaTriNhap`).

KHÔNG đối chiếu `findUnknownEntityCodes` (actualDataDomain bỏ trống) — mã
ngành hàng (`DEPT_ID`) khác hẳn granularity entityCode của domain thực đạt
(`<STK_ID>_<DEPT_ID>`), so khớp chuỗi CHÍNH XÁC ở đây sẽ báo sai cho MỌI
dòng.

## 5. Cơ chế ghép trong báo cáo (compositeReportRunner.js)

Entity thực đạt (domain `doanhthu_nganhhang`) ở khoá chi tiết
`<STK_ID>_<DEPT_ID>` (để LỌC được theo chi nhánh), còn chỉ tiêu ở khoá thô
`DEPT_ID`. 2 khối LỆCH khoá — cơ chế ghép-theo-entityCode thường (Map
trong `runCompositeReport()`) không tự khớp được. Giải quyết bằng 2 cơ
chế MỚI, **opt-in hoàn toàn** (báo cáo nào không khai thì không đổi gì):

- **`block.remapEntityCode`** — áp dụng NGAY SAU khi khối trả rows thô
  (TRƯỚC bước ghép giữa các khối): lọc rows theo `filterField`/
  `filterValuesField` (vd `STK_ID`/`branches` — bộ lọc "Chi nhánh" người
  dùng chọn), rồi gộp lại theo `field` (vd `DEPT_ID`) thành entityCode
  MỚI, CỘNG DỒN measures. Dùng cho khối `current`/`lastYear`.
- **`definition.preFilter`** — lọc theo 1 dimension TRƯỚC khi nhóm/tính
  toán, áp dụng SAU bước ghép (không dùng ở 2 báo cáo này, nhưng sẵn có
  cho thiết kế tương lai khác).

Xem chú thích đầy đủ (code + lý do) ở
`rp-server/lib/compositeReportRunner.js` — đã chạy regression test (so
sánh JSON output trước/sau trên 1 báo cáo hình dạng CŨ, byte-identical)
trước khi merge, xác nhận không ảnh hưởng báo cáo hiện có.

## 6. Định nghĩa báo cáo

`rp-server/scripts/seedNganhHangReports.js` — 2 `ReportId`:
`bc-doanh-thu-nganhhang`/`bc-nhap-hang-nganhhang`, `SourceType='composite'`.
Mỗi báo cáo 3 khối: `current` (remapEntityCode), `lastYear`
(dateOffsetYears=-1, remapEntityCode), `target` (isTarget). Không
`groupBy`/`columnGroups` (mỗi ngành hàng 1 dòng phẳng, không cần nhóm con).
`requireTargetMatch: false` — ngành hàng chưa có chỉ tiêu tháng đó vẫn hiện
Thực đạt đầy đủ, chỉ trống cột Chỉ tiêu/Tỷ lệ đạt.

```
node rp-server/scripts/seedNganhHangReports.js [menuCode]   # mặc định reports-kinh-doanh
```

## 7. "Cùng kỳ năm trước" — ĐÃ XÁC NHẬN VIEW Lịch sử chạy đúng, còn 1 bước

VIEW Lịch sử (mục 2) đã chạy thật trên `DSMART16_EOM`, kết quả đúng (ngày
2026-10-05 — dữ liệu quá khứ thật, tên ngành hàng Unicode đúng, số liệu hợp
lý). **KHÔNG cần sửa gì** ở `rp-server/scripts/seedNganhHangReports.js` —
khối `lastYear` chỉ khai `domain` (KHÔNG khai `historicalDomain`, khác báo
cáo "(Thành viên)"), vì `etl/scripts/seedNganhHangSync.js` cho CẢ 2 job
Live VÀ Lịch sử (`--with-history`) cùng ghi vào CHUNG 1 `TargetDomain`
(`doanhthu_nganhhang`/`nhaphang_nganhhang`), chỉ khác `SourceSystem` (theo
`DataSourceId`) — `dwh.ReportFacts` cho phép 2 dòng cùng entityCode+ngày
miễn khác SourceSystem, và `compositeReportRunner.js:aggregateDailyRowsByEntity()`
tự khử trùng theo (entityCode, ngày) nếu có chồng lấn. Vì vậy chỉ cần
`domain` đơn thuần là đã đọc được CẢ dữ liệu Live lẫn Lịch sử — khác hẳn
trường hợp "(Thành viên)" cần tách domain vì đó là 2 domain TÊN KHÁC NHAU.

**Việc còn lại**:

1. Chạy `node etl/scripts/seedNganhHangSync.js --with-history` trên server
   ETL thật — tạo 2 job đồng bộ "Lịch sử (DSMART16_EOM)" (script tự kiểm
   tra VIEW/cột trước khi ghi job, báo lỗi rõ nếu thiếu).
2. Vào etl-admin → Đồng bộ → "Chạy thử" 2 job Lịch sử vừa tạo, xác nhận
   đồng bộ xong không lỗi.
3. Chạy lại báo cáo (web/Excel) với 1 khoảng ngày của NĂM TRƯỚC (vd đúng
   ngày 2026-10-05 ở kết quả test trên) — xác nhận cột "Cùng kỳ năm
   trước"/"% LFL" đã có số.
4. Vào Hệ thống → Phân quyền gán quyền xem 2 báo cáo cho đúng vai trò.
