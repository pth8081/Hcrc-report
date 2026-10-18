# Báo cáo Doanh thu, lãi gộp theo ngành hàng (BRGMART)

Tài liệu tham chiếu chính thức cho báo cáo `bc-doanh-thu-nganhhang-brgmart`
(bản 9.63, sửa công thức Lãi gộp ở bản 9.64) — **đọc file này TRƯỚC khi sửa
bất kỳ logic nào liên quan** (`rp-server/lib/nganhHangBrgRunner.js`,
`rp-server/scripts/seedNganhHangBrgReport.js`, `etl/lib/nsoStoresImport.js`,
`etl/routes/admin/nsoStores.js`, `etl/scripts/seedHangHongHuySync.js`),
cùng quy ước với các file `báo cáo ....md`/`bc-....md` khác ở gốc repo.

Khác hẳn báo cáo "Doanh thu theo ngành hàng" gốc (xem `báo cáo doanh
thu-nhập hàng theo ngành hàng.md`) — báo cáo NÀY đúng theo mẫu Excel
BRGMART người dùng gửi, có 3 khối siêu thị lặp lại và thêm cụm Lãi gộp +
Giá trị hàng hỏng hủy. 2 báo cáo hoàn toàn ĐỘC LẬP (khác `ReportId`, khác
`Chỉ tiêu`), không đụng chạm nhau.

## 1. Yêu cầu nghiệp vụ (đã chốt qua nhiều vòng trao đổi với người dùng)

1. Theo đúng bố cục mẫu Excel `MAU_BAO_CAO_THEO_NGANH_HANG.xlsx` người
   dùng gửi: mỗi dòng là 1 ngành hàng, lặp lại cho **3 khối** "Toàn hệ
   thống BRG" / "LFL" / "NSO".
2. **Danh mục 12 ngành hàng CỐ ĐỊNH** (không tự xếp theo dữ liệu như đa số
   báo cáo khác — hiện ĐỦ cả 12 dòng/khối dù ngành hàng đó không phát sinh
   dữ liệu trong kỳ), **mã ngành hàng sắp xếp tăng dần**:

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

3. **LFL** ("Like For Like" — siêu thị ỔN ĐỊNH) / **NSO** ("New Store
   Opening" — siêu thị MỚI MỞ) phân loại qua 1 trang khai báo MỚI "Siêu
   thị NSO" (mục 4) — mã Điểm KHÔNG khai ở đó (hoặc có khai nhưng đang
   "Khoá") MẶC ĐỊNH tính là LFL, KHÔNG cần khai danh sách LFL riêng.
4. **"Giá trị hàng hỏng hủy"** — đồng bộ tự động từ DSMART (mục 3), cộng
   dồn theo ngành hàng. **"Doanh thu cuối" = Thực đạt − Giá trị hàng hỏng
   hủy.** Vì hàng hỏng hủy KHÔNG tách được theo siêu thị/khối (nguồn không
   có cột siêu thị) — 2 cột này **CHỈ hiện số ở khối "Toàn hệ thống BRG"**,
   khối "LFL"/"NSO" để trống "—".
5. **Cột "Tỷ lệ" lãi gộp PHẢI tính trên Doanh thu CUỐI** (đã trừ hàng hỏng
   hủy), KHÔNG tính trên Thực đạt thô — fix bản 9.64, người dùng phát hiện
   ngay khi xem demo. Áp dụng ở khối "Toàn hệ thống BRG" (nơi duy nhất có
   Doanh thu cuối); khối "LFL"/"NSO" vẫn chia cho Thực đạt (không có khái
   niệm Doanh thu cuối riêng, coi như hàng hỏng hủy = 0 ở 2 khối đó). Xem
   công thức đầy đủ ở mục 6.
6. **Bán lẻ/Bán buôn** (cột "Total"/"Bán lẻ"/"Bán buôn" ở mẫu Excel gốc) —
   **CHƯA LÀM** (bản 9.63 — "Chưa có, cần hỏi DBA/kiểm tra thêm"). Thêm
   sau chỉ cần sửa `rp-server/lib/nganhHangBrgRunner.js` (tách `measures`
   theo kênh bán), KHÔNG cần đổi hạ tầng `columnGroups` (2 tầng tiêu đề đã
   đủ dùng, cơ chế có sẵn).
