// lib/brgPostDetailRunner.js — SourceType='brgPostDetail' (bản 11.24,
// "BRG Weekly Post" — Báo cáo 3 MKT, GỘP 2 sheet "Từng ST.CH"/"Từng sản
// phẩm" của file mẫu thật). Cả 2 sheet đó là CÙNG 1 bảng chi tiết (1
// dòng/(siêu thị, SKU)) — file Excel chỉ KHÁC NHAU ở việc dùng slicer/
// pivot để xem lọc theo 1 siêu thị (CLICK tên ST/CH) hay 1 sản phẩm
// (CLICK tên sản phẩm) tại 1 thời điểm — trên web, người xem TỰ lọc/sắp
// xếp trực tiếp trên bảng (cột "Tên siêu thị"/"Tên sản phẩm"), không cần
// 2 báo cáo riêng hay cơ chế "click để xem" nào đặc biệt.
//
// ⚠️ KHÔNG có cột "Tình trạng Tồn kho chưa đảm bảo 50% so với kế hoạch"
// của file mẫu — đối chiếu nhiều dòng mẫu cho thấy công thức KHÔNG đơn
// giản là "tồn < 50% kế hoạch" (có dòng tồn thấp hơn mức này nhưng vẫn
// để trống, không đánh dấu) — chưa suy ra được quy tắc thật, để người
// xem tự đối chiếu trực tiếp 2 cột "Số lượng tồn"/"Số lượng kế hoạch".
const { loadCampaignData, buildDetailRows } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');

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
    { key: 'giaTriTon', label: 'Giá trị tồn' }
  ];
}

async function runBrgPostDetailReport(definition, filterValues) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);
  const rows = buildDetailRows(data).sort((a, b) =>
    (a.tenSieuThi || '').localeCompare(b.tenSieuThi || '', 'vi') || (a.skuName || '').localeCompare(b.skuName || '', 'vi'));

  const columns = describeColumns(buildColumns());
  return { columns, rows, columnGroups: null, columnSuperGroups: null };
}

module.exports = { runBrgPostDetailReport, buildColumns };
