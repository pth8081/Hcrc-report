// lib/purchaseOrderRunner.js — SourceType='purchaseOrder' — 3 báo cáo
// "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận" dùng CHUNG 1 domain
// `don_dat_hang` (xem bc-don-dat-hang.md — tài liệu đầy đủ nguồn dữ liệu/
// thiết kế), khác nhau ở `definition.transCode`/`definition.aggregateByOrder`
// (xem bên dưới) chứ không phải 3 runner riêng.
//
// SỬA bản 8.92 (theo yêu cầu người dùng, đối chiếu lại DBA) — bản 8.75/8.91
// giả định SAI nguồn dữ liệu (ST_ORDER, SL đặt+SL nhận TRÊN CÙNG 1 DÒNG).
// DBA xác nhận nguồn THẬT là `STRANS` (bảng ĐÃ dùng cho báo cáo doanh thu),
// lọc `TRANS_CODE IN ('133','333')` — `133`=đặt hàng, `333`=nhập hàng, MỖI
// LOẠI 1 DÒNG RIÊNG (KHÔNG chung 1 dòng) — và 1 đơn có thể được NHẬN NHIỀU
// LẦN (nhiều dòng `333` khác nhau). Cột `REF` ("mã đơn hàng gốc", đã xác
// nhận) là khoá nhóm các lần nhận hàng lại với đúng đơn đặt ban đầu — xem
// mục "KẾT LUẬN THIẾT KẾ" trong bc-don-dat-hang.md.
//
// `definition.transCode` ('133' hoặc '333', TUỲ CHỌN) — lọc CHỈ 1 loại
// giao dịch, dùng cho 2 báo cáo đơn lẻ "Đơn đặt hàng"/"Đơn nhập hàng" (mỗi
// dòng = 1 lần đặt/1 lần nhận thật, hiện NGUYÊN, không gộp).
//
// `definition.aggregateByOrder` (`true`, TUỲ CHỌN) — dùng cho "So sánh
// đặt–nhận": gộp CẢ 2 loại `133`+`333` theo (MaDiem + SoDon + MaHang),
// SUM riêng `SoLuong` của từng loại thành `measures.SoLuongTheoDon`
// (tổng các dòng `133`, thường chỉ 1 dòng) / `measures.SoLuongThucNhan`
// (tổng các dòng `333`, CÓ THỂ nhiều dòng nếu nhận nhiều lần) — ĐÚNG công
// thức đã chốt với người dùng. `DonGia`/các cột mô tả khác lấy từ dòng
// `133` (đơn đặt gốc) trong nhóm, KHÔNG lấy từ dòng `333`.
//
// KHÁC `directDb` (lib/reportEngine.js) thường ở ĐÚNG 1 điểm: Dimensions.MaDiem
// đồng bộ từ DSMART16 là mã BU_ID THÔ (CSDL trung tâm, không phải mã Điểm
// chuẩn) — runner này tự tra "Ánh xạ Điểm - STK_ID" (lib/diemStkMapping.js)
// để GHI ĐÈ MaDiem/TenDiem bằng mã Điểm + tên siêu thị CHUẨN của HCRC
// TRƯỚC khi chiếu cột, dùng buildBuIdLookup() (đọc cột `BuId` tường minh,
// KHÔNG tự suy "+00" — xem "quy tắc mã BU_ID và STK_ID.md"), mirror ĐÚNG
// cách lib/compositeReportRunner.js xử lý domain giaodich_chinhanh
// (block.mapBuIdToMaDiem). Mọi thứ khác (filters dateRange/multiSelect,
// cột công thức) TÁI DÙNG NGUYÊN lib/reportEngine.js, không viết lại.
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
const TRANS_CODE_DAT = '133';
const TRANS_CODE_NHAP = '333';

// Gộp nhiều dòng (133 + 333*) của CÙNG 1 (MaDiem+SoDon+MaHang) thành 1
// dòng duy nhất cho báo cáo "So sánh đặt–nhận" — SUM riêng SoLuong theo
// đúng loại giao dịch, các cột mô tả khác (TenNCC/NguoiDat/NgayGiao...)
// ưu tiên lấy từ dòng `133` (đơn đặt gốc), dự phòng dòng đầu tiên gặp nếu
// nhóm đó THIẾU hẳn dòng `133` (dữ liệu bất thường, hiếm — vẫn hiện ra
// thay vì loại bỏ, để admin tự nhận ra qua số liệu lệch).
function aggregateByOrder(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.dimensions.MaDiem}|${row.dimensions.SoDon}|${row.dimensions.MaHang}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...row, dimensions: { ...row.dimensions }, measures: { SoLuongTheoDon: 0, SoLuongThucNhan: 0, DonGia: row.measures.DonGia } };
      groups.set(key, group);
    }
    const qty = row.measures.SoLuong || 0;
    if (row.dimensions.LoaiGiaoDich === TRANS_CODE_DAT) {
      group.measures.SoLuongTheoDon += qty;
      group.measures.DonGia = row.measures.DonGia; // ưu tiên đơn giá của dòng đặt gốc
      group.dimensions = { ...group.dimensions, ...row.dimensions }; // mô tả (NCC/ngày giao...) ưu tiên từ dòng đặt gốc
    } else if (row.dimensions.LoaiGiaoDich === TRANS_CODE_NHAP) {
      group.measures.SoLuongThucNhan += qty;
    }
  }
  return Array.from(groups.values());
}

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

  let mappedRows = rawRows
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

  if (definition.transCode) {
    mappedRows = mappedRows.filter((row) => row.dimensions.LoaiGiaoDich === definition.transCode);
  }
  if (definition.aggregateByOrder) {
    mappedRows = aggregateByOrder(mappedRows);
  }

  return {
    columns: describeColumns(definition.columns),
    rows: mappedRows.map((r) => projectColumns(r, definition.columns))
  };
}

module.exports = { runPurchaseOrderReport };
