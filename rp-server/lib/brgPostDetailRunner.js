// lib/brgPostDetailRunner.js — SourceType='brgPostDetail' (bản 11.24,
// "BRG Weekly Post" — Báo cáo 3 MKT, GỘP 2 sheet "Từng ST.CH"/"Từng sản
// phẩm" của file mẫu thật). Cả 2 sheet đó là CÙNG 1 bảng chi tiết (1
// dòng/(siêu thị, SKU)) — file Excel chỉ KHÁC NHAU ở việc dùng slicer/
// pivot để xem lọc theo 1 siêu thị (CLICK tên ST/CH) hay 1 sản phẩm
// (CLICK tên sản phẩm) tại 1 thời điểm — trên web, người xem TỰ lọc/sắp
// xếp trực tiếp trên bảng (cột "Tên siêu thị"/"Tên sản phẩm"), không cần
// 2 báo cáo riêng hay cơ chế "click để xem" nào đặc biệt.
//
// SỬA bản 11.42 (theo yêu cầu người dùng — đối chiếu lại file mẫu gốc,
// người dùng gửi lại ĐÚNG file có công thức thật ở sheet "Data chi tiết")
// — ĐÃ THÊM cột "Tình trạng tồn kho" — KHÔNG phải "tồn < 50% kế hoạch"
// như đoán ban đầu, mà theo ĐÚNG công thức thật dò được (CHỈ 2/3 nhánh —
// xem computeTinhTrangTon() ở lib/brgWeeklyPostCore.js để biết vì sao
// nhánh thứ 3 KHÔNG replicate — công thức gốc SAI thứ nguyên ngay từ
// chính file mẫu).
const { loadCampaignData, buildDetailRows, buildCampaignHeader } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');
const { applyDisplayCap } = require('./reportCellFormat');

function buildColumns() {
  return [
    { key: 'tenSieuThi', label: 'Tên siêu thị' },
    { key: 'skuName', label: 'Tên sản phẩm' },
    { key: 'skuCode', label: 'Mã sản phẩm' },
    { key: 'soLuongThucTe', label: 'SL thực đạt' },
    { key: 'soLuongKeHoach', label: 'SL kế hoạch' },
    { key: 'doanhThuThucTe', label: 'DS thực đạt' },
    { key: 'doanhThuKeHoach', label: 'DS kế hoạch' },
    { key: 'doanhThuThieuHut', label: 'DS thiếu hụt' },
    { key: 'tonKho', label: 'SL tồn' },
    { key: 'giaTriTon', label: 'Giá trị tồn' },
    { key: 'tinhTrangTon', label: 'Tình trạng tồn kho' }
  ];
}

// pagination (bản 11.30, theo yêu cầu người dùng — audit hiệu năng báo cáo:
// báo cáo này PHẲNG, không nhóm/subtotal, tự nhận "có thể vài nghìn dòng,
// KHÔNG phân trang" ở bc-brg-weekly-post.md — AN TOÀN để cắt đơn giản, xem
// applyDisplayCap() ở lib/reportCellFormat.js) — CHỈ cắt khi gọi từ /run
// (`capForDisplay=true`), /export/export-sheets vẫn nhận ĐỦ dòng như cũ.
async function runBrgPostDetailReport(definition, filterValues, pagination) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);
  const allRows = buildDetailRows(data).sort((a, b) =>
    (a.tenSieuThi || '').localeCompare(b.tenSieuThi || '', 'vi') || (a.skuName || '').localeCompare(b.skuName || '', 'vi'));
  const { rows, warnings } = applyDisplayCap(allRows, pagination);

  const columns = describeColumns(buildColumns());
  // displayTitle/periodLabel (bản 11.35) — xem buildCampaignHeader() ở
  // brgWeeklyPostCore.js.
  return { columns, rows, columnGroups: null, columnSuperGroups: null, warnings, ...buildCampaignHeader(data) };
}

module.exports = { runBrgPostDetailReport, buildColumns };
