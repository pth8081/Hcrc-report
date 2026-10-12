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
// `definition.aggregateOrderTotal` (`true`, TUỲ CHỌN, dùng CÙNG với
// `definition.transCode` — bản 9.08, theo yêu cầu người dùng) — gộp các
// dòng/mặt hàng CÙNG 1 đơn (MaDiem+SoDon) thành 1 dòng duy nhất, CỘNG DỒN
// `ThanhTien`/`SoLuong` của TOÀN đơn thành `measures.TongGiaTri`/
// `measures.TongSoLuong`. Dùng cho "Giá trị đặt hàng theo đơn"/"Giá trị
// nhập hàng theo đơn" (xem mục KẾT LUẬN THIẾT KẾ bổ sung trong
// bc-don-dat-hang.md) — KHÁC `aggregateByOrder` ở trên (gộp theo
// MaDiem+SoDon+MaHang, tách riêng SL đặt/SL nhận, dùng cho "So sánh
// đặt–nhận"): ở đây CHỈ 1 loại giao dịch (đã lọc sẵn qua `transCode`), gộp
// tới cấp ĐƠN (bỏ qua MaHang), không cần tách SL theo loại.
//
// `definition.aggregateBySupplier` (`true`, TUỲ CHỌN, KHÔNG dùng cùng
// `transCode`/`aggregateByOrder`/`aggregateOrderTotal` — bản 9.08, theo yêu
// cầu người dùng) — gộp CẢ 2 loại `133`+`333`, TOÀN BỘ chi nhánh/đơn hàng
// trong khoảng ngày đã chọn, CHỈ theo `MaNCC` (đúng nghĩa "theo nhà cung
// cấp", KHÔNG tách siêu thị) — ra `measures.GiaTriDat`/`measures.GiaTriNhap`.
// Dùng cho "So sánh giá trị đặt–nhập theo NCC".
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

// Phân trang lấy ĐỦ dữ liệu (bản 9.17, theo báo cáo người dùng — chọn
// khoảng ngày rộng/cả năm ra thiếu dữ liệu) — TRƯỚC ĐÂY chỉ gọi runReport()
// ĐÚNG 1 LƯỢT (mặc định tối đa 500 dòng/lượt, ORDER BY EventDate DESC —
// xem reportEngine.js), nên khoảng ngày rộng (cả năm, nhiều chi nhánh) dễ
// vượt quá 500 dòng thô — phần NGÀY XA HƠN trong khoảng bị ÂM THẦM BỎ QUA,
// không có cảnh báo gì (khác báo cáo trống rõ ràng — rất dễ hiểu nhầm là
// đúng). CÙNG lỗi/CÙNG cách sửa đã áp dụng cho 4 báo cáo doanh thu cuối
// ngày ở bản 8.99 (xem lib/compositeReportRunner.js:fetchAllReportRows).
const REPORT_FETCH_BATCH_SIZE = 5000;
async function fetchAllReportRows(pool, blockDefinition, blockFilterValues) {
  const allRows = [];
  let page = 1;
  for (;;) {
    const pageRows = await runReport(pool, blockDefinition, blockFilterValues, { page, pageSize: REPORT_FETCH_BATCH_SIZE });
    allRows.push(...pageRows);
    if (pageRows.length < REPORT_FETCH_BATCH_SIZE) break;
    page += 1;
  }
  return allRows;
}

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

// Gộp các dòng CÙNG 1 đơn (MaDiem+SoDon) thành 1 dòng — dùng SAU KHI đã lọc
// `transCode` (CHỈ 1 loại giao dịch trong `rows`), nên không cần tách SL/giá
// trị theo loại như aggregateByOrder(). Dimensions (NCC/ngày giao/trạng
// thái...) lấy từ dòng ĐẦU TIÊN gặp trong nhóm — 1 đơn có thể có vài mặt
// hàng trạng thái khác nhau (vd đơn nhập 1 phần), chấp nhận đơn giản hoá lấy
// đại diện 1 dòng, KHÔNG cố gộp nhiều trạng thái thành 1 nhãn.
function aggregateOrderTotal(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.dimensions.MaDiem}|${row.dimensions.SoDon}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...row, dimensions: { ...row.dimensions }, measures: { TongSoLuong: 0, TongGiaTri: 0 } };
      groups.set(key, group);
    }
    group.measures.TongSoLuong += row.measures.SoLuong || 0;
    group.measures.TongGiaTri += row.measures.ThanhTien || 0;
  }
  return Array.from(groups.values());
}

