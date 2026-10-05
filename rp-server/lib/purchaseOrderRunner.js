// lib/purchaseOrderRunner.js — SourceType='purchaseOrder' (bản 8.75, theo
// yêu cầu người dùng) — 3 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh
// đặt–nhận" dùng CHUNG 1 domain `don_dat_hang` (SL đặt + SL thực nhận nằm
// TRÊN CÙNG 1 DÒNG dwh.ReportFacts — xác nhận qua mẫu "Phiếu đặt hàng"
// thật, xem bc-don-dat-hang.md), khác nhau CHỈ ở definition.columns (cột
// nào hiển thị) — không cần ghép composite nhiều khối.
//
// KHÁC `directDb` (lib/reportEngine.js) thường ở ĐÚNG 1 điểm: Dimensions.MaDiem
// đồng bộ từ DSMART16 là mã STK_ID THÔ (CSDL trung tâm, không phải mã Điểm
// chuẩn) — runner này tự tra "Ánh xạ Điểm - STK_ID" (lib/diemStkMapping.js)
// để GHI ĐÈ MaDiem/TenDiem bằng mã Điểm + tên siêu thị CHUẨN của HCRC
// TRƯỚC khi chiếu cột, theo đúng yêu cầu người dùng ("vẫn dựa vào bảng ánh
// xạ mã STK để thực hiện"). Mọi thứ khác (filters dateRange/multiSelect,
// cột công thức) TÁI DÙNG NGUYÊN lib/reportEngine.js, không viết lại.
//
// STK_ID CHƯA khai trong bảng ánh xạ bị LOẠI KHỎI báo cáo (không hiện mã
// thô lẫn với mã Điểm chuẩn — cùng triết lý useDiemStkMapping ở
// lib/compositeReportRunner.js: "không chắc chắn thì KHÔNG hiện", không
// đoán bừa).
//
// __storeScope (bản 8.51) lọc theo STK_ID THÔ TRƯỚC khi ghi đè mã Điểm
// (dùng resolveStoreScopeStkIds() đã có sẵn, KHÔNG viết lại) — người dùng
// bị giới hạn phạm vi chỉ thấy đúng đơn hàng của siêu thị mình, giống mọi
// báo cáo khác.
const { getPool } = require('../db');
const { runReport, projectColumns, describeColumns } = require('./reportEngine');
const { loadDiemStkMapping, buildStkIdLookup, resolveStoreScopeStkIds } = require('./diemStkMapping');

const DOMAIN = 'don_dat_hang';

async function runPurchaseOrderReport(definition, filterValues = {}, pagination = { page: 1, pageSize: 500 }) {
  const pool = await getPool('DWH');
  const [diemMapping, storeScope] = await Promise.all([
    loadDiemStkMapping(),
    resolveStoreScopeStkIds(filterValues.__storeScope ?? null)
  ]);
  const stkLookup = buildStkIdLookup(diemMapping);

  // Chỉ chuyển filter dateRange/trạng thái xuống SQL (lib/reportEngine.js)
  // — filter "Siêu thị" (nếu có) PHẢI áp dụng SAU khi ghi đè mã Điểm bên
  // dưới, vì Dimensions.MaDiem lưu trong dwh.ReportFacts vẫn là STK_ID thô,
  // KHÔNG so khớp trực tiếp được với mã Điểm chuẩn người dùng chọn.
  const sqlFilters = (definition.filters || []).filter((f) => f.field !== 'maDiem');
  const rawRows = await runReport(pool, { domain: DOMAIN, filters: sqlFilters }, filterValues, pagination);

  const scopedRows = storeScope
    ? rawRows.filter((row) => storeScope.has(row.dimensions.MaDiem))
    : rawRows;

  const mappedRows = scopedRows
    .map((row) => {
      const stkId = row.dimensions.MaDiem;
      const info = stkLookup.get(stkId);
      if (!info) return null; // STK chưa khai ánh xạ Điểm-STK — loại khỏi báo cáo, xem chú thích đầu file
      return {
        ...row,
        dimensions: { ...row.dimensions, MaDiem: info.maDiem, TenDiem: info.tenSieuThi || row.dimensions.TenDiem }
      };
    })
    .filter(Boolean);

  return {
    columns: describeColumns(definition.columns),
    rows: mappedRows.map((r) => projectColumns(r, definition.columns))
  };
}

module.exports = { runPurchaseOrderReport };
