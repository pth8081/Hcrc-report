// lib/dioNganhHangRunner.js — SourceType='dioNganhHang': báo cáo "DIO theo
// ngành hàng" (Days Inventory Outstanding — số ngày tồn kho hiện tại đủ
// dùng với tốc độ bán ra gần đây) — báo cáo ĐẦU TIÊN trong 4 báo cáo "Báo
// cáo vận hành" mới, theo yêu cầu người dùng ("Bạn triển khai theo thứ tự
// nhé, dựng lên khung các báo cáo" — xem phương án đã gửi
// "phuong-an-4-bao-cao-van-hanh.md" mục 3, ưu tiên 1: không cần khai báo
// tay, mọi nguồn đã có sẵn trong hệ thống).
//
// ⚠️ CÔNG THỨC DIO — GIẢ ĐỊNH, CHƯA CHỐT VỚI NGƯỜI DÙNG: không trích được
// công thức Ô THẬT từ file Excel mẫu "11_Cần nắm tháng 11.2026..." sheet
// "DIO MCH2" (chỉ đối chiếu vài dòng mẫu, khớp xấp xỉ) — dùng công thức
// CHUẨN ngành bán lẻ dưới đây, BÁO LẠI người dùng nếu số ra lệch nhiều so
// với file mẫu. Sửa công thức CHỈ cần sửa file này, KHÔNG đụng VIEW/ETL:
//
//   DIO (ngày) = Giá trị tồn hiện tại ÷ (Giá vốn bán ra TRUNG BÌNH 3 THÁNG
//                gần nhất ÷ 30)
//
// "3 tháng gần nhất" lấy xấp xỉ COGS_WINDOW_DAYS=90 ngày (KHÔNG chia đúng
// theo ranh giới tháng dương lịch — đơn giản hoá, sai lệch không đáng kể).
//
// NGUỒN DỮ LIỆU — ĐÃ CÓ SẴN, không cần khai báo tay:
//   - "Giá trị tồn" — domain MỚI `tonkho_gtri_nganhhang` (snapshot GHI ĐÈ,
//     KeepHistory=0 — xem etl/scripts/seedTonKhoGtriNganhHangSync.js + VIEW
//     "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Tồn kho Giá trị
//     theo Ngành hàng (DSMART16).sql").
//   - "Giá vốn bán ra" — domain ĐÃ CÓ `doanhthu_nganhhang" (xem "báo cáo
//     doanh thu-nhập hàng theo ngành hàng.md") — GiaVon/ngày = DoanhThu −
//     LaiGop (vì DoanhThu = AMOUNT+SURPLUS, LaiGop = SURPLUS, nên
//     DoanhThu−LaiGop = AMOUNT = đúng phần giá vốn — xem "giá vốn
//     dsmart.md" mục 8) — CỘNG DỒN COGS_WINDOW_DAYS ngày gần nhất, tái
//     dùng fetchAllReportRows()/aggregateDailyRowsByEntity() đã có ở
//     lib/compositeReportRunner.js, KHÔNG viết lại logic đọc/gộp
//     dwh.ReportFacts.
//
// Cả 2 domain cùng khoá entityCode "<STK_ID>_<DEPT_ID>" (đúng quy ước đã
// dùng ở domain doanhthu_nganhhang/nhaphang_nganhhang) — gộp theo mã ĐIỂM
// (không phải mã kho STK_ID thô, 1 Điểm có thể gồm nhiều kho) × ngành hàng,
// qua lib/diemStkMapping.js:buildStkIdLookup() — mirror đúng cách "báo cáo
// doanh thu-nhập hàng theo ngành hàng.md" mục 7 dùng hàm này cho báo cáo
// CHI TIẾT (khác remapRowsToDiem(), vì entityCode ở đây là GHÉP
// <STK_ID>_<DEPT_ID>, không phải STK_ID đơn).
//
// Báo cáo PHẲNG (không có dòng __isSectionHeader/__isSubtotal) — áp dụng
// được applyDisplayCap() (giới hạn hiển thị trên web, Excel vẫn xuất đủ —
// xem reportCellFormat.js).
const { getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { loadDiemStkMapping, buildStkIdLookup } = require('./diemStkMapping');
const { assignSttIfPresent, applyDisplayCap } = require('./reportCellFormat');

const COGS_WINDOW_DAYS = 90;
const DAYS_PER_MONTH = 30;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// entityCode = "<STK_ID>_<DEPT_ID>" — DEPT_ID theo danh mục ngành hàng cố
// định (xem "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 1), tách
// từ PHẢI SANG TRÁI để an toàn dù STK_ID có chứa "_" (chưa gặp thực tế,
// không giả định ngược lại).
function splitEntityCode(entityCode) {
  const idx = entityCode.lastIndexOf('_');
  if (idx === -1) return null;
  return { stkId: entityCode.slice(0, idx), deptId: entityCode.slice(idx + 1) };
}

// Domain snapshot (KeepHistory=0) — luôn ĐÚNG 1 dòng/entityCode, không cần
// ROW_NUMBER/lọc theo ngày như domain giữ lịch sử (xem
// lib/reportFactsHelpers.js cho các domain CÓ lịch sử).
async function fetchTonKhoGiaTriRows(pool) {
  const result = await pool.request().query(`
    SELECT EntityCode, Dimensions, Measures
    FROM dwh.ReportFacts
    WHERE Domain = 'tonkho_gtri_nganhhang'
  `);
  return result.recordset.map(r => ({
    entityCode: typeof r.EntityCode === 'string' ? r.EntityCode.trim() : r.EntityCode,
    dimensions: JSON.parse(r.Dimensions || '{}'),
    measures: r.Measures ? JSON.parse(r.Measures) : {}
  }));
}

function describeColumns() {
  return [
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'tenDiem', label: 'Tên điểm', width: 1.8 },
    { key: 'maNganhHang', label: 'Mã ngành', width: 0.8 },
    { key: 'tenNganhHang', label: 'Tên ngành', width: 1.6 },
    { key: 'giaTriTon', label: 'Giá trị tồn', width: 1.2 },
    { key: 'giaVonBinhQuanThang', label: 'Giá vốn BQ/tháng (3 tháng)', width: 1.4 },
    { key: 'dio', label: 'DIO (ngày)', width: 1 }
  ];
}

