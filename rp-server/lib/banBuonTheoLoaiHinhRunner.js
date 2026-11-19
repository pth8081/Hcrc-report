// lib/banBuonTheoLoaiHinhRunner.js — SourceType='banBuonTheoLoaiHinh' (bản
// 10.98, theo yêu cầu người dùng — "Doanh thu Bán buôn hàng ngày, tách
// Mart/Mini Mart/Kho/Tổng").
//
// MỖI DÒNG = 1 NGÀY trong khoảng lọc, 4 cột số liệu: Mart/Mini Mart/Kho/
// Tổng cộng — KHÔNG có Kế hoạch (theo xác nhận người dùng: "Không có
// target bán buôn, chỉ có doanh thu bán buôn hàng ngày").
//
// TÁI DÙNG domain `doanhthu_nganhhang` ĐÃ CÓ SẴN (measure DoanhThuBanBuon,
// công thức TRANS_CODE 211/212 đã chốt ở "báo cáo doanh thu-nhập hàng theo
// ngành hàng.md") — KHÔNG tạo VIEW/domain mới, giống đúng cách
// lib/doanhThuTongHopHcrcRunner.js đã làm (bản 10.86). Domain đó khoá
// (STK_ID, DEPT_ID, ngày) — cộng dồn theo STK_ID (bỏ DEPT_ID) ở đây để ra
// đúng 1 số/siêu thị/ngày, RỒI xếp vào 1 trong 3 nhóm theo
// `etl.DiemStkMapping.LoaiChuoi` (admin tự khai ở "Ánh xạ Điểm - STK_ID",
// xem lib/diemStkMapping.js) — "Kho" là giá trị LoaiChuoi THỨ 3 (mới, admin
// tự gõ "KHO", KHÔNG cần đổi code gì thêm — LoaiChuoi vốn là field tự do,
// trước đây chỉ tài liệu hoá MART/MINIMART).
//
// Mã kho CHƯA khai LoaiChuoi (để trống) -> KHÔNG suy đoán, bỏ qua hẳn khỏi
// cả 3 nhóm VÀ khỏi "Tổng" (đúng quy ước CLAUDE.md — không tự suy dữ liệu
// thiếu khai báo) — admin cần khai đủ LoaiChuoi cho MỌI mã Điểm có doanh
// thu bán buôn để báo cáo này ra đúng số.
const { getPool } = require('../db');
const { fetchAllReportRows } = require('./compositeReportRunner');
const { loadDiemStkMapping, buildStkIdLookup } = require('./diemStkMapping');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const NGANHHANG_DOMAIN = 'doanhthu_nganhhang';

function vietnamTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
function firstOfMonth(dateStr) { return `${dateStr.slice(0, 7)}-01`; }

function eventDateKeyOf(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

const COLUMNS = [
  { key: 'stt', label: 'TT' },
  { key: 'ngay', label: 'Ngày' },
  { key: 'mart', label: 'Mart' },
  { key: 'miniMart', label: 'Mini Mart' },
  { key: 'kho', label: 'Kho' },
  { key: 'tong', label: 'Tổng cộng' }
];

async function runBanBuonTheoLoaiHinhReport(definition, filterValues) {
  const today = vietnamTodayISO();
  const range = (filterValues && filterValues.eventDate) || {};
  const from = range.from || firstOfMonth(today);
  const to = range.to || today;

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  // STK_ID (kho) hiện tại -> {maDiem, tenSieuThi} — đủ dùng cho dữ liệu GẦN
  // ĐÂY (báo cáo "hàng ngày"), KHÔNG cần tra theo MaStkCu (kỳ trước) như
  // remapRowsToDiem() dùng cho báo cáo so sánh "cùng kỳ năm trước".
  const stkIdLookup = buildStkIdLookup(diemMapping);

  const reportDefinition = { domain: NGANHHANG_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  const rawRows = await fetchAllReportRows(dwhPool, reportDefinition, { eventDate: { from, to } });

  // byDayStk: Map<"ngày|STK_ID", DoanhThuBanBuon cộng dồn> — gộp bỏ DEPT_ID
  // trước (đúng 1 số/siêu thị/ngày), TRÁNH đếm trùng khi 1 siêu thị có
  // nhiều dòng/ngành hàng cho CÙNG 1 ngày.
  const byDayStk = new Map();
  for (const row of rawRows) {
    const stkIdRaw = row.dimensions && row.dimensions.STK_ID;
    // Bản 10.89 (lib/doanhThuTongHopHcrcRunner.js) — STK_ID của domain này
    // lưu nguyên dạng CHAR đệm khoảng trắng, PHẢI trim trước khi so khớp.
    const stkId = stkIdRaw && String(stkIdRaw).trim();
    if (!stkId) continue;
    const doanhThuBanBuon = (row.measures && row.measures.DoanhThuBanBuon) || 0;
    if (!doanhThuBanBuon) continue;
    const key = `${eventDateKeyOf(row.eventDate)}|${stkId}`;
    byDayStk.set(key, (byDayStk.get(key) || 0) + doanhThuBanBuon);
  }

  // byDay: Map<ngày, {MART, MINIMART, KHO}>
  const byDay = new Map();
  for (const [key, doanhThuBanBuon] of byDayStk) {
    const sep = key.indexOf('|');
    const day = key.slice(0, sep);
    const stkId = key.slice(sep + 1);
    const info = stkIdLookup.get(stkId);
    if (!info) continue; // mã kho chưa khai ở "Ánh xạ Điểm - STK_ID"
    const diemInfo = diemMapping.get(info.maDiem);
    const loaiChuoi = diemInfo && diemInfo.loaiChuoi && diemInfo.loaiChuoi.trim().toUpperCase();
    if (!loaiChuoi) continue; // chưa khai LoaiChuoi -> không rõ xếp nhóm nào, bỏ qua (không suy đoán)

    let bucket = byDay.get(day);
    if (!bucket) { bucket = { MART: 0, MINIMART: 0, KHO: 0 }; byDay.set(day, bucket); }
    bucket[loaiChuoi] = (bucket[loaiChuoi] || 0) + doanhThuBanBuon;
  }

  const days = [...byDay.keys()].sort();
  const rows = days.map((day) => {
    const b = byDay.get(day);
    const mart = b.MART || 0;
    const miniMart = b.MINIMART || 0;
    const kho = b.KHO || 0;
    return { ngay: day, mart, miniMart, kho, tong: mart + miniMart + kho };
  });

  const columns = describeColumns(COLUMNS);
  assignSttIfPresent(rows, columns);

  return { columns, rows, columnGroups: null, columnSuperGroups: null };
}

module.exports = { runBanBuonTheoLoaiHinhReport };