// Gộp CẢ 2 loại giao dịch, CHỈ theo MaNCC (bỏ qua MaDiem/SoDon/MaHang) —
// đúng nghĩa "theo nhà cung cấp", cộng dồn TOÀN BỘ chi nhánh trong khoảng
// ngày đã chọn vào 1 dòng/1 NCC. TenNCC lấy từ dòng đầu tiên gặp (cùng 1
// MaNCC luôn cùng 1 TenNCC, không có nhập nhằng như aggregateByOrder()).
function aggregateBySupplier(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.dimensions.MaNCC;
    let group = groups.get(key);
    if (!group) {
      group = { ...row, dimensions: { ...row.dimensions }, measures: { GiaTriDat: 0, GiaTriNhap: 0 } };
      groups.set(key, group);
    }
    const amount = row.measures.ThanhTien || 0;
    if (row.dimensions.LoaiGiaoDich === TRANS_CODE_DAT) group.measures.GiaTriDat += amount;
    else if (row.dimensions.LoaiGiaoDich === TRANS_CODE_NHAP) group.measures.GiaTriNhap += amount;
  }
  return Array.from(groups.values());
}

// Dòng "Tổng cộng" cuối báo cáo (bản 9.15, theo yêu cầu người dùng — "phải
// có tổng cộng giá trị để phần so sánh giá nhập và đặt chính xác hơn") —
// cộng dồn MỌI measures số đang có thành 1 dòng cuối, nhãn "Tổng cộng" ở
// cột TenNCC (cột chung cả 6 báo cáo). Dùng ĐÚNG quy ước __isSubtotal/
// __isGrandTotal đã có sẵn (lib/compositeReportRunner.js) — DataTable.jsx
// (web)/exportExcel.js/exportPdf.js đã TỰ nhận diện 2 cờ này để tô màu
// xanh/in đậm, KHÔNG cần đổi gì thêm ở tầng hiển thị dù báo cáo này không
// có columnGroups (xem rp-user/src/lib/reportGroupColors.js:
// resolveRowFillColor — nhánh __isGrandTotal không phụ thuộc columnGroups).
//
// CHỈ gọi hàm này cho báo cáo có TOÀN BỘ measures là số CỘNG DỒN ĐƯỢC
// (giá trị tiền/số lượng) — KHÔNG gọi cho "Đơn đặt hàng"/"Đơn nhập hàng"/
// "So sánh đặt–nhận" (có cột `DonGia` = đơn giá/1 đơn vị, cộng dồn đơn giá
// của nhiều mặt hàng khác nhau ra số vô nghĩa, còn gây hiểu lầm là "tổng
// giá trị" — xem definition.showGrandTotal ở seedPurchaseOrderReports.js,
// chỉ bật cho 3 báo cáo "giá trị" không có đơn giá).
// Không có dòng dữ liệu nào thì KHÔNG thêm dòng Tổng cộng (tránh hiện toàn
// số 0 gây hiểu nhầm là có dữ liệu).
function appendGrandTotal(rows) {
  if (!rows.length) return rows;
  const measureKeys = new Set();
  for (const r of rows) for (const k of Object.keys(r.measures || {})) measureKeys.add(k);
  const totalMeasures = {};
  for (const k of measureKeys) {
    totalMeasures[k] = rows.reduce((sum, r) => sum + (typeof r.measures[k] === 'number' ? r.measures[k] : 0), 0);
  }
  return [...rows, {
    entityCode: null,
    sourceSystem: rows[0].sourceSystem,
    eventDate: rows[0].eventDate,
    dimensions: { TenNCC: 'Tổng cộng' },
    measures: totalMeasures,
    __isSubtotal: true,
    __isGrandTotal: true
  }];
}

