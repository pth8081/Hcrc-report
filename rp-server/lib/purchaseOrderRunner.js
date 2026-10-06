// lib/purchaseOrderRunner.js — SourceType='purchaseOrder' (bản 8.75, theo
// yêu cầu người dùng) — 3 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh
// đặt–nhận" dùng CHUNG 1 domain `don_dat_hang` (SL đặt + SL thực nhận nằm
// TRÊN CÙNG 1 DÒNG dwh.ReportFacts — xác nhận qua mẫu "Phiếu đặt hàng"
// thật, xem bc-don-dat-hang.md), khác nhau CHỈ ở definition.columns (cột
// nào hiển thị) — không cần ghép composite nhiều khối.
//
// SỬA bản 8.91 (theo yêu cầu người dùng, đối chiếu lại "quy tắc mã BU_ID
// và STK_ID.md") — bản đầu (8.75) dùng SAI buildStkIdLookup()/STK_ID: SQL
// thật chạy trên ST_ORDER (28/9... à, 06/10/2026) xác nhận cột mã siêu thị
// đồng bộ về là **BU_ID** (giống hệt TRANSHDR, domain giaodich_chinhanh),
// KHÔNG PHẢI STK_ID (STK_ID chỉ có ở STRANS, domain doanh thu) — ST_ORDER
// KHÔNG có khái niệm "kỳ cũ/mới" như STK, chỉ 1 giá trị BU_ID cố định. Giờ
// dùng ĐÚNG buildBuIdLookup() (đọc cột `BuId` tường minh trong bảng "Ánh
// xạ Điểm - STK_ID", KHÔNG tự suy "+00" — xem file quy tắc) — mirror ĐÚNG
// cách lib/compositeReportRunner.js xử lý domain giaodich_chinhanh
// (block.mapBuIdToMaDiem).
//
// KHÁC `directDb` (lib/reportEngine.js) thường ở ĐÚNG 1 điểm: Dimensions.MaDiem
// đồng bộ từ DSMART16 là mã BU_ID THÔ (CSDL trung tâm, không phải mã Điểm
// chuẩn) — runner này tự tra "Ánh xạ Điểm - STK_ID" (lib/diemStkMapping.js)
// để GHI ĐÈ MaDiem/TenDiem bằng mã Điểm + tên siêu thị CHUẨN của HCRC
// TRƯỚC khi chiếu cột. Mọi thứ khác (filters dateRange/multiSelect, cột
// công thức) TÁI DÙNG NGUYÊN lib/reportEngine.js, không viết lại.
//
// BU_ID CHƯA khai tường minh (cột `BuId`) trong bảng ánh xạ bị LOẠI KHỎI
// báo cáo (không hiện mã thô lẫn với mã Điểm chuẩn, không tự suy "+00" —
// cùng triết lý useDiemStkMapping/mapBuIdToMaDiem ở
// lib/compositeReportRunner.js: "không chắc chắn thì KHÔNG hiện").
//
// __storeScope (bản 8.51) so khớp TRỰC TIẾP theo mã Điểm CHUẨN SAU khi đã
// dịch BU_ID -> mã Điểm (filterValues.__storeScope vốn LÀ mảng mã Điểm,
// không phải STK_ID — KHÔNG dùng resolveStoreScopeStkIds() ở đây, hàm đó
// dành cho domain doanh thu dùng STK_ID) — mirror ĐÚNG cách
// lib/compositeReportRunner.js áp storeScope SAU mapBuIdToMaDiem.
const { getPool } = require('../db');
const { runReport, projectColumns, describeColumns } = require('./reportEngine');
const { loadDiemStkMapping, buildBuIdLookup } = require('./diemStkMapping');

const DOMAIN = 'don_dat_hang';

async function runPurchaseOrderReport(definition, filterValues = {}, pagination = { page: 1, pageSize: 500 }) {
  const pool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  const buIdLookup = buildBuIdLookup(diemMapping);
  const storeScope = Array.isArray(filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;

  // Chỉ chuyển filter dateRange/trạng thái xuống SQL (lib/reportEngine.js)
  // — filter "Siêu thị" (nếu có) PHẢI áp dụng SAU khi ghi đè mã Điểm bên
  // dưới, vì Dimensions.MaDiem lưu trong dwh.ReportFacts vẫn là BU_ID thô,
  // KHÔNG so khớp trực tiếp được với mã Điểm chuẩn người dùng chọn.
  const sqlFilters = (definition.filters || []).filter((f) => f.field !== 'maDiem');
  const rawRows = await runReport(pool, { domain: DOMAIN, filters: sqlFilters }, filterValues, pagination);

  const mappedRows = rawRows
    .map((row) => {
      const buId = row.dimensions.MaDiem;
      const maDiem = buIdLookup.get(buId);
      if (!maDiem) return null; // BU_ID chưa khai tường minh trong bảng Ánh xạ Điểm-STK_ID — loại khỏi báo cáo, xem chú thích đầu file
      const info = diemMapping.get(maDiem);
      return {
        ...row,
        dimensions: { ...row.dimensions, MaDiem: maDiem, TenDiem: info?.tenSieuThi || row.dimensions.TenDiem }
      };
    })
    .filter(Boolean)
    .filter((row) => !storeScope || storeScope.has(row.dimensions.MaDiem));

  return {
    columns: describeColumns(definition.columns),
    rows: mappedRows.map((r) => projectColumns(r, definition.columns))
  };
}

module.exports = { runPurchaseOrderReport };