7. **Thiết kế hiển thị 3 khối — KHÁC ảnh demo gốc**: mẫu Excel/ảnh demo
   trình bày 3 khối bằng dòng tiêu đề gộp ngang (colSpan). Hạ tầng hiển
   thị/xuất dùng CHUNG cho nhiều báo cáo khác trong hệ thống
   (`rp-user/src/components/DataTable.jsx`, `rp-server/lib/exportExcel.js`,
   `rp-server/lib/exportPdf.js`) hiện CHỈ hỗ trợ gộp ngang ở HEADER (qua
   `columnGroups`), KHÔNG có cơ chế dòng tiêu đề gộp ngang trong THÂN bảng
   — để không phải sửa 3 file dùng chung đó (rủi ro ảnh hưởng báo cáo
   khác), báo cáo này dùng 1 **CỘT "Khối"** + dòng "Tổng cộng" tô đậm riêng
   từng khối thay cho dòng tiêu đề gộp ngang. Dữ liệu/công thức giống hệt
   mẫu gốc, chỉ khác cách trình bày phần phân khối.

## 2. Nguồn dữ liệu DSMART

### Doanh thu + Lãi gộp (TÁI DÙNG domain đã có, KHÔNG đồng bộ mới)

Dùng LẠI nguyên domain `doanhthu_nganhhang` (VIEW `V_HCRC_DOANHTHU_NGANHHANG`
— xem `báo cáo doanh thu-nhập hàng theo ngành hàng.md` mục 2 để biết SQL
đầy đủ) — domain này ĐÃ sẵn `STK_ID` (cho phép tách LFL/NSO theo siêu thị)
và `LaiGop` (giá trị lãi gộp tuyệt đối, cột `SURPLUS` của `STRANS`) ngay từ
khi được tạo ở bản 9.41, nên KHÔNG cần sync job/VIEW mới cho phần này.

### Giá trị hàng hỏng hủy (domain MỚI, bản 9.63)

**⚠️ CẦN XÁC NHẬN LẠI VỚI DBA — CHƯA CHỐT SQL VIEW**: theo trả lời của
người dùng lúc thu thập yêu cầu ("Đồng bộ tự động từ DSMART (có bảng/view
sẵn)"), view `V_HCRC_HANGHONGHUY_NGANHHANG` được hiểu là **ĐÃ CÓ SẴN**
trên DSMART16, với 3 cột:

| Cột | Ý nghĩa |
|---|---|
| `GiaTriHongHuy` | Giá trị hàng hỏng hủy (số tiền) |
| `NganhHang` | **TÊN** ngành hàng (KHÔNG phải mã — vd `"UltraFresh"`, `"Bánh kẹo sữa thạch"`), PHẢI khớp (sau khi bỏ khoảng trắng 2 đầu bằng `.trim()`) đúng 1 trong 12 tên ở mục 1, nếu không sẽ ra "Giá trị hàng hỏng hủy" = 0 cho ngành hàng đó mà KHÔNG báo lỗi gì |
| `NgayGhiNhan` | Ngày ghi nhận hàng hỏng hủy |

Chưa xác minh được bằng SQL thật (khác hẳn `V_HCRC_DOANHTHU_NGANHHANG` ở
trên — đã chạy thật, có SQL đầy đủ) — nếu view này **chưa tồn tại thật**
trên DSMART16, cần làm rõ với DBA **bảng gốc** chứa dữ liệu hao hụt/hủy
hàng (có phải vẫn là `STRANS` với 1 `TRANS_CODE` riêng, hay 1 bảng/module
phiếu hủy hàng tách biệt) rồi viết `CREATE OR ALTER VIEW` tương ứng — mirror
đúng pattern VIEW ở mục 2 file `báo cáo doanh thu-nhập hàng theo ngành
hàng.md` (GROUP BY theo ngành hàng + ngày, SUM giá trị). Cập nhật lại mục
này + merge SQL thật vào đây ngay khi có xác nhận, theo quy ước CLAUDE.md
"mỗi báo cáo phải có 1 tài liệu hướng dẫn riêng".

`etl/scripts/seedHangHongHuySync.js` đọc view này, domain
`hanghonghuy_nganhhang`, `keyColumn: 'NganhHang'` (coi TÊN ngành hàng là
khoá thực thể — domain nhỏ, không cần gộp theo siêu thị), `dateColumn:
'NgayGhiNhan'`, `measureColumns: ['GiaTriHongHuy']`, cron 15 phút.

```
cd etl
node scripts/seedHangHongHuySync.js
```

## 3. Phân loại LFL/NSO — trang khai báo "Siêu thị NSO"

