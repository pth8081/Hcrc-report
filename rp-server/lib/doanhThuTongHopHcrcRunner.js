// lib/doanhThuTongHopHcrcRunner.js — SourceType='doanhThuTongHopHcrc' (bản
// 10.82, theo yêu cầu người dùng — "Báo cáo tổng hợp doanh thu siêu thị
// hàng ngày", dựa trên file mẫu thật đội vận hành đang tự tổng hợp tay).
//
// MỖI DÒNG = 1 mã Điểm, với 3 KHỐI SỐ LIỆU tính SONG SONG cho CÙNG 1 ngày
// được chọn: Ngày (đúng ngày đó), Tháng (từ đầu tháng tới ngày đó), Năm
// (từ đầu năm tới ngày đó) — KHÁC các báo cáo composite khác (chỉ 1 khối
// "khoảng ngày" người dùng tự chọn) — đây là lý do viết RUNNER RIÊNG thay
// vì dùng lib/compositeReportRunner.js (definition không có khái niệm "3
// khối cùng lúc, mỗi khối 1 khoảng ngày khác nhau tính từ 1 ngày neo").
//
// BẢN 10.86 — BỎ VIEW MỚI `vw_DoanhThuTongHopHCRC`/domain
// `doanhthu_tonghop_hcrc` (bản 10.82), TÁI DÙNG domain `doanhthu_nganhhang`
// ĐÃ CÓ SẴN + ĐANG CHẠY THẬT (theo đề xuất người dùng — domain đó ĐÃ tách
// sẵn Bán buôn/Bán lẻ cho báo cáo "Doanh thu theo ngành hàng" đang hiển thị
// đúng số) thay vì chờ tạo VIEW/job đồng bộ MỚI. `doanhthu_nganhhang` gộp
// theo (STK_ID, DEPT_ID, ngày) — mỗi siêu thị có NHIỀU dòng (1 dòng/ngành
// hàng) — CỘNG DỒN thêm 1 bước theo STK_ID (bỏ DEPT_ID) ở
// `sumNganhHangByStk()` dưới đây để ra đúng 1 dòng/siêu thị.
// LƯU Ý: cột "Địa điểm" (STOCK.PLACE) KHÔNG có trong bất kỳ domain đã có
// nào — TẠM ĐỂ TRỐNG (null) ở bản này, chưa lấy ra được — xem
// "bc-doanh-thu-tong-hop-hcrc.md" mục ghi chú bản 10.86.
//
// TÁI DÙNG tối đa hạ tầng đã có (không viết lại):
//   - fetchAllReportRows/aggregateDailyRowsByEntity (compositeReportRunner.js)
//     — gọi domain qua lib/reportEngine.js, cộng dồn nhiều ngày về 1 dòng.
//   - remapRowsToDiem (lib/diemStkMapping.js) — dịch STK_ID -> mã Điểm,
//     CỘNG DỒN đúng theo danh sách MaStkMoi của từng mã Điểm.
//   - buildBuIdLookup (lib/diemStkMapping.js) — dịch BU_ID -> mã Điểm cho
//     domain `giaodich_chinhanh` (khác hẳn STK, chỉ 1-1 không phải danh
//     sách, nên dịch tay ở allocateByBuId() dưới đây, không qua
//     remapRowsToDiem — hàm đó CHỈ xử lý đúng kiểu danh sách STK).
//   - runSalesTargetsBlockRange (lib/salesTargetsReader.js) — Chỉ tiêu,
//     DÙNG CHUNG domain `sales-targets-hcrc` đã có cho "Doanh thu cuối
//     ngày" (theo yêu cầu người dùng, KHÔNG tạo Chỉ tiêu riêng).
//
// Số nhân sự: đếm SỐ TÀI KHOẢN được gán quyền xem đúng mã Điểm đó
// (app.UserStoreAccess, CSDL RP — theo yêu cầu người dùng "lấy từ phân
// quyền đã có nhân viên thuộc siêu thị nào là chuẩn nhất") — KHÔNG phải dữ
// liệu DSMART16, đọc THẲNG bằng SQL riêng (không qua domain/dwh.ReportFacts).
//
// "Kế hoạch DT"/"Kế hoạch Bill" hiện trong khối NGÀY thực ra là kế hoạch
// CỦA CẢ THÁNG (đã xác nhận với người dùng, khớp đúng số liệu mẫu — kế
// hoạch ngày không có ý nghĩa tách rời theo từng ngày trong hệ Chỉ tiêu
// hiện có) — dùng CHUNG đúng số đã tính cho khối Tháng, không tính lại.
//
// "Dự kiến hoàn thành kế hoạch" (bản dự báo, theo yêu cầu người dùng) =
// (Doanh thu luỹ kế tháng / số ngày đã qua trong tháng) × tổng số ngày
// trong tháng, so với Kế hoạch DT (cả tháng).
const { sql, getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');
const { resolveMaDiemForDepartment } = require('./departmentStoreMapping');

// Bản 10.86 — 2 domain ĐÃ CÓ SẴN, KHÔNG dùng domain mới doanhthu_tonghop_hcrc.
const AREA_DOMAIN = 'doanhthu_chinhanh'; // chỉ lấy dienTich/chain (dimensions, camelCase)
const NGANHHANG_DOMAIN = 'doanhthu_nganhhang'; // DoanhThu/DoanhThuBanLe/DoanhThuBanBuon/LaiGop (PascalCase), gộp theo (STK_ID, DEPT_ID, ngày)
const TRANSACTION_DOMAIN = 'giaodich_chinhanh';
const TARGET_DOMAIN = 'sales-targets-hcrc';
const NGANHHANG_MEASURE_KEYS = ['DoanhThu', 'DoanhThuBanLe', 'DoanhThuBanBuon', 'LaiGop'];

// vietnamTodayISO/firstOfMonth — COPY nguyên từ compositeReportRunner.js
// (hàm đó KHÔNG export, xem chú thích bản 8.26 ở file gốc giải thích lý do
// PHẢI cố định múi giờ Việt Nam, không phụ thuộc múi giờ máy chủ).
function vietnamTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
function firstOfMonth(dateStr) { return `${dateStr.slice(0, 7)}-01`; }
function firstOfYear(dateStr) { return `${dateStr.slice(0, 4)}-01-01`; }
function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function dayOfMonth(dateStr) { return Number(dateStr.slice(8, 10)); }
// Bản 11.20 (theo yêu cầu người dùng — "Kế hoạch tháng" phải cộng ĐỦ CẢ
// THÁNG đúng file target đã upload theo tháng, KHÁC "Thực hiện" chỉ cộng
// dồn tới hôm nay) — dùng cho fetchTargetsByMaDiem(toPeriod), xem chú
// thích bản 11.20 ở chỗ gọi.
function lastOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-${String(daysInMonth(dateStr)).padStart(2, '0')}`;
}

function divOrNull(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}
function pctOrNull(numerator, denominator) {
  const v = divOrNull(numerator, denominator);
  return v === null ? null : v * 100;
}

// Diện tích/Nhóm chuỗi — domain `doanhthu_chinhanh` khoá STK_ID trực tiếp
// (1 dòng/siêu thị/ngày) nên remapRowsToDiem dùng được NGUYÊN, không cần
// cộng dồn thêm bước nào.
async function fetchAreaByMaDiem(pool, diemMapping, from, to) {
  const definition = { domain: AREA_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  const rawRows = await fetchAllReportRows(pool, definition, { eventDate: { from, to } });
  const aggregated = aggregateDailyRowsByEntity(rawRows, to);
  const diemRows = remapRowsToDiem(aggregated, diemMapping, false);
  const byMaDiem = new Map();
  for (const row of diemRows) byMaDiem.set(row.entityCode, row);
  return byMaDiem;
}

// Bản 11.8 — SỬA LỖI THẬT (người dùng chỉ ra "Cột Lãi gộp theo từng ngày
// đang chưa chính xác"): Lãi gộp TRƯỚC ĐÂY lấy từ domain
// `doanhthu_nganhhang` (measure `LaiGop`, PascalCase, gộp theo STK_ID,
// DEPT_ID — đồng bộ qua job RIÊNG, xem etl/scripts/seedNganhHangSync.js)
// — NHƯNG "Báo cáo doanh thu cuối ngày" (LUÔN ĐÚNG, người dùng xác nhận)
// lấy Lãi gộp từ domain KHÁC: `doanhthu_chinhanh` (measure `laiGop`,
// camelCase — xem `scripts/seedLdtdHcrcReports.js`:
// `current.measures.laiGop`). 2 domain này đồng bộ bằng 2 JOB RIÊNG,
// KHÁC THỜI ĐIỂM — đã có SẴN ghi chú thật ở
// `etl/scripts/seedLdtdHcrcSync.js` (bản 10.34, lý do rút cron
// `doanhthu_chinhanh` xuống 2 phút): *"Lãi gộp gốc/Thành viên ĐÃ lệch
// nhau NGAY LÚC 22:30 CÙNG NGÀY... vì SURPLUS biến động LIÊN TỤC trong
// ngày"* — tức SURPLUS (gốc tính Lãi gộp) trong DSMART16 có thể đổi giá
// trị NHIỀU LẦN trong ngày (giá vốn tính lại), nên 2 pipeline "chụp" dữ
// liệu ở 2 thời điểm khác nhau SẼ ra 2 con số Lãi gộp khác nhau, dù CÙNG
// công thức gốc — CÀNG RÕ ở khối Ngày (1 ngày, ít dữ liệu, chênh lệch
// thời điểm chụp ảnh hưởng tỉ lệ % lớn) hơn khối Tháng/Năm (nhiều ngày,
// chênh lệch trung bình hoá bớt).
//
// SỬA: đổi HẲN sang đọc Lãi gộp từ `doanhthu_chinhanh` (ĐÚNG domain "Doanh
// thu cuối ngày" dùng) — khớp tuyệt đối giữa 2 báo cáo, không còn lệch do
// khác pipeline đồng bộ. KHÔNG đổi DT bán buôn/bán lẻ (domain
// `doanhthu_nganhhang` là nguồn DUY NHẤT có tách buôn/lẻ — `doanhthu_chinhanh`
// chỉ có `doanhThu` gộp chung, không tách được) — người dùng cũng KHÔNG
// báo DT bán buôn/bán lẻ sai, chỉ Lãi gộp.
function sumLaiGopByStk(rows) {
  const byStk = new Map();
  for (const row of rows) {
    const stkId = row.entityCode; // domain doanhthu_chinhanh khoá STK_ID TRỰC TIẾP (keyColumn='STK_ID'), KHÔNG qua dimensions như doanhthu_nganhhang.
    if (!stkId) continue;
    byStk.set(stkId, (byStk.get(stkId) || 0) + ((row.measures && row.measures.laiGop) || 0));
  }
  return byStk;
}
function remapLaiGopToMaDiem(byStk, diemMapping) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, laiGop]) => ({ entityCode: stkId, dimensions: {}, measures: { laiGop } }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, false);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, (r.measures && r.measures.laiGop) || 0);
  return out;
}

// Bản 11.4 — SỬA LỖI HIỆU NĂNG THẬT (người dùng báo "chạy rất chậm", báo
// cáo nhiều phút mới ra, "Xuất Excel theo tháng" timeout "Failed to
// fetch"): TRƯỚC ĐÂY fetch domain `doanhthu_nganhhang`/`giaodich_chinhanh`
// RIÊNG 3 LẦN (khối Ngày/Tháng/Năm — mỗi lần 1 lượt gọi DWH + vòng lặp
// phân trang `fetchAllReportRows` RIÊNG), dù khối Năm (rộng nhất) ĐÃ CHỨA
// SẴN toàn bộ dữ liệu của khối Ngày/Tháng (2 khối đó là TẬP CON của khối
// Năm, cùng neo "hôm nay") — dư thừa 2/3 số lượt gọi DWH một cách không
// cần thiết. SỬA theo ĐÚNG mẫu đã dùng (và đã chạy ổn định thật) ở
// lib/doanhThuTongHopHcrcMonthlyExport.js (bản 10.87) — fetch RAW ROWS
// domain đó CHỈ 1 LẦN (khoảng rộng nhất: đầu năm -> hôm nay), GOM NHÓM
// THEO NGÀY trong bộ nhớ (bucketByDay), rồi CẮT LẠI (rowsInRange, không
// gọi DWH nữa) cho từng khối Ngày/Tháng/Năm — cộng dồn đúng y hệt công
// thức cũ, chỉ đổi CÁCH LẤY DỮ LIỆU. Các hàm dưới đây TRƯỚC ĐÂY định nghĩa
// RIÊNG trong doanhThuTongHopHcrcMonthlyExport.js — gộp về ĐÂY (nguồn sự
// thật duy nhất) để dùng CHUNG cho CẢ báo cáo xem trên web/Xuất Excel/Xuất
// PDF (file này) LẪN "Xuất Excel theo tháng" (monthlyExport.js import lại
// từ đây), tránh lệch logic nếu sửa 1 nơi quên sửa nơi kia.
function toISODate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
// Bản 11.7 — SỬA LỖI HIỆU NĂNG THẬT (người dùng báo VẪN CHẬM sau bản
// 11.4 dù đã bỏ gọi lặp lại 3 lần): `fetchAllReportRows()`
// (lib/compositeReportRunner.js) phân trang bằng OFFSET/FETCH — MỖI
// TRANG LÀ 1 TRUY VẤN HOÀN TOÀN RIÊNG, không giữ "con trỏ" giữa các lượt
// gọi, nên SQL Server phải QUÉT LẠI TỪ ĐẦU rồi SKIP đúng offset đó ở MỖI
// LƯỢT. Domain `doanhthu_nganhhang` gộp theo (STK_ID, DEPT_ID, ngày) —
// khoảng CẢ NĂM (~40 siêu thị × hơn chục ngành hàng × ~320 ngày) có thể
// ra hàng trăm nghìn dòng, cần hàng chục lượt gọi 5000 dòng/lượt — lượt
// CUỐI phải quét qua gần hết số dòng đó trước khi tới đúng offset, tổng
// khối lượng quét lặp lại gấp NHIỀU LẦN số dòng thật — đây mới là nguyên
// nhân CHÍNH gây chậm (bản 11.4 chỉ bỏ được 2/3 SỐ LẦN gọi domain kiểu
// này — Ngày/Tháng — khối NĂM vẫn quét kiểu OFFSET/FETCH y hệt, dù giờ
// chỉ còn gọi 1 lần thay vì 3).
//
// SỬA: đọc THẲNG 1 TRUY VẤN DUY NHẤT, KHÔNG OFFSET/FETCH, KHÔNG ORDER BY
// (không cần sắp xếp gì — `bucketByDay()` tự gom lại theo ngày ngay sau)
// — SQL Server chỉ cần quét ĐÚNG 1 LƯỢT thay vì lặp lại hàng chục lần —
// mirror đúng cách `lib/reportFactsHelpers.js` đã né OFFSET/FETCH ở bản
// 9.83/9.87 cho domain tồn kho lớn (xem chú thích ở `dwh/schema.sql` —
// CÙNG LOẠI sự cố thật đã gặp trước đây, khác domain). Dòng trả về giữ
// ĐÚNG shape {entityCode, eventDate, dimensions, measures, syncedAt} như
// `fetchAllReportRows()` cũ (qua `reportEngine.js:parseRow()`) — không
// đổi gì ở `bucketByDay()`/`sumNganhHangByStk()`/`sumTransactionsByBuId()`
// phía sau.
async function fetchRawRows(pool, domain, from, to) {
  const result = await pool.request()
    .input('domain', sql.VarChar(50), domain)
    .input('from', sql.Date, from)
    .input('to', sql.Date, to)
    .query(`
      SELECT EntityCode, EventDate, Dimensions, Measures, SyncedAt
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EventDate BETWEEN @from AND @to
    `);
  return result.recordset.map(r => ({
    entityCode: r.EntityCode,
    eventDate: r.EventDate,
    dimensions: JSON.parse(r.Dimensions || '{}'),
    measures: r.Measures ? JSON.parse(r.Measures) : {},
    syncedAt: r.SyncedAt
  }));
}
// Bản 11.6 — SỬA LỖI THẬT (người dùng chỉ ra "Số bill và số giao dịch
// bạn đang lấy sai" — so với "Báo cáo doanh thu cuối ngày" LUÔN ĐÚNG,
// đọc CÙNG domain `giaodich_chinhanh`/`doanhthu_nganhhang` qua
// `lib/compositeReportRunner.js:aggregateDailyRowsByEntity()`): hàm đó
// DEDUPE theo ĐÚNG (entityCode, eventDate) — GIỮ dòng `syncedAt` MỚI
// NHẤT, BỎ dòng cũ hơn — TRƯỚC KHI cộng dồn, vì job "Live" (đồng bộ liên
// tục, rescan vài ngày/40 ngày gần nhất) VÀ job "Lịch sử" (3h sáng, đọc
// DSMART16_EOM) CÙNG ghi vào domain này, nên 1 (entityCode, ngày) có thể
// có 2 DÒNG THẬT từ 2 `SourceSystem` khác nhau trong `dwh.ReportFacts`
// (ràng buộc UNIQUE chỉ chặn trùng CÙNG SourceSystem, không chặn trùng
// GIỮA 2 SourceSystem) ở những ngày cả 2 job cùng chạm tới (vùng rescan
// chồng lấn). Bản 11.4 (gộp hàm fetch-once-gom-theo-ngày về đây) BỎ QUÊN
// bước dedupe này — `sumNganhHangByStk()`/`sumTransactionsByBuId()` cộng
// THẲNG mọi dòng `rowsInRange()` trả về, nên NHỮNG NGÀY bị trùng 2 dòng
// sẽ bị CỘNG GẤP ĐÔI (Số Bill, Số giao dịch, DT bán buôn/bán lẻ/Lãi gộp
// — mọi đo lường của domain `doanhthu_nganhhang`/`giaodich_chinhanh` đều
// bị ảnh hưởng, không riêng Số Bill) — đúng lỗi "Xuất Excel theo tháng"
// (doanhThuTongHopHcrcMonthlyExport.js, bản 10.87) đã có SẴN từ trước,
// chỉ chưa ai phát hiện vì chưa so sánh chéo với "Doanh thu cuối ngày".
// SỬA: dedupe NGAY KHI gom theo ngày (áp dụng CHUNG cho mọi lượt gọi
// `rowsInRange()` sau đó, không cần sửa 2 nơi) — mirror ĐÚNG logic giữ
// `syncedAt` mới nhất của `aggregateDailyRowsByEntity()`.
function bucketByDay(rawRows) {
  const byDay = new Map(); // ngày -> Map(entityCode -> dòng syncedAt mới nhất)
  for (const row of rawRows) {
    if (!row.entityCode) continue;
    const d = toISODate(row.eventDate);
    if (!byDay.has(d)) byDay.set(d, new Map());
    const dayMap = byDay.get(d);
    const existing = dayMap.get(row.entityCode);
    if (!existing || (row.syncedAt && (!existing.syncedAt || row.syncedAt > existing.syncedAt))) {
      dayMap.set(row.entityCode, row);
    }
  }
  const out = new Map();
  for (const [d, dayMap] of byDay) out.set(d, [...dayMap.values()]);
  return out;
}
function rowsInRange(byDay, from, to) {
  const out = [];
  for (const [d, dayRows] of byDay) {
    if (d >= from && d <= to) out.push(...dayRows);
  }
  return out;
}

// Doanh thu Bán buôn/Bán lẻ/Lãi gộp — domain `doanhthu_nganhhang` khoá
// MaThucThe (1 dòng/siêu thị/NGÀNH HÀNG/ngày, KHÔNG phải 1 dòng/siêu thị)
// — cộng dồn theo STK_ID (bỏ DEPT_ID) ở đây mới ra đúng 1 dòng/siêu thị.
function sumNganhHangByStk(rows) {
  const byStk = new Map();
  for (const row of rows) {
    // Bản 10.89 — SỬA LỖI THẬT: cột STK_ID trong `Dimensions` của VIEW
    // nguồn `V_HCRC_DOANHTHU_NGANHHANG` KHÔNG RTRIM (lưu nguyên dạng
    // CHAR có đệm khoảng trắng, vd "12171       ") — khác hẳn STK_ID dùng
    // làm entityCode của domain `doanhthu_chinhanh` (đã gọn sẵn qua ETL).
    // KHÔNG trim ở đây khiến remapRowsToDiem() không khớp được BẤT KỲ mã
    // kho nào với danh sách ở "Ánh xạ Điểm - STK_ID" (đã gọn), khiến toàn
    // bộ DT bán buôn/bán lẻ/Lãi gộp ra 0 dù VIEW nguồn có đủ dữ liệu thật.
    const stkId = row.dimensions && row.dimensions.STK_ID && row.dimensions.STK_ID.trim();
    if (!stkId) continue;
    let acc = byStk.get(stkId);
    if (!acc) { acc = {}; byStk.set(stkId, acc); }
    const m = row.measures || {};
    for (const key of NGANHHANG_MEASURE_KEYS) acc[key] = (acc[key] || 0) + (m[key] || 0);
  }
  return byStk;
}
function remapStkMeasuresToMaDiem(byStk, diemMapping) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, measures]) => ({ entityCode: stkId, dimensions: {}, measures }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, false);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, r.measures || {});
  return out;
}

// giaodich_chinhanh khoá BU_ID (1 mã Điểm = ĐÚNG 1 BU_ID, khác STK_ID có
// thể nhiều mã/mã Điểm) — dịch tay, KHÔNG qua remapRowsToDiem (hàm đó chỉ
// hiểu đúng kiểu danh sách STK cũ/mới).
function sumTransactionsByBuId(rows) {
  const byBu = new Map();
  for (const row of rows) {
    const buId = row.entityCode;
    if (!buId) continue;
    byBu.set(buId, (byBu.get(buId) || 0) + ((row.measures && row.measures.SoGiaoDich) || 0));
  }
  return byBu;
}
function remapBuToMaDiem(byBu, buIdLookup) {
  const out = new Map();
  for (const [buId, soGiaoDich] of byBu) {
    const maDiem = buIdLookup.get(buId);
    if (!maDiem) continue;
    out.set(maDiem, (out.get(maDiem) || 0) + soGiaoDich);
  }
  return out;
}

// targetDomain (bản 10.90, THAM SỐ thay vì hằng số cố định — theo yêu cầu
// người dùng, tách 2 báo cáo HCRC/LĐTĐ dùng CHUNG runner này, chỉ khác
// nguồn Chỉ tiêu) — mặc định TARGET_DOMAIN ('sales-targets-hcrc') nếu gọi
// không truyền (KHÔNG đổi hành vi nơi khác chưa cập nhật lời gọi).
async function fetchTargetsByMaDiem(pool, fromPeriod, toPeriod, targetDomain = TARGET_DOMAIN) {
  const rows = await runSalesTargetsBlockRange(pool, targetDomain, fromPeriod, toPeriod);
  const byMaDiem = new Map();
  for (const row of rows) byMaDiem.set(row.entityCode, row);
  return byMaDiem;
}

// Bản 10.93 — SỬA LỖI THẬT (người dùng chỉ ra, ảnh chụp cột "Số lượng
// nhân sự" luôn = 0 ở MỌI siêu thị): TRƯỚC ĐÂY đếm theo `app.UserStoreAccess`
// — bảng này CHỈ có dòng khi Admin CHỦ ĐỘNG giới hạn phạm vi xem dữ liệu
// của 1 người (xem rp-db/schema.sql) — MẶC ĐỊNH mọi tài khoản "xem được
// toàn bộ" (KHÔNG có dòng nào trong bảng này), nên bảng gần như luôn
// RỖNG trong thực tế, không phản ánh đúng "nhân viên nào thuộc siêu thị
// nào" như người dùng cần. Đổi sang dùng ĐÚNG nguồn người dùng gợi ý —
// `app.Users.Department` (đồng bộ TỰ ĐỘNG từ VPDT/HCRC Workspace, LUÔN có
// dữ liệu, không phụ thuộc Admin có giới hạn quyền hay chưa) + suy ra Mã
// Điểm qua `resolveMaDiemForDepartment()` (lib/departmentStoreMapping.js
// — ĐÃ DÙNG SẴN cho gợi ý phạm vi ở trang "Người dùng", rp-server/routes/users.js).
// Bản 10.95 — SỬA LỖI THẬT (người dùng xác nhận trực tiếp): TRƯỚC ĐÂY lọc
// `IsActive = 1` — SAI Ý NGHĨA. `IsActive` chỉ là "có được CẤP QUYỀN ĐĂNG
// NHẬP xem báo cáo hay không" (admin bấm "Mở khoá" tay — xem
// routes/users.js:POST /sync) — HOÀN TOÀN KHÁC "có đang làm việc hay
// không". Theo xác nhận của người dùng: "ai tôi cho xem báo cáo tôi mới
// active, mặc định tài khoản CHƯA active" — nghĩa là TUYỆT ĐẠI ĐA SỐ nhân
// viên siêu thị (không cần đăng nhập xem báo cáo) sẽ MÃI MÃI
// `IsActive = 0` dù vẫn đang làm việc bình thường — lọc theo cờ này sẽ
// luôn đếm ra GẦN NHƯ 0.
//
// SỬA: đổi sang lọc theo "còn xuất hiện trong danh bạ HWS ở LẦN ĐỒNG BỘ
// GẦN NHẤT" — `LastSyncedAt` được ghi lại đúng SYSUTCDATETIME() cho MỌI
// tài khoản còn thấy trong danh bạ ở MỖI lần đồng bộ (xem routes/users.js
// :POST /sync, vòng lặp `activeItems` — chạy trước mọi kiểm tra IsActive,
// không phân biệt đã mở khoá hay chưa). Tài khoản đã nghỉ việc (không còn
// trong danh bạ ở lần đồng bộ gần nhất) sẽ KHÔNG được cập nhật
// LastSyncedAt nữa -> tự động loại khỏi phép đếm này mà không cần đụng gì
// tới IsActive. So sánh với MAX(LastSyncedAt) thay vì hardcode "trong N
// ngày gần đây" — đồng bộ ở trang "Người dùng" là BẤM TAY, không chạy
// định kỳ cố định (xem lib/hcrcWorkspaceClient.js), nên không có chu kỳ
// thời gian cố định nào để giả định.
async function fetchStaffCountByMaDiem() {
  const rpPool = await getPool('RP');
  const result = await rpPool.request().query(`
    SELECT Id, Department FROM app.Users
    WHERE AuthSource = 'hcrcWorkspace'
      AND LastSyncedAt >= DATEADD(MINUTE, -5, (SELECT MAX(LastSyncedAt) FROM app.Users WHERE AuthSource = 'hcrcWorkspace'))
  `);
  const byMaDiem = new Map();
  for (const r of result.recordset) {
    const maDiem = await resolveMaDiemForDepartment(r.Department);
    if (!maDiem) continue;
    // 1 Department có thể gộp NHIỀU Mã Điểm, cách nhau bởi dấu phẩy (bản
    // 10.97, theo yêu cầu người dùng — vd 1 bộ phận phụ trách CHUNG 2 siêu
    // thị liền kề, KHÔNG tách riêng theo từng điểm) — CỘNG ĐỦ số người đó
    // vào MỖI mã trong danh sách (không chia đều), vì cùng 1 người vẫn tính
    // là nhân sự phục vụ CẢ 2 điểm, không phải 1 nửa người mỗi điểm.
    for (const code of maDiem.split(',').map(s => s.trim()).filter(Boolean)) {
      byMaDiem.set(code, (byMaDiem.get(code) || 0) + 1);
    }
  }
  return byMaDiem;
}

function buildColumns(labels) {
  return [
    { key: 'stt', label: 'TT' },
    { key: 'maQLKV', label: 'Mã QLKV' },
    { key: 'maDiem', label: 'Mã điểm' },
    { key: 'stkId', label: 'Mã ST/CH' },
    { key: 'tenSieuThi', label: 'Tên siêu thị/cửa hàng' },
    { key: 'chain', label: 'Nhóm chuỗi' },
    { key: 'dienTich', label: 'Diện tích (m2)' },
    { key: 'diaDiem', label: 'Địa điểm' },
    { key: 'nhanSu', label: 'Số lượng nhân sự' },

    { key: 'soBillDay', label: 'Số Bill' },
    { key: 'dtBanBuonDay', label: 'DT bán buôn' },
    { key: 'dtBanLeDay', label: 'DT bán lẻ' },
    { key: 'tongCongDay', label: 'Tổng cộng' },
    { key: 'laiGopDay', label: 'Lãi gộp' },
    { key: 'tyLeLaiGopDay', label: 'Tỉ lệ lãi gộp/DT', format: 'percent' },
    { key: 'dtBqBillDay', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Day', label: 'DT bán lẻ BQ/m2' },
    { key: 'khDoanhThuThang', label: 'Kế hoạch DT (tháng)' },
    { key: 'khBillThang', label: 'Kế hoạch Bill (tháng)' },
    { key: 'khTbGioHangThang', label: 'Kế hoạch TB giỏ hàng (tháng)' },
    { key: 'hoanThanhDTLuyKeThang', label: 'Hoàn thành DT luỹ kế (tháng)', format: 'percent' },
    { key: 'duKienHoanThanh', label: 'Dự kiến hoàn thành kế hoạch (tháng)', format: 'percent' },

    { key: 'soBillMonth', label: 'Số Bill' },
    { key: 'dtBanBuonMonth', label: 'DT bán buôn' },
    { key: 'dtBanLeMonth', label: 'DT bán lẻ' },
    { key: 'tongCongMonth', label: 'Tổng cộng' },
    { key: 'laiGopMonth', label: 'Lãi gộp' },
    { key: 'tyLeLaiGopMonth', label: 'Tỉ lệ lãi gộp/DT', format: 'percent' },
    { key: 'dtBqBillMonth', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Month', label: 'DT bán lẻ BQ/m2' },

    { key: 'soBillYear', label: 'Số Bill' },
    { key: 'dtBanBuonYear', label: 'DT bán buôn' },
    { key: 'dtBanLeYear', label: 'DT bán lẻ' },
    { key: 'tongCongYear', label: 'Tổng cộng' },
    { key: 'dtBqBillYear', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Year', label: 'DT bán lẻ BQ/m2' },

    { key: 'khDoanhThuNam', label: 'KH doanh thu' },
    { key: 'tyLeHoanThanhNam', label: '% hoàn thành', format: 'percent' }
  ];
}

function buildColumnGroups(labels) {
  return [
    {
      label: `Ngày ${labels.day}`, color: 'green',
      keys: ['soBillDay', 'dtBanBuonDay', 'dtBanLeDay', 'tongCongDay', 'laiGopDay', 'tyLeLaiGopDay', 'dtBqBillDay', 'dtBqM2Day',
        'khDoanhThuThang', 'khBillThang', 'khTbGioHangThang', 'hoanThanhDTLuyKeThang', 'duKienHoanThanh']
    },
    {
      label: `Tháng ${labels.month}`, color: 'blue',
      keys: ['soBillMonth', 'dtBanBuonMonth', 'dtBanLeMonth', 'tongCongMonth', 'laiGopMonth', 'tyLeLaiGopMonth', 'dtBqBillMonth', 'dtBqM2Month']
    },
    {
      label: `Năm ${labels.year}`, color: 'orange',
      keys: ['soBillYear', 'dtBanBuonYear', 'dtBanLeYear', 'tongCongYear', 'dtBqBillYear', 'dtBqM2Year']
    },
    { label: 'KH luỹ kế năm', color: 'red', keys: ['khDoanhThuNam', 'tyLeHoanThanhNam'] }
  ];
}

// Nhóm "I. CHUỖI MART"/"II. CHUỖI MINIMART"/"III. CHUỖI KHO" (thứ tự CỐ
// ĐỊNH — bản 10.87/10.99, trước đây CHỈ dùng cho "Xuất Excel theo tháng",
// bản 11.4 ÁP DỤNG THÊM cho báo cáo xem trên web/Xuất Excel/Xuất PDF
// thường — theo yêu cầu người dùng "cả 3 nơi luôn — web, Excel, PDF") —
// siêu thị/kho có `chain` khác/rỗng dồn vào 1 nhóm cuối "CHƯA PHÂN NHÓM"
// (hiếm, chỉ khi admin chưa khai LoaiChuoi VÀ domain nguồn cũng không có
// — xem lib/diemStkMapping.js).
const GROUP_ORDER = ['MART', 'MINIMART', 'KHO'];
const SECTION_COLORS = { MART: '174A7C', MINIMART: '2E7D32', KHO: '8A5A00' };
const OTHER_SECTION_COLOR = '6B5B95';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function groupRowsByChain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.chain && GROUP_ORDER.includes(row.chain) ? row.chain : '__other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const orderedKeys = [...GROUP_ORDER.filter(k => groups.has(k)), ...(groups.has('__other') ? ['__other'] : [])];
  return orderedKeys.map(key => ({ key, rows: groups.get(key) }));
}

function sumField(rows, key) { return rows.reduce((s, r) => s + (r[key] || 0), 0); }

// Dòng "TỔNG MART"/"TỔNG MINIMART"/"TỔNG <tên báo cáo>" — CỘNG DỒN đúng
// các đo lường thô của nhóm rồi TÍNH LẠI các tỉ lệ/bình quân từ đúng tổng
// đó (KHÔNG cộng trung bình cộng các tỉ lệ từng dòng — sai số học).
function buildSubtotalRow(groupRows, label, isGrandTotal, elapsedDays, totalDaysInMonth) {
  const keys = [
    'soBillDay', 'dtBanBuonDay', 'dtBanLeDay', 'tongCongDay', 'laiGopDay',
    'khDoanhThuThang', 'khBillThang',
    'soBillMonth', 'dtBanBuonMonth', 'dtBanLeMonth', 'tongCongMonth', 'laiGopMonth',
    'soBillYear', 'dtBanBuonYear', 'dtBanLeYear', 'tongCongYear',
    'khDoanhThuNam', 'dienTich'
  ];
  const s = {};
  for (const k of keys) s[k] = sumField(groupRows, k);
  const projectedMonthRevenue = elapsedDays > 0 ? (s.tongCongMonth / elapsedDays) * totalDaysInMonth : null;

  return {
    tenSieuThi: label,
    dienTich: s.dienTich,
    soBillDay: s.soBillDay, dtBanBuonDay: s.dtBanBuonDay, dtBanLeDay: s.dtBanLeDay,
    tongCongDay: s.tongCongDay, laiGopDay: s.laiGopDay,
    tyLeLaiGopDay: pctOrNull(s.laiGopDay, s.tongCongDay),
    dtBqBillDay: divOrNull(s.dtBanLeDay, s.soBillDay),
    dtBqM2Day: divOrNull(s.dtBanLeDay, s.dienTich),
    khDoanhThuThang: s.khDoanhThuThang, khBillThang: s.khBillThang,
    khTbGioHangThang: divOrNull(s.khDoanhThuThang, s.khBillThang),
    hoanThanhDTLuyKeThang: pctOrNull(s.tongCongMonth, s.khDoanhThuThang),
    duKienHoanThanh: projectedMonthRevenue === null ? null : pctOrNull(projectedMonthRevenue, s.khDoanhThuThang),
    soBillMonth: s.soBillMonth, dtBanBuonMonth: s.dtBanBuonMonth, dtBanLeMonth: s.dtBanLeMonth,
    tongCongMonth: s.tongCongMonth, laiGopMonth: s.laiGopMonth,
    tyLeLaiGopMonth: pctOrNull(s.laiGopMonth, s.tongCongMonth),
    dtBqBillMonth: divOrNull(s.dtBanLeMonth, s.soBillMonth),
    dtBqM2Month: divOrNull(s.dtBanLeMonth, s.dienTich),
    soBillYear: s.soBillYear, dtBanBuonYear: s.dtBanBuonYear, dtBanLeYear: s.dtBanLeYear,
    tongCongYear: s.tongCongYear,
    dtBqBillYear: divOrNull(s.dtBanLeYear, s.soBillYear),
    dtBqM2Year: divOrNull(s.dtBanLeYear, s.dienTich),
    khDoanhThuNam: s.khDoanhThuNam,
    tyLeHoanThanhNam: pctOrNull(s.tongCongYear, s.khDoanhThuNam),
    __isSubtotal: true, __isGrandTotal: !!isGrandTotal
  };
}

// CỐT LÕI (KHÔNG kèm khối "TỔNG HỢP THEO LOẠI HÌNH" cuối sheet — đó là
// phần RIÊNG của "Xuất Excel theo tháng", xem
// doanhThuTongHopHcrcMonthlyExport.js:buildGroupedSheetRows() bọc thêm ở
// ngoài) — section header + dòng dữ liệu + dòng "TỔNG <nhóm>" cho từng
// nhóm, rồi dòng tổng toàn báo cáo (`grandTotalLabel`) ở cuối.
function buildGroupedRows(storeRows, elapsedDays, totalDaysInMonth, grandTotalLabel) {
  const groups = groupRowsByChain(storeRows);
  const out = [];
  groups.forEach((g, idx) => {
    const roman = ROMAN[idx] || String(idx + 1);
    const isOther = g.key === '__other';
    out.push({
      __isSectionHeader: true,
      __sectionLabel: `${roman}. ${isOther ? 'CHƯA PHÂN NHÓM' : `CHUỖI ${g.key}`}`,
      __sectionColor: isOther ? OTHER_SECTION_COLOR : SECTION_COLORS[g.key]
    });
    out.push(...g.rows);
    out.push(buildSubtotalRow(g.rows, `TỔNG ${isOther ? 'KHÁC' : g.key}`, false, elapsedDays, totalDaysInMonth));
  });
  out.push(buildSubtotalRow(storeRows, grandTotalLabel || 'Tổng cộng', true, elapsedDays, totalDaysInMonth));
  return out;
}

async function runDoanhThuTongHopHcrcReport(definition, filterValues) {
  const today = (filterValues && filterValues.eventDate) || vietnamTodayISO();

  const dayFrom = today, dayTo = today;
  const monthFrom = firstOfMonth(today), monthTo = today;
  const yearFrom = firstOfYear(today), yearTo = today;

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  const buIdLookup = buildBuIdLookup(diemMapping);
  // targetDomain (bản 10.90, theo yêu cầu người dùng) — báo cáo
  // bc-doanh-thu-tong-hop-ldtd khai definition.targetDomain =
  // 'sales-targets-ldtd' (Chỉ tiêu CỦA LÃNH ĐẠO TẬP ĐOÀN, khác HCRC tự
  // đặt) — không khai thì mặc định TARGET_DOMAIN ('sales-targets-hcrc'),
  // giữ đúng hành vi cũ cho bc-doanh-thu-tong-hop-hcrc.
  const targetDomain = definition.targetDomain || TARGET_DOMAIN;

  // Diện tích/Nhóm chuỗi là thông tin TĨNH (không đổi theo ngày) — chỉ cần
  // lấy 1 lần, dùng khoảng rộng nhất (cả năm) để tối đa khả năng có dữ liệu.
  //
  // Bản 11.4 — xem chú thích đầy đủ ở đầu file: fetch RAW ROWS domain
  // `doanhthu_nganhhang`/`giaodich_chinhanh` CHỈ 1 LẦN (khoảng rộng nhất:
  // đầu năm -> hôm nay) rồi GOM NHÓM THEO NGÀY, CẮT LẠI trong bộ nhớ cho
  // từng khối Ngày/Tháng/Năm — KHÔNG còn gọi DWH riêng 3 lần/domain nữa.
  const [areaInfo, nganhHangRawRows, transactionRawRows, chinhanhRawRows] = await Promise.all([
    fetchAreaByMaDiem(dwhPool, diemMapping, yearFrom, yearTo),
    fetchRawRows(dwhPool, NGANHHANG_DOMAIN, yearFrom, yearTo),
    fetchRawRows(dwhPool, TRANSACTION_DOMAIN, yearFrom, yearTo),
    fetchRawRows(dwhPool, AREA_DOMAIN, yearFrom, yearTo)
  ]);
  const nganhHangByDay = bucketByDay(nganhHangRawRows);
  const transactionByDay = bucketByDay(transactionRawRows);
  // Bản 11.8 — xem chú thích đầy đủ ở fetchAreaByMaDiem()/sumLaiGopByStk()
  // phía trên: Lãi gộp đổi sang domain `doanhthu_chinhanh` (ĐÚNG domain
  // "Doanh thu cuối ngày" dùng), gom theo ngày RIÊNG khỏi fetchAreaByMaDiem()
  // (hàm đó gộp SẴN cả khoảng thành 1 dòng/mã Điểm, dùng cho dienTich/chain
  // TĨNH — không tách được theo Ngày/Tháng).
  const chinhanhByDay = bucketByDay(chinhanhRawRows);

  const dayRev = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, dayFrom, dayTo)), diemMapping);
  const monthRev = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, monthFrom, monthTo)), diemMapping);
  const yearRev = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, yearFrom, yearTo)), diemMapping);

  const dayTx = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(transactionByDay, dayFrom, dayTo)), buIdLookup);
  const monthTx = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(transactionByDay, monthFrom, monthTo)), buIdLookup);
  const yearTx = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(transactionByDay, yearFrom, yearTo)), buIdLookup);

  const dayLaiGop = remapLaiGopToMaDiem(sumLaiGopByStk(rowsInRange(chinhanhByDay, dayFrom, dayTo)), diemMapping);
  const monthLaiGop = remapLaiGopToMaDiem(sumLaiGopByStk(rowsInRange(chinhanhByDay, monthFrom, monthTo)), diemMapping);

  // Kế hoạch DT/Bill hiện ở khối Ngày = kế hoạch CẢ THÁNG (đã xác nhận với
  // người dùng) -> CHỈ cần 2 khối: tháng (dùng chung cho cả "Ngày" lẫn
  // "Tháng") và năm (KH luỹ kế năm).
  //
  // Bản 11.8 — SỬA LỖI THẬT (người dùng chỉ ra "Kế hoạch DT (tháng)" ra số
  // QUÁ NHỎ, khiến "% Hoàn thành luỹ kế"/"Dự kiến hoàn thành" vọt lên
  // 1000%+ — "hệ thống đang lấy theo từng ngày là sai", "KH kinh doanh
  // cũng lấy cộng dồn tháng đến thời điểm lấy báo cáo"): domain
  // `sales-targets-ldtd`/`sales-targets-hcrc` lưu Chỉ tiêu THEO TỪNG NGÀY
  // (1 dòng/ngày/siêu thị, cột `PeriodMonth` lưu ĐÚNG 1 ngày cụ thể —
  // xem chú thích đầy đủ ở `etl/lib/salesTargetsImport.js`, mục định
  // dạng "ldtd-daily"/"hcrc-daily": *"'Chỉ tiêu THEO NGÀY' nghĩa là
  // PeriodMonth lưu ĐÚNG 1 NGÀY CỤ THỂ thay vì luôn là ngày 1 đầu
  // tháng"*) — ĐÚNG NHƯ "Báo cáo doanh thu cuối ngày" đã làm từ trước
  // (`scripts/seedLdtdHcrcReports.js`, khối `target` khai
  // `targetGranularity: 'day'`, xem `lib/compositeReportRunner.js`).
  //
  // Bản 10.94 (TRƯỚC ĐÂY, SAI) hiểu NHẦM domain này lưu 1 DÒNG/THÁNG (y
  // hệt domain Chỉ tiêu "generic" cũ) — gọi
  // `fetchTargetsByMaDiem(firstOfMonth(today), firstOfMonth(today))` chỉ
  // khớp ĐÚNG 1 NGÀY DUY NHẤT (ngày 1 đầu tháng) trong WHERE PeriodMonth
  // BETWEEN, bỏ sót toàn bộ các ngày 2..hôm nay — "Kế hoạch DT (tháng)"
  // vì vậy chỉ ra ĐÚNG giá trị của 1 ngày (01 đầu tháng), không phải cả
  // tháng, khiến mọi tỉ lệ hoàn thành tính từ số đó bị TĂNG VỌT sai lệch.
  // Khối năm cũng bị ảnh hưởng tương tự nhưng NHẸ HƠN (khoảng
  // `firstOfYear..firstOfMonth` vẫn khớp đủ các tháng ĐÃ QUA, chỉ thiếu
  // đúng phần NGÀY 2..hôm nay của THÁNG HIỆN TẠI).
  //
  // SỬA: đổi khoảng truyền vào thành ĐÚNG [đầu kỳ, HÔM NAY] — khớp đúng
  // "cộng dồn đến thời điểm lấy báo cáo" người dùng yêu cầu, và ĐÚNG cách
  // "Doanh thu cuối ngày" đã tra domain daily-granularity này từ đầu.
  // `fetchTargetsByMaDiem`/`runSalesTargetsBlockRange` ĐÃ SẴN CÓ cơ chế
  // cộng dồn nhiều kỳ trong 1 khoảng (xem
  // lib/salesTargetsReader.js:aggregateTargetRowsByEntity), chỉ cần đổi
  // khoảng truyền vào, không cần domain/bảng mới nào.
  //
  // SỬA TIẾP bản 11.20 (theo yêu cầu người dùng, làm rõ lại ý nghĩa "Kế
  // hoạch tháng" — KHÁC HẲN "Thực hiện"): "Thực hiện" (doanh thu/số Bill/
  // số giao dịch...) chỉ có dữ liệu THẬT tới hôm nay nên BẮT BUỘC cộng dồn
  // đến hôm nay — còn "Kế hoạch" là file target đã upload SẴN cho MỌI
  // ngày trong tháng (kể cả các ngày CÒN LẠI sau hôm nay), nên "Kế hoạch
  // tháng" phải cộng ĐỦ CẢ THÁNG (1 → ngày cuối tháng), không dừng ở hôm
  // nay — nếu không, "Kế hoạch" bị thiếu đúng phần những ngày CHƯA TỚI,
  // khiến "Hoàn thành luỹ kế"/"Dự kiến hoàn thành" so sánh lệch chuẩn (so
  // với 1 "kế hoạch-tới-giờ" đang nhỏ dần so với kế hoạch CẢ THÁNG thật).
  // CHỈ đổi khối THÁNG — khối NĂM (yearTarget) GIỮ NGUYÊN cộng dồn tới hôm
  // nay (người dùng không yêu cầu đổi, và "cả năm" tới hôm nay vẫn còn
  // nhiều tháng chưa qua/chưa có file target tương lai xa để cộng đủ).
  const [monthTarget, yearTarget] = await Promise.all([
    fetchTargetsByMaDiem(dwhPool, firstOfMonth(today), lastOfMonth(today), targetDomain),
    fetchTargetsByMaDiem(dwhPool, firstOfYear(today), today, targetDomain)
  ]);
  const staffCount = await fetchStaffCountByMaDiem();

  // __storeScope (bản 8.51, app.UserStoreAccess — mảng MaDiem, hoặc null =
  // "Toàn bộ") — SERVER tự gắn theo người đang gọi (xem routes/reports.js),
  // GHI ĐÈ bất kỳ giá trị client gửi lên — mirror ĐÚNG cách
  // lib/compositeReportRunner.js áp dụng, báo cáo này đọc entityCode =
  // ĐÚNG mã Điểm (không qua BU_ID/STK_ID thô) nên áp thẳng không cần dò
  // kiểu entity như compositeReportRunner.js phải làm (báo cáo đó dùng
  // chung code cho nhiều domain có entityCode khác kiểu).
  const storeScope = Array.isArray(filterValues && filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;

  const elapsedDays = dayOfMonth(today);
  const totalDaysInMonth = daysInMonth(today);

  const rows = [];
  for (const [maDiem, info] of diemMapping) {
    if (storeScope && !storeScope.has(maDiem)) continue;
    // Bản 11.4 — dayRev/monthRev/yearRev (từ remapStkMeasuresToMaDiem) và
    // dayTx/monthTx/yearTx (từ remapBuToMaDiem) giờ trả về đúng SHAPE PHẲNG
    // (measures thẳng/số Bill thẳng), KHÁC shape {dimensions,measures} cũ.
    const dR = dayRev.get(maDiem) || {};
    const mR = monthRev.get(maDiem) || {};
    const yR = yearRev.get(maDiem) || {};
    const aR = areaInfo.get(maDiem) || { dimensions: {} };
    const mTarget = monthTarget.get(maDiem) || {};
    const yTarget = yearTarget.get(maDiem) || {};

    // Casing của measures/dimensions PHẢI khớp CHÍNH XÁC đúng chuỗi trong
    // measureColumns/dimensionColumns lúc tạo job đồng bộ — domain
    // `doanhthu_chinhanh` dùng camelCase ('dienTich'/'chain', xem
    // etl/scripts/seedLdtdHcrcSync.js), domain `doanhthu_nganhhang` dùng
    // PascalCase ('DoanhThu'/'DoanhThuBanLe'/..., xem
    // etl/scripts/seedNganhHangSync.js) — 2 domain KHÁC NHAU, KHÔNG tự ý
    // đổi casing cho giống nhau.
    const dienTich = aR.dimensions.dienTich || null;
    // Bản 10.86 — "Địa điểm" CHƯA có domain nào cung cấp (bỏ VIEW mới
    // doanhthu_tonghop_hcrc), TẠM để trống — xem ghi chú đầu file.
    const diaDiem = null;
    const chain = info.loaiChuoi || aR.dimensions.chain || null;

    // Tổng cộng (bản 10.90, theo ảnh mẫu người dùng gửi — công thức ghi rõ
    // "5=3+4") — TÍNH TRỰC TIẾP = DT bán buôn + DT bán lẻ, KHÔNG lấy
    // thẳng measures.DoanhThu nữa (đảm bảo luôn khớp tuyệt đối theo đúng
    // công thức, dù DoanhThu nguồn có thể lệch nếu domain tính thêm
    // thành phần khác ngoài buôn/lẻ).
    const dtBanLeDay = dR.DoanhThuBanLe || 0;
    const dtBanBuonDay = dR.DoanhThuBanBuon || 0;
    const tongCongDay = dtBanBuonDay + dtBanLeDay;
    // Bản 11.8 — Lãi gộp đổi sang domain `doanhthu_chinhanh` (dayLaiGop/
    // monthLaiGop), KHÔNG CÒN lấy dR.LaiGop/mR.LaiGop (domain
    // `doanhthu_nganhhang`) — xem chú thích đầy đủ ở sumLaiGopByStk().
    const laiGopDay = dayLaiGop.get(maDiem) || 0;
    const soBillDay = dayTx.get(maDiem) || 0;

    const dtBanLeMonth = mR.DoanhThuBanLe || 0;
    const dtBanBuonMonth = mR.DoanhThuBanBuon || 0;
    const tongCongMonth = dtBanBuonMonth + dtBanLeMonth;
    const laiGopMonth = monthLaiGop.get(maDiem) || 0;
    const soBillMonth = monthTx.get(maDiem) || 0;

    const dtBanLeYear = yR.DoanhThuBanLe || 0;
    const dtBanBuonYear = yR.DoanhThuBanBuon || 0;
    const tongCongYear = dtBanBuonYear + dtBanLeYear;
    const soBillYear = yearTx.get(maDiem) || 0;

    const khDoanhThuThang = typeof mTarget.ChiTieuDoanhThu === 'number' ? mTarget.ChiTieuDoanhThu : null;
    const khBillThang = typeof mTarget.ChiTieuGiaoDich === 'number' ? mTarget.ChiTieuGiaoDich : null;
    const khDoanhThuNam = typeof yTarget.ChiTieuDoanhThu === 'number' ? yTarget.ChiTieuDoanhThu : null;

    const projectedMonthRevenue = elapsedDays > 0 ? (tongCongMonth / elapsedDays) * totalDaysInMonth : null;

    rows.push({
      maQLKV: info.maQLKV || null,
      maDiem,
      stkId: (info.maStkMoi || []).join(', ') || null,
      tenSieuThi: info.tenSieuThi || null,
      chain,
      dienTich,
      diaDiem,
      nhanSu: staffCount.get(maDiem) || 0,

      soBillDay, dtBanBuonDay, dtBanLeDay, tongCongDay, laiGopDay,
      tyLeLaiGopDay: pctOrNull(laiGopDay, tongCongDay),
      dtBqBillDay: divOrNull(dtBanLeDay, soBillDay),
      dtBqM2Day: divOrNull(dtBanLeDay, dienTich),
      khDoanhThuThang, khBillThang,
      khTbGioHangThang: divOrNull(khDoanhThuThang, khBillThang),
      hoanThanhDTLuyKeThang: pctOrNull(tongCongMonth, khDoanhThuThang),
      duKienHoanThanh: projectedMonthRevenue === null ? null : pctOrNull(projectedMonthRevenue, khDoanhThuThang),

      soBillMonth, dtBanBuonMonth, dtBanLeMonth, tongCongMonth, laiGopMonth,
      tyLeLaiGopMonth: pctOrNull(laiGopMonth, tongCongMonth),
      dtBqBillMonth: divOrNull(dtBanLeMonth, soBillMonth),
      dtBqM2Month: divOrNull(dtBanLeMonth, dienTich),

      soBillYear, dtBanBuonYear, dtBanLeYear, tongCongYear,
      dtBqBillYear: divOrNull(dtBanLeYear, soBillYear),
      dtBqM2Year: divOrNull(dtBanLeYear, dienTich),

      khDoanhThuNam,
      tyLeHoanThanhNam: pctOrNull(tongCongYear, khDoanhThuNam)
    });
  }

  const labels = { day: today, month: today.slice(0, 7), year: today.slice(0, 4) };
  const columns = describeColumns(buildColumns(labels));

  // Bản 11.4 (theo yêu cầu người dùng — "Cả 3 nơi luôn — web, Excel, PDF")
  // — ÁP DỤNG nhóm "I. CHUỖI MART"/"II. CHUỖI MINIMART"/"III. CHUỖI KHO" +
  // dòng "TỔNG <nhóm>"/"Tổng cộng" cho CẢ báo cáo xem trên web lẫn Xuất
  // Excel/Xuất PDF (routes/reports.js:/run và /export CÙNG gọi hàm này) —
  // trước đây CHỈ "Xuất Excel theo tháng" (doanhThuTongHopHcrcMonthlyExport.js)
  // có nhóm này. assignSttIfPresent() PHẢI chạy SAU buildGroupedRows (trên
  // kết quả đã nhóm) — computeSttValues() đã sẵn xử lý đúng
  // __isSubtotal/__isSectionHeader (bỏ trống TT, reset/không reset đúng
  // quy tắc, xem lib/reportCellFormat.js).
  const groupedRows = buildGroupedRows(rows, elapsedDays, totalDaysInMonth);
  assignSttIfPresent(groupedRows, columns);

  return {
    columns,
    rows: groupedRows,
    columnGroups: buildColumnGroups(labels),
    columnSuperGroups: null
  };
}

// Xuất lại các hằng số/hàm phụ trợ (bản 10.87, MỞ RỘNG bản 11.4) — dùng
// CHUNG ở lib/doanhThuTongHopHcrcMonthlyExport.js (xuất Excel 1 sheet/ngày
// cho cả tháng) để KHÔNG chép lại logic domain/công thức tính/nhóm (dễ
// lệch số nếu sửa 1 nơi quên sửa nơi kia) — bản 11.4 gộp thêm các hàm
// fetch-once-bucket-by-day (`fetchRawRows`/`bucketByDay`/`rowsInRange`/
// `sumNganhHangByStk`/`remapStkMeasuresToMaDiem`/`sumTransactionsByBuId`/
// `remapBuToMaDiem`) VÀ các hàm nhóm Mart/MiniMart/Kho
// (`groupRowsByChain`/`sumField`/`buildSubtotalRow`) — TRƯỚC ĐÂY định
// nghĩa RIÊNG ở doanhThuTongHopHcrcMonthlyExport.js, giờ gộp về ĐÂY làm
// nguồn sự thật duy nhất.
module.exports = {
  runDoanhThuTongHopHcrcReport,
  AREA_DOMAIN, NGANHHANG_DOMAIN, TRANSACTION_DOMAIN, TARGET_DOMAIN, NGANHHANG_MEASURE_KEYS,
  vietnamTodayISO, firstOfMonth, firstOfYear, daysInMonth, dayOfMonth, lastOfMonth, divOrNull, pctOrNull,
  buildColumns, buildColumnGroups,
  fetchTargetsByMaDiem, fetchStaffCountByMaDiem,
  toISODate, fetchRawRows, bucketByDay, rowsInRange,
  sumNganhHangByStk, remapStkMeasuresToMaDiem, sumTransactionsByBuId, remapBuToMaDiem,
  sumLaiGopByStk, remapLaiGopToMaDiem,
  GROUP_ORDER, SECTION_COLORS, OTHER_SECTION_COLOR, ROMAN,
  groupRowsByChain, sumField, buildSubtotalRow, buildGroupedRows
};
