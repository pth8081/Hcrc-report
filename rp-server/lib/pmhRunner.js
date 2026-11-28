// lib/pmhRunner.js — SourceType='pmh' (bản 11.57, theo yêu cầu người dùng
// — "Mẫu Báo Cáo PMH" (Phòng Mua Hàng), "1 báo cáo và in ra nhiều sheet...
// xuất ra cả báo cáo với tất cả các sheet. Giống như báo cáo weekly post
// của MKT") — ĐIỀU PHỐI sang từng "sheet" qua `filterValues.sheet`, ĐÚNG
// mẫu lib/brgWeeklyPostRunner.js.
//
// KHÁC "BRG Weekly Post" ở chỗ mỗi sheet PMH là 1 domain kiểu 'directDb'
// HOÀN TOÀN ĐỘC LẬP (không chia sẻ 1 bộ dữ liệu "campaign" chung như BRG)
// — mỗi sheet tự định nghĩa domain/columns rồi chạy qua ĐÚNG pipeline
// 'directDb' (lib/reportEngine.js:runReport()+projectColumns()/
// describeColumns(), KHÔNG gọi lại lib/reportRunner.js:runDefinition() —
// file đó SẼ require NGƯỢC LẠI chính file này để điều phối
// sourceType='pmh', gọi runDefinition() ở đây sẽ tạo VÒNG LẶP require).
//
// 2 sheet "Thay đổi giá bán tức thời"/"từ thời điểm" DÙNG LẠI NGUYÊN
// DefinitionJson của 2 báo cáo ĐÃ CÓ SẴN (`bc-thay-doi-gia-tuc-thoi`/
// `-tu-thoi-diem`, xem "bc-thay-doi-gia.md") — đọc THẲNG từ
// app.ReportCatalog MỖI LẦN CHẠY (KHÔNG chép lại danh sách cột ở đây) —
// sửa cột/công thức ở 2 báo cáo gốc tự áp dụng luôn cho sheet này, không
// bao giờ bị lệch giữa 2 nơi.
//
// Sheet "Full Barcode" — domain MỚI `pmh_full_barcode` (xem
// etl/scripts/seedPmhFullBarcodeSync.js + VIEW "Thiết lập VIEW PMH Full
// Barcode (DSMART16 trung tâm).sql") — CHỈ 8 cột đã có nguồn xác nhận
// chắc chắn (Barcode/SKU_ID/Mã hàng/Tên hàng/Mã nhóm/Tên nhóm/Mã NCC/Tên
// NCC/ĐVT/Giá bán lẻ/Giá nhập theo NCC/Giá Vốn chỉ định — 11 cột, xem VIEW
// cho chi tiết nguồn+giả định từng cột) — 2 cột "Thuế Nhập"/"Trạng Thái"
// CHƯA CÓ NGUỒN XÁC NHẬN, chưa đưa vào (xem "bc-pmh.md" mục "Chưa có
// nguồn") — thêm sau khi có.
//
// 4 sheet CÒN LẠI của file mẫu PMH gốc (Giá mua theo NCC, BC thay đổi
// GBKM/GN KM/GN thường, Báo cáo trạng thái mã hàng theo kho) CHƯA LÀM —
// đang chờ xác nhận nguồn DSMART16 thật, xem "bc-pmh.md".
//
// Bộ lọc hiện tại (bản 11.57) CHỈ gồm `sheet` + `eventDate` (áp dụng
// CHUNG cho mọi sheet, an toàn vì EventDate luôn có ở mọi domain) — 2 sheet
// "Thay đổi giá" tuy BẢN THÂN có thêm bộ lọc Ngành hàng/Mã hàng/Vùng giá
// (xem DefinitionJson gốc) nhưng CHƯA hiện ở đây (bộ lọc hiện trên web lấy
// từ DefinitionJson CỦA BÁO CÁO PMH, không tự đổi theo sheet đang chọn) —
// cần bộ lọc đó, xem riêng 2 báo cáo gốc `bc-thay-doi-gia-tuc-thoi`/
// `-tu-thoi-diem` (vẫn hoạt động độc lập, không bị ẩn đi).
const { sql, getPool } = require('../db');
const { runReport, projectColumns, describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const FULL_BARCODE_DEFINITION = {
  domain: 'pmh_full_barcode',
  filters: [
    { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' }
  ],
  columns: [
    { key: 'stt', label: 'TT' },
    { key: 'maVach', label: 'Barcode', formula: 'MaVach' },
    { key: 'skuId', label: 'SKU_ID', formula: 'SkuId' },
    { key: 'maHang', label: 'Mã hàng', formula: 'MaHangHienThi' },
    { key: 'tenHang', label: 'Tên hàng', formula: 'TenHang' },
    { key: 'maNhom', label: 'Mã nhóm', formula: 'MaNhom' },
    { key: 'tenNhom', label: 'Tên nhóm', formula: 'TenNhom' },
    { key: 'maNCC', label: 'Mã NCC', formula: 'MaNCC' },
    { key: 'tenNCC', label: 'Tên nhà cung cấp', formula: 'TenNCC' },
    { key: 'donVi', label: 'ĐVT', formula: 'DonVi' },
    { key: 'giaBanLe', label: 'Giá bán lẻ', formula: 'measures.GiaBanLe' },
    { key: 'giaNhapTheoNCC', label: 'Giá nhập theo NCC', formula: 'measures.GiaNhapTheoNCC' },
    { key: 'giaVonChiDinh', label: 'Giá Vốn chỉ định', formula: 'measures.GiaVonChiDinh' }
  ]
};

const SHEET_OPTIONS = [
  { value: 'fullBarcode', label: 'Full Barcode', kind: 'inline', definition: FULL_BARCODE_DEFINITION },
  { value: 'thayDoiGiaTucThoi', label: 'Thay đổi giá bán tức thời', kind: 'reuse', reuseReportId: 'bc-thay-doi-gia-tuc-thoi' },
  { value: 'thayDoiGiaTuThoiDiem', label: 'Thay đổi giá bán từ thời điểm', kind: 'reuse', reuseReportId: 'bc-thay-doi-gia-tu-thoi-diem' }
];
const DEFAULT_SHEET = SHEET_OPTIONS[0].value;

async function loadReuseDefinition(reportId) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT DefinitionJson FROM app.ReportCatalog WHERE ReportId = @reportId AND IsActive = 1');
  if (!result.recordset.length) {
    throw new Error(`Không tìm thấy báo cáo gốc "${reportId}" để dùng lại (đã bị xoá/tắt hoạt động?) — kiểm tra lại app.ReportCatalog.`);
  }
  return JSON.parse(result.recordset[0].DefinitionJson);
}

// runSheetDefinition — ĐÚNG pipeline 'directDb' (mirror
// lib/reportRunner.js:runDefinition() nhánh cuối — xem chú thích đầu file
// cho lý do KHÔNG gọi thẳng hàm đó).
async function runSheetDefinition(sheetDefinition, filterValues, pagination) {
  const pool = await getPool('DWH');
  const rows = await runReport(pool, sheetDefinition, filterValues, pagination);
  const projectableColumns = sheetDefinition.columns.filter(c => (typeof c === 'string' ? c : c.key) !== 'stt');
  const columns = describeColumns(sheetDefinition.columns);
  const projectedRows = rows.map(r => projectColumns(r, projectableColumns));
  assignSttIfPresent(projectedRows, columns);
  return {
    columns, rows: projectedRows,
    columnGroups: sheetDefinition.columnGroups || null, standaloneColumnColors: sheetDefinition.standaloneColumnColors || null
  };
}

async function runPmhReport(definition, filterValues = {}, pagination) {
  const sheetValue = (filterValues && filterValues.sheet) || DEFAULT_SHEET;
  const opt = SHEET_OPTIONS.find(o => o.value === sheetValue) || SHEET_OPTIONS[0];
  const sheetDefinition = opt.kind === 'reuse' ? await loadReuseDefinition(opt.reuseReportId) : opt.definition;
  return runSheetDefinition(sheetDefinition, filterValues, pagination);
}

module.exports = { runPmhReport, SHEET_OPTIONS, DEFAULT_SHEET };