async function runPurchaseOrderReport(definition, filterValues = {}) {
  const pool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  const buIdLookup = buildBuIdLookup(diemMapping);
  const storeScope = Array.isArray(filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;
  // Bộ lọc "Siêu thị" NGƯỜI DÙNG chủ động chọn trên form (bản 9.13, theo
  // yêu cầu người dùng — báo cáo "So sánh giá trị đặt–nhập theo NCC":
  // không chọn gì = gộp TOÀN BỘ siêu thị như cũ, chọn 1/nhiều siêu thị =
  // CHỈ gộp đúng (các) siêu thị đó) — KHÁC storeScope ở trên (giới hạn
  // QUYỀN admin gán cho người dùng, không phải lựa chọn chủ động). Chỉ áp
  // dụng khi definition có khai filter field 'maDiem' (xem optionsSource.
  // storeCatalog ở routes/reports.js) — báo cáo không khai filter này thì
  // filterValues.maDiem luôn rỗng, dòng dưới không có tác dụng gì.
  const userStoreFilter = Array.isArray(filterValues.maDiem) && filterValues.maDiem.length ? new Set(filterValues.maDiem) : null;
  // Bộ lọc "Trạng thái" (bản 9.17, SỬA LỖI phát hiện qua báo cáo người
  // dùng) — TRƯỚC ĐÂY xuống SQL, áp vào TỪNG DÒNG THÔ (đặt/nhận riêng)
  // TRƯỚC KHI gộp cặp — "So sánh đặt–nhận"/"...theo đơn" gộp CẢ dòng 133
  // VÀ 333 của cùng 1 đơn; nếu 2 dòng đó có TrangThai KHÁC NHAU (bình
  // thường — vd đơn "Đã nhập 1 phần": dòng 133 gốc giữ nguyên trạng thái
  // CUỐI, dòng 333 lần nhận cụ thể có thể ghi trạng thái khác), lọc trạng
  // thái Ở SQL trước khi gộp có thể làm rụng mất ĐÚNG dòng cần ghép cặp,
  // ra kết quả thiếu/rỗng dù có dữ liệu thật. Giờ lọc SAU khi đã gộp xong
  // (dùng TrangThai của dòng ĐẠI DIỆN đã chọn trong aggregateByOrder()/
  // aggregateOrderTotal()), không ảnh hưởng gì bước gộp.
  const trangThaiFilter = Array.isArray(filterValues.trangThai) && filterValues.trangThai.length ? new Set(filterValues.trangThai) : null;

  // Chỉ chuyển filter dateRange/NCC xuống SQL (lib/reportEngine.js) —
  // "Siêu thị" PHẢI áp dụng SAU khi ghi đè mã Điểm bên dưới (Dimensions.
  // MaDiem lưu trong dwh.ReportFacts vẫn là BU_ID thô), "Trạng thái" PHẢI
  // áp dụng SAU khi gộp (xem chú thích trangThaiFilter ở trên) — cả 2 loại
  // khỏi sqlFilters.
  const sqlFilters = (definition.filters || []).filter((f) => f.field !== 'maDiem' && f.field !== 'trangThai');
  const rawRows = await fetchAllReportRows(pool, { domain: DOMAIN, filters: sqlFilters }, filterValues);

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
    .filter((row) => !storeScope || storeScope.has(row.dimensions.MaDiem))
    .filter((row) => !userStoreFilter || userStoreFilter.has(row.dimensions.MaDiem));

  if (definition.transCode) {
    mappedRows = mappedRows.filter((row) => row.dimensions.LoaiGiaoDich === definition.transCode);
  }
  if (definition.aggregateByOrder) {
    mappedRows = aggregateByOrder(mappedRows);
  } else if (definition.aggregateOrderTotal) {
    mappedRows = aggregateOrderTotal(mappedRows);
  } else if (definition.aggregateBySupplier) {
    mappedRows = aggregateBySupplier(mappedRows);
  }

  // Lọc Trạng thái SAU KHI gộp (xem chú thích trangThaiFilter ở trên) —
  // đặt TRƯỚC showGrandTotal để dòng "Tổng cộng" chỉ cộng đúng các dòng đã
  // lọc, không cộng cả phần đã bị loại.
  if (trangThaiFilter) {
    mappedRows = mappedRows.filter((row) => trangThaiFilter.has(row.dimensions.TrangThai));
  }

  if (definition.showGrandTotal) {
    mappedRows = appendGrandTotal(mappedRows);
  }

  return {
    columns: describeColumns(definition.columns),
    rows: mappedRows.map((r) => projectColumns(r, definition.columns))
  };
}

module.exports = { runPurchaseOrderReport };