function toFilterSet(value) {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : [value];
  return arr.length ? new Set(arr.map(String)) : null;
}

async function runDioNganhHangReport(definition, filterValues = {}, pagination = {}) {
  const pool = await getPool('DWH');

  const [tonKhoRows, diemMapping] = await Promise.all([
    fetchTonKhoGiaTriRows(pool),
    loadDiemStkMapping()
  ]);
  const stkLookup = buildStkIdLookup(diemMapping);

  const to = todayISO();
  const from = daysAgoISO(COGS_WINDOW_DAYS);
  const salesRowsRaw = await fetchAllReportRows(
    pool,
    { domain: 'doanhthu_nganhhang', filters: [{ field: 'eventDate', type: 'dateRange' }] },
    { eventDate: { from, to } }
  );
  const salesByEntity = new Map(
    aggregateDailyRowsByEntity(salesRowsRaw).map(r => [r.entityCode, r.measures])
  );

  // Gộp theo (maDiem, DEPT_ID) — 1 mã Điểm có thể gồm nhiều mã kho STK_ID.
  const grouped = new Map();
  function upsert(maDiem, tenDiem, deptId, tenNganhHang) {
    const key = `${maDiem}|${deptId}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { maDiem, tenDiem, deptId, tenNganhHang: null, giaTriTon: 0, giaVon90Ngay: 0 };
      grouped.set(key, entry);
    }
    if (tenDiem && !entry.tenDiem) entry.tenDiem = tenDiem;
    if (tenNganhHang && !entry.tenNganhHang) entry.tenNganhHang = tenNganhHang;
    return entry;
  }

  for (const row of tonKhoRows) {
    const parts = splitEntityCode(row.entityCode);
    if (!parts) continue;
    const info = stkLookup.get(parts.stkId);
    if (!info) continue; // kho chưa khai "Ánh xạ Điểm - STK_ID" — bỏ qua, không đoán tên.
    const entry = upsert(info.maDiem, info.tenSieuThi, parts.deptId, row.dimensions.TenNganhHang);
    entry.giaTriTon += Number(row.measures.GiaTriTon) || 0;
  }
  for (const [entityCode, measures] of salesByEntity) {
    const parts = splitEntityCode(entityCode);
    if (!parts) continue;
    const info = stkLookup.get(parts.stkId);
    if (!info) continue;
    const doanhThu = Number(measures.DoanhThu) || 0;
    const laiGop = Number(measures.LaiGop) || 0;
    const entry = upsert(info.maDiem, info.tenSieuThi, parts.deptId, null);
    entry.giaVon90Ngay += (doanhThu - laiGop);
  }

  let rows = Array.from(grouped.values()).map(r => {
    const giaVonBinhQuanThang = (r.giaVon90Ngay / COGS_WINDOW_DAYS) * DAYS_PER_MONTH;
    const giaVonMoiNgay = giaVonBinhQuanThang / DAYS_PER_MONTH;
    const dio = giaVonMoiNgay > 0 ? r.giaTriTon / giaVonMoiNgay : null;
    return {
      maDiem: r.maDiem,
      tenDiem: r.tenDiem || `${r.maDiem} (chưa khai tên)`,
      maNganhHang: r.deptId,
      tenNganhHang: r.tenNganhHang || r.deptId,
      giaTriTon: Math.round(r.giaTriTon),
      giaVonBinhQuanThang: Math.round(giaVonBinhQuanThang),
      dio: dio === null ? null : Math.round(dio * 10) / 10
    };
  });

  const maDiemFilter = toFilterSet(filterValues.maDiem);
  if (maDiemFilter) rows = rows.filter(r => maDiemFilter.has(r.maDiem));
  const maNganhHangFilter = toFilterSet(filterValues.maNganhHang);
  if (maNganhHangFilter) rows = rows.filter(r => maNganhHangFilter.has(r.maNganhHang));

  rows.sort((a, b) => (a.tenDiem || '').localeCompare(b.tenDiem || '') || (a.maNganhHang || '').localeCompare(b.maNganhHang || ''));
  const columns = describeColumns();
  assignSttIfPresent(rows, columns);

  const { rows: cappedRows, warnings } = applyDisplayCap(rows, pagination, { entityLabel: 'dòng' });
  return { columns, rows: cappedRows, warnings, columnGroups: null, standaloneColumnColors: null };
}

module.exports = { runDioNganhHangReport, describeColumns };