**Bảng mới `etl.NsoStores`** (`etl-db/schema.sql`): `MaDiem` (NVARCHAR,
UNIQUE), `TenSieuThi` (tuỳ chọn), `IsActive`, `ImportedAt`/`ImportedBy`.
Trang etl-admin "Siêu thị NSO" (menu `nso-stores`, mirror ĐẦY ĐỦ bộ nút
trang "Ánh xạ Điểm - STK_ID": tải file mẫu, nhập Excel, sửa/thêm 1 dòng,
khoá/kích hoạt, xuất Excel, chọn nhiều + xoá hàng loạt).

Phân loại 1 `STK_ID` cụ thể (mục 5) đi qua 2 bước tra cứu:
1. `STK_ID` → `MaDiem` (qua "Ánh xạ Điểm - STK_ID" đã có, dùng `MaStkMoi`
   — xem `rp-server/lib/diemStkMapping.js:buildStkIdLookup()`).
2. `MaDiem` → có trong `etl.NsoStores` (IsActive=1) không? CÓ → NSO; KHÔNG
   (hoặc `STK_ID` không tra được `MaDiem` nào) → LFL.

`etl-db/grants.sql` — thêm `GRANT SELECT ON etl.NsoStores TO
etl_diem_stk_reader;` (đọc qua pool `ETL_DIEM_STK` của `rp-server`, cùng
cơ chế với "Ánh xạ Điểm - STK_ID" — xem `rp-server/lib/nsoStores.js`, cache
60s, lỗi kết nối trả `Set` rỗng, KHÔNG làm sập báo cáo).

## 4. Chỉ tiêu riêng — "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)"

Trang etl-admin RIÊNG (`sales-targets-nganhhang-dt-brgmart`, domain Chỉ
tiêu RIÊNG — KHÔNG đụng Chỉ tiêu của báo cáo ngành hàng gốc/LDTD), cùng
cơ chế field-động `etl/lib/salesTargetsImport.js:parseGenericShape()` —
để TRỐNG `MaSieuThi` (Chỉ tiêu nhập THEO TOÀN CÔNG TY, không tách chi
nhánh, Chỉ tiêu HIỂN THỊ GIỐNG NHAU ở cả 3 khối BRG/LFL/NSO vì cùng 1
targetMap, chỉ khác Thực đạt dùng để tính % so với nó). 2 cột:

| Cột Excel nhập | Dùng cho |
|---|---|
| `ChiTieuDoanhThu` | Cột "Chỉ tiêu" cụm Doanh thu |
| `ChiTieuLaiGop` | Cột "% so chỉ tiêu" cụm Lãi gộp |

## 5. Cơ chế tính — `rp-server/lib/nganhHangBrgRunner.js` (`SourceType='nganhHangBrg'`)

Dedicated runner (mirror `lib/purchaseOrderRunner.js`) — KHÔNG dùng
`SourceType='composite'` vì hình dạng đặc thù (nhân 3 khối cho CÙNG 1 lần
đọc domain, điều `compositeReportRunner.js` không hỗ trợ sẵn). Tái dùng
các hàm đọc/gộp `dwh.ReportFacts` đã có (`fetchAllReportRows`,
`remapEntityCode`, `aggregateDailyRowsByEntity`, `resolveRequestedRange`
— lộ thêm từ `compositeReportRunner.js`, additive, không đổi báo cáo khác).

**Luồng xử lý mỗi lần chạy**:
1. Đọc `doanhthu_nganhhang` 2 lần (kỳ hiện tại + cùng kỳ năm trước, dịch
   đúng 1 năm) và `hanghonghuy_nganhhang` 1 lần (chỉ kỳ hiện tại — KHÔNG
   có "cùng kỳ năm trước" cho hàng hỏng hủy).
2. Tra `targetMap` (Chỉ tiêu, mục 4) theo `MaNganhHang` — DÙNG CHUNG cho cả
   3 khối.
3. Với MỖI `STK_ID` xuất hiện trong dữ liệu — phân loại LFL/NSO (mục 3),
   gộp vào 1 trong 2 tập `lflStkIds`/`nsoStkIds`.
4. Với MỖI khối (BRG = không lọc, LFL = lọc theo `lflStkIds`, NSO = lọc
   theo `nsoStkIds`) — gộp dữ liệu theo `DEPT_ID`, build đủ 12 dòng ngành
   hàng + 1 dòng "Tổng cộng".

**Công thức từng cột** (mọi tỷ lệ làm tròn 1 chữ số thập phân, `ROUND(x,
1)`; thiếu mẫu số → `null`, hiển thị "—", KHÔNG phải `0`/lỗi):

