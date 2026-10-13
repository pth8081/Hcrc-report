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
// MỞ RỘNG bản 9.27 (theo yêu cầu người dùng, đã xác nhận lại từng mã) —
// thêm 2 mã `130`/`330` (trước đây VIEW nguồn chỉ lọc `133`/`333`, LOẠI BỎ
// hẳn giao dịch mang 2 mã này — xem 2 file .sql ở deploy/, DBA cần chạy lại
// để VIEW nhận đủ `TRANS_CODE IN ('133','333','130','330')`). Ý nghĩa:
//   133 = Đặt hàng, kênh "mua riêng"     130 = Đặt hàng, kênh "mua riêng"
//   330 = Đặt hàng, kênh "mua chung"     333 = Nhập hàng, kênh "mua chung" (qua Fuji)
// "Mua riêng" CHỈ có 2 mã đặt, KHÔNG có mã nhập riêng. Xem TRANS_CODE_DAT/
// TRANS_CODE_NHAP/KENH_MUA_CODES bên dưới.
//
// `definition.transCode` (MẢNG mã, vd `['133','130','330']`, TUỲ CHỌN) —
// lọc giao dịch thuộc ĐÚNG tập mã đó, dùng cho 2 báo cáo đơn lẻ "Đơn đặt
// hàng"/"Đơn nhập hàng" (mỗi dòng = 1 lần đặt/1 lần nhận thật, hiện
// NGUYÊN, không gộp). `filterValues.kenhMua` (TUỲ CHỌN, người dùng chủ
// động chọn trên form — xem KENH_MUA_FILTER) lọc THÊM (AND) trong tập đó
// theo kênh mua riêng/mua chung.
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
// TRANS_CODE (bản 9.27, MỞ RỘNG theo yêu cầu người dùng — trước đây CHỈ có
// 133/333, giờ thêm 130/330 cho đúng 2 KÊNH MUA khác nhau, đã xác nhận lại
// với người dùng từng mã một (tránh lặp lại bài học bản 8.92 — từng đoán
// sai nguồn dữ liệu):
//   133 = Đặt hàng (kênh "mua riêng")      130 = Đặt hàng (kênh "mua riêng")
//   330 = Đặt hàng (kênh "mua chung")      333 = Nhập hàng (kênh "mua chung", qua Fuji)
// Tức "mua riêng" CHỈ có 2 mã đặt (133/130), KHÔNG có mã nhập riêng — chỉ
// "mua chung" (qua Fuji) mới có đủ cặp đặt(330)/nhập(333). Mảng THAY cho
// 1 chuỗi cố định trước đây — MỌI so sánh `=== TRANS_CODE_DAT` cũ đổi thành
// `.includes(...)`.
const TRANS_CODE_DAT = ['133', '130', '330'];
const TRANS_CODE_NHAP = ['333'];
// KENH_MUA_CODES — map "kênh mua" (lựa chọn người dùng chọn ở bộ lọc, xem
// KENH_MUA_FILTER trong seedPurchaseOrderReports.js) sang đúng tập mã
// TRANS_CODE của kênh đó — dùng để LỌC THÊM (AND) bên trong tập transCode
// báo cáo đã xác định theo đặt/nhập ở trên, xem filterValues.kenhMua bên
// dưới.
const KENH_MUA_CODES = { rieng: ['133', '130'], chung: ['330', '333'] };

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
    if (TRANS_CODE_DAT.includes(row.dimensions.LoaiGiaoDich)) {
      group.measures.SoLuongTheoDon += qty;
      group.measures.DonGia = row.measures.DonGia; // ưu tiên đơn giá của dòng đặt gốc
      group.dimensions = { ...group.dimensions, ...row.dimensions }; // mô tả (NCC/ngày giao...) ưu tiên từ dòng đặt gốc
    } else if (TRANS_CODE_NHAP.includes(row.dimensions.LoaiGiaoDich)) {
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
    if (TRANS_CODE_DAT.includes(row.dimensions.LoaiGiaoDich)) group.measures.GiaTriDat += amount;
    else if (TRANS_CODE_NHAP.includes(row.dimensions.LoaiGiaoDich)) group.measures.GiaTriNhap += amount;
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
//
// `displayRows`/`allRows` TÁCH RIÊNG (bản 9.23) — khi web xem bị cắt bớt
// (xem capForDisplay ở runPurchaseOrderReport bên dưới), tổng cộng vẫn PHẢI
// cộng đúng TOÀN BỘ dữ liệu đã lọc (allRows), không phải chỉ phần đang hiện
// ra (displayRows) — nếu không "Tổng cộng" sẽ hiện SAI (chỉ cộng vài trăm
// dòng đầu), còn gây hiểu lầm nặng hơn cả việc thiếu dòng chi tiết.
function appendGrandTotal(displayRows, allRows) {
  if (!allRows.length) return displayRows;
  const measureKeys = new Set();
  for (const r of allRows) for (const k of Object.keys(r.measures || {})) measureKeys.add(k);
  const totalMeasures = {};
  for (const k of measureKeys) {
    totalMeasures[k] = allRows.reduce((sum, r) => sum + (typeof r.measures[k] === 'number' ? r.measures[k] : 0), 0);
  }
  return [...displayRows, {
    entityCode: null,
    sourceSystem: allRows[0].sourceSystem,
    eventDate: allRows[0].eventDate,
    dimensions: { TenNCC: 'Tổng cộng' },
    measures: totalMeasures,
    __isSubtotal: true,
    __isGrandTotal: true
  }];
}

async function runPurchaseOrderReport(definition, filterValues = {}, pagination = {}) {
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
  // Bộ lọc "Kênh mua" (bản 9.27, theo yêu cầu người dùng) — "Mua riêng"
  // (mã 133/130) / "Mua chung qua Fuji" (mã 330/333), xem KENH_MUA_CODES ở
  // đầu file + KENH_MUA_FILTER trong seedPurchaseOrderReports.js. Không
  // chọn gì = không lọc thêm (giữ nguyên tập mã đã xác định theo
  // đặt/nhập ở `definition.transCode`). Áp dụng Ở SQL-FILTER-LEVEL (JS,
  // cùng chỗ với `definition.transCode`) — TRƯỚC khi gộp, vì phân loại
  // kênh dựa thẳng vào TRANS_CODE của TỪNG DÒNG THÔ, không bị ảnh hưởng
  // bởi vấn đề "gộp cặp 2 dòng khác Trạng thái" như trangThaiFilter.
  const kenhMuaFilter = Array.isArray(filterValues.kenhMua) && filterValues.kenhMua.length
    ? new Set(filterValues.kenhMua.flatMap((k) => KENH_MUA_CODES[k] || []))
    : null;

  // Chỉ chuyển filter dateRange/NCC xuống SQL (lib/reportEngine.js) —
  // "Siêu thị" PHẢI áp dụng SAU khi ghi đè mã Điểm bên dưới (Dimensions.
  // MaDiem lưu trong dwh.ReportFacts vẫn là BU_ID thô), "Trạng thái" PHẢI
  // áp dụng SAU khi gộp (xem chú thích trangThaiFilter ở trên), "Kênh mua"
  // áp dụng Ở JS cùng transCode (xem trên) — cả 3 loại khỏi sqlFilters.
  const sqlFilters = (definition.filters || []).filter((f) => f.field !== 'maDiem' && f.field !== 'trangThai' && f.field !== 'kenhMua');
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

  // definition.transCode giờ LUÔN là MẢNG (vd ['133','130','330'] cho báo
  // cáo "Đơn đặt hàng" — xem seedPurchaseOrderReports.js) — `.includes()`
  // thay cho so sánh `===` 1 mã cố định trước đây.
  if (definition.transCode) {
    mappedRows = mappedRows.filter((row) => definition.transCode.includes(row.dimensions.LoaiGiaoDich));
  }
  if (kenhMuaFilter) {
    mappedRows = mappedRows.filter((row) => kenhMuaFilter.has(row.dimensions.LoaiGiaoDich));
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

  // Cắt bớt dòng TRẢ VỀ cho xem trên web (bản 9.23, SỬA LỖI TREO TRÌNH
  // DUYỆT — báo cáo người dùng: chọn "Đơn đặt hàng" 1 tháng, có đủ dữ liệu
  // lịch sử rồi nhưng web TREO cứng lúc tải). NGUYÊN NHÂN: hàm này (từ bản
  // 9.17, sửa lỗi "khoảng ngày rộng làm mất dữ liệu") CỐ Ý lấy ĐỦ mọi dòng
  // thô từ SQL — ĐÚNG cho /export (phải xuất đủ, không được cắt), nhưng từ
  // đó tới giờ KHÔNG còn tôn trọng `pagination` nữa, nên /run (xem trên
  // web, luôn gọi page:1/pageSize:200 — xem routes/reports.js +
  // rp-user/.../ReportsPage.jsx) cũng nhận NGUYÊN hàng chục nghìn dòng (giờ
  // có thêm lịch sử nhiều năm) đổ thẳng vào DataTable KHÔNG ảo hoá
  // (components/DataTable.jsx dựng <tr> cho MỌI dòng cùng lúc) — trình
  // duyệt phải dựng hàng chục nghìn dòng DOM 1 lượt, treo cứng (nặng nhất
  // trên điện thoại).
  //
  // CHỈ cắt khi gọi từ /run — routes/reports.js gắn rõ ràng
  // `pagination.capForDisplay = true` CHỈ ở đúng chỗ đó; /export,
  // jobs/reportEmailScheduler.js, lib/anomalyAlertRunner.js,
  // routes/dashboards.js đều KHÔNG gắn cờ này nên vẫn nhận ĐỦ dữ liệu như
  // trước, không tái lập lỗi bản 9.17. Cắt SAU KHI đã lọc/gộp/Trạng thái
  // xong (mappedRows lúc này đã là kết quả CUỐI CÙNG đúng) — dòng "Tổng
  // cộng" (nếu có) vẫn cộng dựa trên TOÀN BỘ mappedRows trước khi cắt (xem
  // appendGrandTotal(displayRows, allRows) ở trên), không phải chỉ phần
  // hiện ra, rồi mới gắn vào SAU phần đã cắt.
  const fullMappedRows = mappedRows;
  const warnings = [];
  if (pagination?.capForDisplay && pagination.pageSize && mappedRows.length > pagination.pageSize) {
    const page = Math.max(1, pagination.page || 1);
    const start = (page - 1) * pagination.pageSize;
    mappedRows = mappedRows.slice(start, start + pagination.pageSize);
    warnings.push(`Chỉ hiện ${mappedRows.length} dòng đầu trên tổng ${fullMappedRows.length} dòng — bộ lọc quá rộng để hiện hết trên web. Bấm "Xuất Excel"/"Xuất PDF" để xem đầy đủ.`);
  }

  if (definition.showGrandTotal) {
    mappedRows = appendGrandTotal(mappedRows, fullMappedRows);
  }

  return {
    columns: describeColumns(definition.columns),
    rows: mappedRows.map((r) => projectColumns(r, definition.columns)),
    warnings
  };
}

module.exports = { runPurchaseOrderReport };
