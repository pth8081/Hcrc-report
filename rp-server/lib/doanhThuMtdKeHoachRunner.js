// lib/doanhThuMtdKeHoachRunner.js — SourceType='doanhThuMtdKeHoach': báo
// cáo "Theo dõi doanh thu MTD theo kế hoạch" (2/4 báo cáo "Báo cáo vận
// hành" mới, theo yêu cầu người dùng — xem bc-doanhthu-mtd-ke-hoach.md).
//
// 3 ReportCatalog RIÊNG dùng CHUNG file này, khác nhau ĐÚNG 1 field
// `definition.loaiSieuThi` ('ALL'|'LFL'|'NSO') — xem
// scripts/seedDoanhThuMtdKeHoachReports.js. KHÔNG dùng SourceType=
// 'composite' — composite KHÔNG có cơ chế "chỉ lấy entity thuộc 1 tập hợp
// ngoài" (LFL/NSO, xem etl.NsoStores) SAU KHI đã remap theo mã Điểm, cùng
// lý do lib/nganhHangBrgRunner.js tự viết runner riêng (xem đầu file đó).
//
// NGUỒN DỮ LIỆU:
//   - "Thực đạt" — domain ĐÃ CÓ `doanhthu_chinhanh` (gốc, dùng CHUNG với 4
//     báo cáo "Doanh thu cuối ngày" LDTD/HCRC, xem seedLdtdHcrcReports.js)
//     — CỘNG DỒN đúng khoảng ngày yêu cầu, remap về mã Điểm qua
//     lib/diemStkMapping.js:remapRowsToDiem() (tái dùng NGUYÊN VẸN, KHÔNG
//     viết lại logic gộp theo Điểm).
//   - "Chỉ tiêu" — domain MỚI `sales-targets-doanhthu-mtd` (dwh.SalesTargets,
//     nhập qua etl-admin trang "Chỉ tiêu Doanh thu MTD theo kế hoạch", 1
//     số/siêu thị/tháng) — LUÔN lấy ĐỦ (các) tháng dương lịch CHỨA khoảng
//     ngày yêu cầu (vd chọn 1-17/11 → Chỉ tiêu CẢ THÁNG 11, KHÔNG chia tỷ
//     lệ theo số ngày) — khớp đúng cách "Target tháng" đã tính ở 4 báo cáo
//     Doanh thu cuối ngày hiện có (targetGranularity mặc định 'month' ở
//     lib/compositeReportRunner.js).
//   - LFL/NSO — `etl.NsoStores` (lib/nsoStores.js:loadNsoMaDiemSet(), ĐÃ CÓ
//     SẴN, dùng CHUNG với 2 báo cáo "Doanh thu theo ngành hàng").
//
// Mặc định khoảng ngày (CHƯA chọn bộ lọc) = ĐẦU THÁNG HIỆN TẠI → HÔM NAY
// (MTD thật) — xem resolveMtdRange(), KHÁC compositeReportRunner.js gốc
// (mặc định "hôm nay" 1 ngày, đúng cho báo cáo khác nhưng sai ý nghĩa MTD
// của báo cáo này).
//
// ⚠️ CHƯA LÀM (phạm vi "khung" — bổ sung sau nếu người dùng cần, xem
// phuong-an-4-bao-cao-van-hanh.md mục "2+4"): so với tháng trước (M-1),
// ước thực hiện cuối tháng theo trend, dòng "Tổng cộng". Bản này CHỈ có
// Chỉ tiêu/Thực đạt/% hoàn thành/% so cùng kỳ năm trước cho khoảng ngày
// đang xem.
const { getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity, resolveRequestedRange } = require('./compositeReportRunner');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, remapRowsToDiem } = require('./diemStkMapping');
const { loadNsoMaDiemSet } = require('./nsoStores');
const { assignSttIfPresent } = require('./reportCellFormat');

const ACTUAL_DOMAIN = 'doanhthu_chinhanh';
const TARGET_DOMAIN = 'sales-targets-doanhthu-mtd';

function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

// Giờ Việt Nam (UTC+7) — mirror compositeReportRunner.js:vietnamTodayISO()
// (hàm đó KHÔNG được export, viết lại y hệt — đủ đơn giản để không cần sửa
// file dùng chung chỉ để lộ thêm 1 hàm ngày tháng).
function vietnamTodayISO() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function shiftYearISO(dateStr, years) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

// formatDateVN (bản 11.35, theo yêu cầu người dùng — rà soát hiển thị
// khoảng ngày đang xem) — cơ chế token "{ngayBaoCao}" (lib/reportTitleDate.js)
// KHÔNG áp dụng đúng được ở đây vì mặc định khi KHÔNG chọn bộ lọc là MTD
// (đầu tháng → hôm nay, xem resolveMtdRange()), KHÁC mặc định "hôm nay" 1
// ngày của resolveRequestedRange() dùng cho token đó.
function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function resolveMtdRange(filterValues) {
  if (filterValues.eventDate && (filterValues.eventDate.from || filterValues.eventDate.to)) {
    return resolveRequestedRange(filterValues);
  }
  const today = vietnamTodayISO();
  return { from: firstOfMonth(today), to: today };
}

function pctOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function describeColumns() {
  return [
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'tenDiem', label: 'Tên điểm', width: 1.8 },
    { key: 'chiTieu', label: 'Chỉ tiêu (tháng)', width: 1.2 },
    { key: 'thucDat', label: 'Thực đạt (MTD)', width: 1.2 },
    { key: 'tyLeDat', label: '% hoàn thành', width: 1, format: 'percent' },
    { key: 'cungKyNamTruoc', label: '% so cùng kỳ năm trước', width: 1, format: 'percent' }
  ];
}

async function runDoanhThuMtdKeHoachReport(definition, filterValues = {}) {
  const loaiSieuThi = definition.loaiSieuThi || 'ALL';
  const pool = await getPool('DWH');
  const range = resolveMtdRange(filterValues);
  const fromPeriod = firstOfMonth(range.from);
  const toPeriod = firstOfMonth(range.to);
  const lastYearRange = { from: shiftYearISO(range.from, -1), to: shiftYearISO(range.to, -1) };

  const [diemMapping, nsoSet, actualRaw, lastYearRaw, targetRows] = await Promise.all([
    loadDiemStkMapping(),
    loadNsoMaDiemSet(),
    fetchAllReportRows(pool, { domain: ACTUAL_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: range }),
    fetchAllReportRows(pool, { domain: ACTUAL_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: lastYearRange }),
    runSalesTargetsBlockRange(pool, TARGET_DOMAIN, fromPeriod, toPeriod)
  ]);

  // remapRowsToDiem() trả ĐỦ 1 dòng/mã Điểm có khai "Ánh xạ Điểm - STK_ID"
  // (kể cả measures rỗng {} khi không có dòng doanh thu khớp kỳ này) — dùng
  // LUÔN kết quả này làm danh sách mã Điểm, KHÔNG lặp lại diemMapping lần
  // thứ 2 (tránh 2 nơi liệt kê mã Điểm lệch nhau).
  const actualByDiem = remapRowsToDiem(aggregateDailyRowsByEntity(actualRaw), diemMapping, false);
  const lastYearMap = new Map(
    remapRowsToDiem(aggregateDailyRowsByEntity(lastYearRaw), diemMapping, false).map(r => [r.entityCode, r])
  );
  const targetMap = new Map(targetRows.map(r => [r.entityCode, r]));

  const rows = [];
  for (const actualRow of actualByDiem) {
    const maDiem = actualRow.entityCode;
    const isNso = nsoSet.has(maDiem);
    if (loaiSieuThi === 'LFL' && isNso) continue;
    if (loaiSieuThi === 'NSO' && !isNso) continue;

    const target = targetMap.get(maDiem);
    const lastYear = lastYearMap.get(maDiem);

    const hasThucDat = Object.prototype.hasOwnProperty.call(actualRow.measures, 'DoanhThu');
    const thucDat = hasThucDat ? actualRow.measures.DoanhThu : null;
    const hasChiTieu = !!target && target.TrangThai !== 'DaDong' && target.ChiTieuDoanhThu !== undefined;
    const chiTieu = hasChiTieu ? target.ChiTieuDoanhThu : null;
    const hasLastYear = !!lastYear && Object.prototype.hasOwnProperty.call(lastYear.measures, 'DoanhThu');
    const lastYearThucDat = hasLastYear ? lastYear.measures.DoanhThu : null;

    if (!hasThucDat && !hasChiTieu) continue; // mã Điểm chưa có dữ liệu Thực đạt lẫn Chỉ tiêu trong kỳ này -- bỏ qua, không hiện dòng trống.

    rows.push({
      maDiem,
      tenDiem: actualRow.dimensions.tenSieuThi || `${maDiem} (chưa khai tên)`,
      chiTieu,
      thucDat,
      tyLeDat: (hasThucDat && hasChiTieu) ? pctOrNull(thucDat, chiTieu) : null,
      cungKyNamTruoc: (hasThucDat && hasLastYear) ? pctOrNull(thucDat, lastYearThucDat) : null
    });
  }

  rows.sort((a, b) => (a.tenDiem || '').localeCompare(b.tenDiem || '', 'vi'));
  const columns = describeColumns();
  assignSttIfPresent(rows, columns);

  const periodLabel = `MTD: ${formatDateVN(range.from)} – ${formatDateVN(range.to)}`;
  return { columns, rows, columnGroups: null, standaloneColumnColors: null, periodLabel };
}

module.exports = { runDoanhThuMtdKeHoachReport, describeColumns };
