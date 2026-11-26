// lib/brgPostByStoreRunner.js — SourceType='brgPostByStore' (bản 11.24,
// "BRG Weekly Post" — Báo cáo 3 MKT, sheet "By Store" của file mẫu thật).
// MỖI DÒNG = 1 mã Điểm — tổng thực tế (bán hàng/tồn kho) của CÁC SKU
// trong chiến dịch TẠI siêu thị đó, + chỉ tiêu ĐÃ PHÂN BỔ theo trọng số
// (xem lib/brgWeeklyPostCore.js:buildStoreRows()/allocateSkuTargetToStores()).
//
// ⚠️ PHẠM VI: KHÔNG gồm "Tổng doanh số bán lẻ thực tế"/"Số lượng Bill bán
// lẻ"/"Doanh số chỉ tiêu theo kế hoạch công ty tháng..." của file mẫu
// (cần đọc thêm domain `doanhthu_chinhanh`/`giaodich_chinhanh` — tổng CẢ
// siêu thị, không riêng SKU khuyến mãi) — xem "bc-brg-weekly-post.md".
const { loadCampaignData, buildStoreRows, divOrNull, buildCampaignHeader } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const LOAI_LABEL = { MART: 'Mart', MINIMART: 'Mini Mart', KHO: 'Kho' };
const GROUP_ORDER = ['MART', 'MINIMART', 'KHO'];
const ROMAN = ['I', 'II', 'III'];

function buildColumns() {
  return [
    { key: 'stt', label: 'TT' },
    { key: 'maDiem', label: 'Mã điểm' },
    { key: 'stkId', label: 'Mã kho' },
    { key: 'loai', label: 'Nhóm ST/CH' },
    { key: 'tenSieuThi', label: 'Tên kho hàng' },
    { key: 'soLuongThucTe', label: 'Số lượng thực tế' },
    { key: 'soLuongKeHoach', label: 'Số lượng kế hoạch' },
    { key: 'doanhThuThucTe', label: 'Doanh thu thực tế' },
    { key: 'doanhThuKeHoach', label: 'Doanh thu kế hoạch' },
    { key: 'tyLeThucHien', label: '% Thực hiện doanh số', format: 'percent' },
    { key: 'tonKho', label: 'Số lượng tồn kho' },
    { key: 'giaTriTon', label: 'Giá trị tồn kho' },
    { key: 'storeWeight', label: 'Trọng số phân bổ chỉ tiêu' }
  ];
}

function sumField(rows, key) { return rows.reduce((s, r) => s + (r[key] || 0), 0); }

function groupRowsByChain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.__loaiChuoi && GROUP_ORDER.includes(row.__loaiChuoi) ? row.__loaiChuoi : '__other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const orderedKeys = [...GROUP_ORDER.filter(k => groups.has(k)), ...(groups.has('__other') ? ['__other'] : [])];
  return orderedKeys.map(key => ({ key, rows: groups.get(key) }));
}

function buildSubtotalRow(groupRows, label, isGrandTotal) {
  const doanhThuThucTe = sumField(groupRows, 'doanhThuThucTe');
  const doanhThuKeHoach = sumField(groupRows, 'doanhThuKeHoach');
  return {
    tenSieuThi: label,
    soLuongThucTe: sumField(groupRows, 'soLuongThucTe'),
    soLuongKeHoach: sumField(groupRows, 'soLuongKeHoach'),
    doanhThuThucTe, doanhThuKeHoach,
    tyLeThucHien: divOrNull(doanhThuThucTe, doanhThuKeHoach),
    tonKho: sumField(groupRows, 'tonKho'),
    giaTriTon: sumField(groupRows, 'giaTriTon'),
    storeWeight: sumField(groupRows, 'storeWeight'),
    __isSubtotal: true, __isGrandTotal: !!isGrandTotal
  };
}

function buildGroupedRows(storeRows) {
  const groups = groupRowsByChain(storeRows);
  const out = [];
  groups.forEach((g, idx) => {
    const roman = ROMAN[idx] || String(idx + 1);
    const isOther = g.key === '__other';
    out.push({ __isSectionHeader: true, __sectionLabel: `${roman}. ${isOther ? 'CHƯA PHÂN NHÓM' : `CHUỖI ${g.key}`}` });
    out.push(...g.rows);
    out.push(buildSubtotalRow(g.rows, `TỔNG ${isOther ? 'KHÁC' : LOAI_LABEL[g.key] || g.key}`, false));
  });
  out.push(buildSubtotalRow(storeRows, 'Tổng cộng', true));
  return out;
}

async function runBrgPostByStoreReport(definition, filterValues) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);
  const storeRows = buildStoreRows(data).map(r => ({
    ...r,
    loai: LOAI_LABEL[r.loaiChuoi] || r.loaiChuoi || null,
    tyLeThucHien: r.tyLeThucHien !== null ? r.tyLeThucHien * 100 : null,
    __loaiChuoi: r.loaiChuoi || null
  }));

  const columns = describeColumns(buildColumns());
  const groupedRows = buildGroupedRows(storeRows);
  assignSttIfPresent(groupedRows, columns);

  // displayTitle/periodLabel (bản 11.35) — xem buildCampaignHeader() ở
  // brgWeeklyPostCore.js.
  return { columns, rows: groupedRows, columnGroups: null, columnSuperGroups: null, ...buildCampaignHeader(data.campaign) };
}

module.exports = { runBrgPostByStoreReport, buildColumns, buildGroupedRows };
