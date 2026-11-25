// lib/brgPostByItemsRunner.js — SourceType='brgPostByItems' (bản 11.24,
// "BRG Weekly Post" — Báo cáo 3 MKT, sheet "By items" của file mẫu thật).
// MỖI DÒNG = 1 SKU trong 1 chiến dịch khuyến mãi, CHỈ TIÊU (cả chuỗi) +
// THỰC TẾ (bán hàng + tồn kho) — xem lib/brgWeeklyPostCore.js cho đầy đủ
// cách ghép dữ liệu + "bc-brg-weekly-post.md" cho nghiệp vụ/công thức.
const { loadCampaignData } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const APPLY_SCOPE_LABEL = { All: 'All', Mart: 'Mart', MiniMart: 'Mini Mart' };

function buildColumns() {
  return [
    { key: 'stt', label: 'TT' },
    { key: 'maHang', label: 'Mã 10 số' },
    { key: 'skuCode', label: 'Mã sản phẩm' },
    { key: 'skuName', label: 'Tên sản phẩm' },
    { key: 'deptName', label: 'Ngành hàng' },
    { key: 'giaBanLe', label: 'Giá bán lẻ' },
    { key: 'giaKmMart', label: 'Giá khuyến mại MART' },
    { key: 'giaKmMini', label: 'Giá khuyến mại Mini' },
    { key: 'promoNote', label: 'Ghi chú KM' },
    { key: 'percentKm', label: 'Total KM', format: 'percent' },
    { key: 'taxRate', label: 'Thuế', format: 'percent' },
    { key: 'applyScope', label: 'Áp dụng' },
    { key: 'soLuongThucTe', label: 'Số lượng thực tế' },
    { key: 'soLuongKeHoachTotal', label: 'Số lượng kế hoạch' },
    { key: 'doanhThuThucTe', label: 'Doanh thu thực tế' },
    { key: 'doanhThuKeHoachTotal', label: 'Doanh thu kế hoạch' },
    { key: 'tyLeThucHien', label: '% Thực hiện doanh số', format: 'percent' },
    { key: 'tonKho', label: 'Tồn kho' },
    { key: 'giaTriTon', label: 'Giá trị tồn' }
  ];
}

function sumField(rows, key) { return rows.reduce((s, r) => s + (r[key] || 0), 0); }

function buildGrandTotalRow(skuRows) {
  const doanhThuThucTe = sumField(skuRows, 'doanhThuThucTe');
  const doanhThuKeHoachTotal = sumField(skuRows, 'doanhThuKeHoachTotal');
  return {
    skuName: 'Tổng cộng',
    soLuongThucTe: sumField(skuRows, 'soLuongThucTe'),
    soLuongKeHoachTotal: sumField(skuRows, 'soLuongKeHoachTotal'),
    doanhThuThucTe, doanhThuKeHoachTotal,
    tyLeThucHien: doanhThuKeHoachTotal ? (doanhThuThucTe / doanhThuKeHoachTotal) * 100 : null,
    tonKho: sumField(skuRows, 'tonKho'),
    giaTriTon: sumField(skuRows, 'giaTriTon'),
    __isSubtotal: true, __isGrandTotal: true
  };
}

async function runBrgPostByItemsReport(definition, filterValues) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);

  // percentKm/taxRate lưu dạng phân số (0.04 = 4%) — format 'percent' ở
  // tầng hiển thị nhân sẵn 100 (xem reportCellFormat.js) nên nhân lên đây
  // TRƯỚC khi gán vào cột, tyLeThucHien (brgWeeklyPostCore.js) đã trả về
  // SẴN dạng phần trăm (×100) — KHÔNG nhân lại 2 LẦN.
  const rows = data.skuRows.map(r => ({
    ...r,
    percentKm: r.percentKm !== null && r.percentKm !== undefined ? r.percentKm * 100 : null,
    taxRate: r.taxRate !== null && r.taxRate !== undefined ? r.taxRate * 100 : null,
    applyScope: APPLY_SCOPE_LABEL[r.applyScope] || r.applyScope,
    tyLeThucHien: r.tyLeThucHien !== null ? r.tyLeThucHien * 100 : null
  }));

  const columns = describeColumns(buildColumns());
  const grandTotal = buildGrandTotalRow(data.skuRows);
  const allRows = [...rows, grandTotal];
  assignSttIfPresent(allRows, columns);

  return { columns, rows: allRows, columnGroups: null, columnSuperGroups: null };
}

module.exports = { runBrgPostByItemsReport, buildColumns, buildGrandTotalRow };
