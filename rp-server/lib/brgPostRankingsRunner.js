// lib/brgPostRankingsRunner.js — SourceType='brgPostRankings' (bản 11.24,
// "BRG Weekly Post" — Báo cáo 3 MKT, GỘP 4 sheet nhỏ dùng CHUNG đúng 1 bộ
// cột từ file mẫu: "Top SL" (Top 20 số lượng thực tế cao nhất), "Top DS"
// (Top 20 doanh thu thực tế cao nhất), "Top KH" (Top 20 doanh thu kế
// hoạch cao nhất), "Vượt KH" (SKU có doanh số DỰ KIẾN vượt kế hoạch) —
// gộp vào 1 báo cáo (4 khối, phân biệt bằng dòng tiêu đề nhóm, mirror
// cách nhóm Mart/MiniMart ở các báo cáo khác) để đỡ tạo 4 báo cáo riêng
// cho đúng 4 bảng xếp hạng nhỏ, cùng nguồn dữ liệu, cùng bộ lọc.
const { loadCampaignData, buildCampaignHeader } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');

const APPLY_SCOPE_LABEL = { All: 'All', Mart: 'Mart', MiniMart: 'Mini Mart' };
const TOP_N = 20;

function buildColumns() {
  return [
    { key: 'stt', label: 'TT' },
    { key: 'skuCode', label: 'Mã sản phẩm' },
    { key: 'skuName', label: 'Tên sản phẩm' },
    { key: 'deptName', label: 'Ngành hàng' },
    { key: 'giaBanLe', label: 'Giá bán lẻ' },
    { key: 'giaKmMart', label: 'Giá khuyến mại MART' },
    { key: 'percentKm', label: 'Total KM', format: 'percent' },
    { key: 'applyScope', label: 'Áp dụng' },
    { key: 'soLuongThucTe', label: 'Số lượng thực tế' },
    { key: 'doanhThuThucTe', label: 'Doanh thu thực tế' },
    { key: 'doanhThuDuKien', label: 'Doanh thu dự kiến' },
    { key: 'doanhThuKeHoachTotal', label: 'Doanh thu kế hoạch' },
    { key: 'tyLeThucHien', label: '% Thực hiện doanh số', format: 'percent' },
    { key: 'tyLeDuKien', label: '% Dự kiến/kế hoạch', format: 'percent' },
    { key: 'tonKho', label: 'Tồn kho' },
    { key: 'giaTriTon', label: 'Giá trị tồn' }
  ];
}

function toDisplayRow(r) {
  return {
    ...r,
    percentKm: r.percentKm !== null && r.percentKm !== undefined ? r.percentKm * 100 : null,
    applyScope: APPLY_SCOPE_LABEL[r.applyScope] || r.applyScope,
    tyLeThucHien: r.tyLeThucHien !== null ? r.tyLeThucHien * 100 : null,
    tyLeDuKien: r.tyLeDuKien !== null ? r.tyLeDuKien * 100 : null
  };
}

async function runBrgPostRankingsReport(definition, filterValues) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);
  const skuRows = data.skuRows;

  const topSL = [...skuRows].sort((a, b) => b.soLuongThucTe - a.soLuongThucTe).slice(0, TOP_N);
  const topDS = [...skuRows].sort((a, b) => b.doanhThuThucTe - a.doanhThuThucTe).slice(0, TOP_N);
  const topKH = [...skuRows].sort((a, b) => b.doanhThuKeHoachTotal - a.doanhThuKeHoachTotal).slice(0, TOP_N);
  // "Vượt KH" (bản 11.24, dò ngược khớp số liệu mẫu — file mẫu dùng
  // DOANH THU DỰ KIẾN (ngoại suy hết kỳ, KHÔNG phải thực tế hiện tại) so
  // với kế hoạch — SKU nào CHƯA có kế hoạch (doanhThuKeHoachTotal = 0)
  // loại khỏi danh sách này (không có mẫu số để so %).
  const vuotKH = skuRows
    .filter(r => r.doanhThuKeHoachTotal > 0 && r.doanhThuDuKien > r.doanhThuKeHoachTotal)
    .sort((a, b) => (b.tyLeDuKien || 0) - (a.tyLeDuKien || 0));

  const sections = [
    { label: `TOP ${TOP_N} SẢN PHẨM CÓ SỐ LƯỢNG THỰC ĐẠT CAO NHẤT`, rows: topSL },
    { label: `TOP ${TOP_N} SẢN PHẨM CÓ DOANH SỐ THỰC ĐẠT CAO NHẤT`, rows: topDS },
    { label: `TOP ${TOP_N} SẢN PHẨM CÓ DOANH SỐ KẾ HOẠCH CAO NHẤT`, rows: topKH },
    { label: `${vuotKH.length} SẢN PHẨM CÓ DOANH SỐ DỰ KIẾN VƯỢT KẾ HOẠCH`, rows: vuotKH }
  ];

  // TT đánh số LẠI TỪ 1 ở MỖI khối (đúng khuôn file mẫu — "Top SL" riêng
  // 1-20, "Top DS" riêng 1-20...) — KHÔNG dùng chung
  // reportCellFormat.js:assignSttIfPresent() (hàm đó CHỈ reset bộ đếm sau
  // 1 dòng __isSubtotal, không có giữa 2 __isSectionHeader liên tiếp
  // KHÔNG dòng subtotal nào ở giữa như ở đây) — tự đánh số riêng cho
  // đúng từng khối.
  const columns = describeColumns(buildColumns());
  const hasSttColumn = columns.some(c => c.key === 'stt');
  const allRows = [];
  for (const section of sections) {
    allRows.push({ __isSectionHeader: true, __sectionLabel: section.label });
    section.rows.forEach((r, i) => {
      const displayRow = toDisplayRow(r);
      if (hasSttColumn) displayRow.stt = i + 1;
      allRows.push(displayRow);
    });
  }

  // displayTitle/periodLabel (bản 11.35) — xem buildCampaignHeader() ở
  // brgWeeklyPostCore.js.
  return { columns, rows: allRows, columnGroups: null, columnSuperGroups: null, ...buildCampaignHeader(data.campaign) };
}

module.exports = { runBrgPostRankingsReport, buildColumns };