| Cột | Công thức |
|---|---|
| Chỉ tiêu | `target.ChiTieuDoanhThu` |
| Thực đạt | `current.measures.DoanhThu` |
| % so chỉ tiêu | Thực đạt ÷ Chỉ tiêu × 100 |
| % so cùng kỳ năm trước | Thực đạt ÷ Thực đạt cùng kỳ × 100 |
| Giá trị hàng hỏng hủy | *(chỉ khối BRG)* tổng `GiaTriHongHuy` theo tên ngành hàng |
| Doanh thu cuối | *(chỉ khối BRG)* Thực đạt − Giá trị hàng hỏng hủy |
| Lãi gộp — Tỷ lệ | **Giá trị lãi gộp ÷ MẪU SỐ × 100** — mẫu số = **Doanh thu cuối** ở khối BRG, = **Thực đạt** ở khối LFL/NSO (bản 9.64, xem mục 1.5) |
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

## 6. Định nghĩa báo cáo

`rp-server/scripts/seedNganhHangBrgReport.js` — `ReportId =
'bc-doanh-thu-nganhhang-brgmart'`, `SourceType = 'nganhHangBrg'`,
`DefinitionJson` CHỈ cần `title`/`exportTitle`/`exportFileCode`/`domain`/
`filters` (mục `columns`/`blocks` KHÔNG cần — runner tự khai trong code,
không đọc từ `DefinitionJson`). Nhóm menu mặc định `reports-mua-hang`
("Báo cáo Mua hàng") — khớp 2 báo cáo ngành hàng gốc.

```
node rp-server/scripts/seedNganhHangBrgReport.js [menuCode]
```

## 7. Kiểm tra sau khi triển khai

- [ ] rp-user → "Báo cáo Mua hàng" → mở "Doanh thu, lãi gộp theo ngành
  hàng (BRGMART)" → đủ 3 khối (cột "Khối") × 12 ngành hàng, mỗi khối có
  dòng "Tổng cộng" tô đậm.
- [ ] "Giá trị hàng hỏng hủy"/"Doanh thu cuối" CHỈ có số ở khối "Toàn hệ
  thống BRG", khối "LFL"/"NSO" để trống "—" (ĐÚNG THIẾT KẾ).
- [ ] Toàn bộ 12 dòng khối BRG ra "Giá trị hàng hỏng hủy" = 0 dù chắc chắn
  có dữ liệu → kiểm tra cột `NganhHang` trong view có khớp (kể cả khoảng
  trắng, dấu câu) đúng 12 tên ở mục 1 chưa:
  `SELECT DISTINCT NganhHang FROM V_HCRC_HANGHONGHUY_NGANHHANG`.
- [ ] Siêu thị vừa khai ở "Siêu thị NSO" → xuất hiện ĐÚNG khối "NSO" sau
  khi job đồng bộ doanh thu chạy lại ít nhất 1 lần.
- [ ] Cột "Tỷ lệ" lãi gộp khối "Toàn hệ thống BRG" PHẢI = Giá trị lãi gộp
  ÷ Doanh thu cuối × 100 (CAO HƠN 1 chút so với chia cho Thực đạt) — khối
  "LFL"/"NSO" vẫn chia cho Thực đạt (xem mục 1.5/mục 5).
- [ ] etl-admin → "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)" →
  nhập thử 1 giá trị → báo cáo cập nhật đúng cả cụm Doanh thu lẫn Lãi gộp.
- [ ] 2 báo cáo ngành hàng gốc/LDTD đã có từ trước hoạt động Y HỆT trước —
  báo cáo này hoàn toàn độc lập, không đụng/đổi gì báo cáo đó.

## 8. Việc còn lại (CHƯA chặn triển khai, cần làm rõ thêm)

1. **Xác nhận SQL thật của `V_HCRC_HANGHONGHUY_NGANHHANG`** (mục 2) — bổ
   sung vào tài liệu này ngay khi có.
2. **Bán lẻ/Bán buôn** (mục 1.6) — chờ DBA xác nhận cột/cờ phân biệt 2
   kênh trong DSMART.
3. Gán quyền xem báo cáo + quyền sửa 2 trang admin mới ("Siêu thị NSO",
   "Chỉ tiêu Doanh thu/Lãi gộp theo ngành hàng (BRGMART)") — 2 script seed
   KHÔNG tự gán quyền.

Xem thêm `deploy/Hướng dẫn triển khai gộp — bản 9.59 đến 9.63.md` Phần 3 +
`deploy/Nhật ký triển khai (từ bản 8.31).md` mục 9.63/9.64 cho các bước
triển khai thật trên server.
