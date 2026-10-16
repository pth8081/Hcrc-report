// lib/coreZeroStockRunner.js — SourceType='coreZeroStock': báo cáo "Core
// stock = 0" — KHÁC lib/topSellingZeroStockRunner.js ('topZeroStock') ở
// bước CHỌN thực thể: không tự xếp hạng theo doanh số, mà dùng ĐÚNG danh
// sách mặt hàng "Core" cố định (etl.CoreItemList, xem lib/coreItemList.js)
// do admin tự khai/upload — áp dụng CHUNG cho MỌI kho cùng LoaiĐiểm
// (MART/MINIMART), không khai riêng theo từng kho (xác nhận người dùng).
// Công thức tính tồn kho ước tính hôm nay DÙNG LẠI NGUYÊN VẸN công thức đã
// chốt ở topSellingZeroStockRunner.js (qua lib/reportFactsHelpers.js dùng
// chung):
//   Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC
//   hôm nay trong stockDomain) − Số lượng bán HÔM NAY, KHÔNG cộng lại hàng
//   nhập trong ngày.
//
// Cột hiển thị KHỚP ĐÚNG khuôn file mẫu "Stock_Core_....xlsx" khách hàng
// đang dùng (Mã điểm/Mã kho/Tên kho/Mã hàng/Tên hàng/Đvt/Mã ngành/Tên
// ngành/Tồn Kho/Ngày bán cuối/Ngày nhập cuối/SL đang đặt/Ngày đặt/Mã đang
// đặt) — xem bc-core-ton-kho-0.md mục "So khớp với file mẫu Excel".
//
// Các bước:
//   1. Nạp bản đầy đủ danh sách Core (MaHang + mh/tenHang/dvt/maNganh/
//      tenNganh tham khảo) của đúng definition.loaiDiem.
//   2. Xác định STK_ID nào thuộc đúng loaiDiem — dùng LẠI dimension "chain"
//      (MART/MINIMART) đã có sẵn ở domain doanh thu chi nhánh
//      (definition.chainDomain, mặc định 'doanhthu_chinhanh'), KHÔNG cần
//      job/VIEW mới (xem bc-core-ton-kho-0.md).
//   3. Quét toàn bộ (kho, mã hàng) đang có dữ liệu tồn kho
//      (definition.stockDomain), giữ lại đúng cặp có STK_ID thuộc bước 2 VÀ
//      MaHangHienThi thuộc bước 1.
//   4. Với đúng các cặp còn lại, tính tồn ước tính theo công thức trên, chỉ
//      giữ <= threshold (mặc định 0).
//   5. TUỲ CHỌN (cấu hình qua DefinitionJson, không hardcode — cùng
//      nguyên tắc "Chờ nhập"/"Đã nhập" ở topSellingZeroStockRunner.js):
//      - lockAllDomain/lockByStoreDomain (measure 'KhoaAll'/'KhoaTheoKho',
//        giá trị = 1 nghĩa là ĐANG khoá) — loại khỏi kết quả, đúng hành vi
//        cột "Khóa All"/"Khóa theo kho" trong file mẫu (export đã pre-filter
//        "Bỏ khóa", nên báo cáo cũng LOẠI HẲN thay vì hiển thị cột 0/1).
//      - pendingOrderDomain (measure 'SoLuongDangDat') — hiển thị thêm
//        "SL đang đặt"/"Ngày đặt" (measure + EventDate của dòng gần nhất)
//        VÀ "Mã đang đặt" (0/1, tự suy ra từ SL đang đặt > 0) — THUẦN THAM
//        KHẢO, không ảnh hưởng việc lọc tồn=0.
//      - lastReceivedDomain (measure 'SoLuongDaNhap') — hiển thị thêm
//        "Ngày nhập cuối" (EventDate của dòng gần nhất, KHÔNG giới hạn
//        "hôm nay" — khác 4 domain "Đã nhập hôm nay" ở topZeroStock).
//   6. "Ngày bán cuối" LUÔN hiển thị (không tuỳ chọn, đọc từ
//      definition.salesDomain đã bắt buộc cấu hình) — ngày gần nhất mặt
//      hàng đó CÓ bán tại đúng kho, không giới hạn khoảng thời gian.
//   7. "Mã điểm" (BU_ID dùng trong file chỉ tiêu, KHÁC "Mã kho"/STK_ID) —
//      TUỲ CHỌN, tự tra ngược qua "Ánh xạ Điểm - STK_ID" đã có sẵn
//      (lib/diemStkMapping.js, dùng lại NGUYÊN VẸN, không cần job/cấu hình
//      thêm) — STK_ID nào CHƯA khai ánh xạ thì để trống, không phải lỗi.
//
// DefinitionJson bắt buộc: { loaiDiem: 'MART'|'MINIMART', stockDomain,
// salesDomain, chainDomain }. Tuỳ chọn: threshold (mặc định 0), dataSourceId,
// lockAllDomain, lockByStoreDomain, pendingOrderDomain, lastReceivedDomain.
//
// filterValues: { branches: [STK_ID,...] (rỗng/bỏ trống = tất cả STK_ID
// thuộc đúng loaiDiem) }.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const {
  todayUTC, loadLatestMeasureBefore, loadLatestMeasure, loadLatestMeasureWithDate,
  loadSumOnDate, loadLatestDimensionsForDomain
} = require('./reportFactsHelpers');
const { loadCoreItemListByKho, getLastLoadError } = require('./coreItemList');
const { loadDiemStkMapping } = require('./diemStkMapping');
const { assignSttIfPresent } = require('./reportCellFormat');

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function describeColumns(definition) {
  const columns = [
    // stt (bản 9.44, theo yêu cầu người dùng) — gán giá trị SAU bằng
    // assignSttIfPresent (xem cuối runCoreZeroStockReport), căn giữa tự áp
    // dụng ở web/Excel/PDF theo đúng key 'stt'.
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'dvt', label: 'Đvt', width: 0.6 },
    { key: 'maNganh', label: 'Mã ngành', width: 0.8 },
    { key: 'tenNganh', label: 'Tên ngành', width: 1.4 },
    // maNCC/tenNCC/luongGiaoHang (bản 9.46, theo yêu cầu người dùng — lấy từ
    // chính file "Danh sách hàng Core" đã upload, xem etl/lib/coreItemListImport.js)
    // — THUẦN THAM KHẢO, không ảnh hưởng việc lọc tồn=0, có thể để trống nếu
    // dòng Core đó không khai (không bắt buộc).
    { key: 'maNCC', label: 'Mã NCC', width: 0.8 },
    { key: 'tenNCC', label: 'Nhà cung cấp', width: 1.4 },
    { key: 'luongGiaoHang', label: 'Luồng giao hàng', width: 1 },
    { key: 'tonKho', label: 'Tồn Kho', width: 0.8 },
    { key: 'ngayBanCuoi', label: 'Ngày bán cuối', width: 1 }
  ];
  if (definition.lastReceivedDomain) columns.push({ key: 'ngayNhapCuoi', label: 'Ngày nhập cuối', width: 1 });
  if (definition.pendingOrderDomain) {
    columns.push({ key: 'slDangDat', label: 'SL đang đặt', width: 0.8 });
    columns.push({ key: 'ngayDat', label: 'Ngày đặt', width: 0.9 });
    columns.push({ key: 'maDangDat', label: 'Mã đang đặt', width: 0.7 });
  }
  return columns;
}

// "Ngày ..." chỉ mang ý nghĩa NGÀY (không có giờ) — EventDate từ SQL Server
// trả về kèm giờ 00:00:00, để nguyên object Date thì Excel/PDF in ra cả
// "Thu Sep 24 2026 00:00:00" (xem lib/exportPdf.js — không tự định dạng lại
// Date), ở đây format sẵn thành "YYYY-MM-DD" cho dễ đọc.
function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return value.toISOString().slice(0, 10);
}

// STK_ID (Mã kho) -> Mã điểm (BU_ID) — tra NGƯỢC "Ánh xạ Điểm - STK_ID" đã
// có sẵn (ưu tiên maStkMoi — kho ĐANG dùng hiện tại). Không tìm thấy -> để
// trống, KHÔNG coi là lỗi (không phải kho nào cũng cần khai ánh xạ này nếu
// không dùng báo cáo LDTD/HCRC). Nhận diemMapping ĐÃ NẠP SẴN (xem Bước 2 ở
// runCoreZeroStockReport) — tránh round-trip CSDL ETL_DIEM_STK 2 lần/lượt chạy.
function buildStkToDiemMap(diemMapping) {
  const stkToDiem = new Map();
  for (const [maDiem, info] of diemMapping) {
    for (const stk of info.maStkMoi) stkToDiem.set(stk, maDiem);
  }
  return stkToDiem;
}

// STK_ID nào được admin khai TƯỜNG MINH LoaiChuoi (MART/MINIMART) đúng
// loaiDiem trong "Ánh xạ Điểm - STK_ID" — GHI ĐÈ/BỔ SUNG cho "chain" tự động
// lấy từ domain doanhthu_chinhanh (bản 9.52, theo yêu cầu người dùng: dùng
// LẠI NGUYÊN VẸN cơ chế LoaiChuoi đã có sẵn cho báo cáo LDTD/HCRC — xem
// remapRowsToDiem() ở lib/diemStkMapping.js — thay vì phụ thuộc HOÀN TOÀN
// vào job doanhthu_chinhanh đã đồng bộ đủ "chain" cho ĐÚNG kho đang cần hay
// chưa, vì 1 số kho — vd các siêu thị Thành viên tuy CÓ dữ liệu bán hàng/tồn
// kho ở domain banhang_sku/tonkho_sku trung tâm nhưng domain doanhthu_chinhanh
// lại chưa gắn "chain" cho đúng mã kho đó). CHỈ dùng maStkMoi (kho hiện tại).
function eligibleStkFromDiemMapping(diemMapping, loaiDiem) {
  const stkIds = new Set();
  for (const [, info] of diemMapping) {
    if (String(info.loaiChuoi || '').toUpperCase() !== loaiDiem) continue;
    for (const stk of info.maStkMoi) stkIds.add(stk);
  }
  return stkIds;
}

// Gộp 2 nguồn xác định STK_ID thuộc đúng loaiDiem — "chain" tự động (domain
// chainDomain) + LoaiChuoi khai tay ("Ánh xạ Điểm - STK_ID") — TÁCH RIÊNG
// khỏi runCoreZeroStockReport() (bản 9.54) để dùng LẠI được ở
// resolveEligibleBranchOptions() bên dưới (dropdown "Chi nhánh"), không
// phải chép lại logic 2 nơi.
async function loadEligibleStk(pool, chainDomain, loaiDiem, diemMapping) {
  const chainByEntity = await loadLatestDimensionsForDomain(pool, chainDomain, ['chain']);
  const eligibleStk = new Set();
  for (const [entityCode, info] of chainByEntity) {
    if (String(info.dimensions.chain || '').toUpperCase() === loaiDiem) eligibleStk.add(entityCode);
  }
  for (const stk of eligibleStkFromDiemMapping(diemMapping, loaiDiem)) eligibleStk.add(stk);
  return eligibleStk;
}

// Danh sách {value, label} CHO ĐÚNG dropdown "Chi nhánh" của 1 báo cáo Core
// stock=0 (Mart/Minimart) — CHỈ gồm STK_ID thuộc đúng loaiDiem (bản 9.54,
// theo yêu cầu người dùng: dropdown cũ hiện TOÀN BỘ chi nhánh — kể cả khác
// loại điểm — optionsSource.domain='banhang_sku' không lọc gì — khiến người
// dùng liên tục chọn nhầm chi nhánh khác loại điểm).
//
// Nhãn hiển thị CHỈ lấy từ TenSieuThi khai tay ở "Ánh xạ Điểm - STK_ID"
// (bản 9.56, theo yêu cầu người dùng — bỏ HẲN việc quét domain
// definition.salesDomain để dò tên như bản 9.53-9.55: domain đó (banhang_sku)
// có RẤT NHIỀU dòng/kho (1 dòng/mã hàng), quét toàn domain vừa CHẬM vừa từng
// dính lỗi "chốt nhầm dòng không có tên" (bản 9.55) — "Ánh xạ Điểm - STK_ID"
// đã là nguồn ĐÁNG TIN hơn cho tên siêu thị (admin tự khai, dùng chung cho cả
// báo cáo LDTD/HCRC), không cần dự phòng domain nguồn nữa. STK_ID nào CHƯA
// khai ánh xạ thì hiện tạm mã kho — không phải lỗi, chỉ là admin cần bổ
// sung dòng đó vào "Ánh xạ Điểm - STK_ID". Dùng cho
// routes/reports.js:optionsSource.coreZeroStockBranches.
async function resolveEligibleBranchOptions(definition) {
  if (!definition.loaiDiem || !definition.chainDomain) return [];
  const loaiDiem = String(definition.loaiDiem).toUpperCase();
  const pool = await resolvePool(definition);
  const diemMapping = await loadDiemStkMapping();
  const eligibleStk = await loadEligibleStk(pool, definition.chainDomain, loaiDiem, diemMapping);
  if (!eligibleStk.size) return [];

  const stkToDiem = buildStkToDiemMap(diemMapping);
  const options = [];
  for (const stk of eligibleStk) {
    const maDiem = stkToDiem.get(stk);
    const diemInfo = maDiem ? diemMapping.get(maDiem) : null;
    const label = (diemInfo && diemInfo.tenSieuThi) || stk;
    options.push({ value: stk, label });
  }
  options.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  return options;
}

async function runCoreZeroStockReport(definition, filterValues = {}) {
  if (!definition.loaiDiem || !definition.stockDomain || !definition.salesDomain || !definition.chainDomain) {
    throw new Error('Báo cáo thiếu cấu hình loaiDiem/stockDomain/salesDomain/chainDomain (coreZeroStock)');
  }
  const loaiDiem = String(definition.loaiDiem).toUpperCase();
  const pool = await resolvePool(definition);
  const threshold = Number.isFinite(Number(definition.threshold)) ? Number(definition.threshold) : 0;
  const today = todayUTC();
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];

  // Bước 1 (bản 9.46 — coreByKho giờ là Map<maKho, Map<maHang, ref>>, khác
  // trước đây coreMap phẳng Map<maHang, ref> áp dụng chung cho mọi kho cùng
  // LoaiDiem, xem lib/coreItemList.js).
  const coreByKho = await loadCoreItemListByKho(loaiDiem);
  if (!coreByKho.size) {
    // Phân biệt 2 nguyên nhân (bản 9.49, theo báo cáo người dùng — trang
    // "Danh sách hàng Core" hiện ĐỦ dữ liệu nhưng báo cáo vẫn báo "chưa
    // upload") — lib/coreItemList.js đọc qua pool RIÊNG "ETL_DIEM_STK"
    // (login/kết nối KHÁC pool "ADMIN" của etl-admin) — Map rỗng có thể là
    // THẬT SỰ chưa upload, HOẶC đọc lỗi (kết nối/.env ETL_DIEM_STK_* trỏ
    // sai server/database so với nơi admin thực sự upload) — getLastLoadError()
    // phân biệt rõ 2 trường hợp thay vì gộp chung 1 câu gây hiểu lầm.
    const loadErr = getLastLoadError();
    const warnings = loadErr
      ? [`KHÔNG đọc được danh sách hàng Core (lỗi kết nối CSDL riêng cho báo cáo này — "${loadErr.message}") — kiểm tra cấu hình ETL_DIEM_STK_* trong .env của rp-server có trỏ ĐÚNG server/database (HCRC_ETL) nơi đã upload danh sách Core không. Đây KHÔNG phải do chưa upload — trang "Danh sách hàng Core" có thể vẫn hiện đủ dữ liệu vì trang đó đọc qua kết nối KHÁC.`]
      : [`Chưa có danh sách hàng Core cho loại điểm ${loaiDiem} — vào "Danh sách hàng Core" để upload.`];
    return { columns: describeColumns(definition), rows: [], warnings };
  }

  // Bước 2 (nạp diemMapping SỚM — dùng cả ở đây để bổ sung STK_ID theo
  // LoaiChuoi khai tay, VÀ ở Bước 7 để tra Mã điểm — chỉ 1 round-trip CSDL
  // ETL_DIEM_STK/lượt chạy).
  const diemMapping = await loadDiemStkMapping();
  const eligibleStk = await loadEligibleStk(pool, definition.chainDomain, loaiDiem, diemMapping);
  const effectiveEligibleStk = branchFilter.length
    ? new Set(branchFilter.filter(stk => eligibleStk.has(stk)))
    : eligibleStk;
  if (!effectiveEligibleStk.size) {
    // Chẩn đoán (bản 9.48, theo báo cáo người dùng — "Core mart/minimart
    // vẫn chưa có data" dù danh sách Core đã upload đủ) — TRƯỚC ĐÂY trả
    // rows:[] KHÔNG kèm lý do, người dùng không biết đang chặn ở bước nào
    // trong 6 bước. Giờ giải thích RÕ: domain chainDomain có đồng bộ kho
    // nào thuộc đúng loaiDiem không, và (nếu có chọn bộ lọc "Chi nhánh")
    // kho đã chọn có khớp đúng loaiDiem không. Bản 9.52: nhắc thêm lối tắt
    // "Ánh xạ Điểm - STK_ID" (LoaiChuoi) — không cần chờ domain
    // doanhthu_chinhanh đồng bộ lại.
    const warnings = branchFilter.length
      ? [`${branchFilter.length} kho đã chọn ở bộ lọc "Chi nhánh" KHÔNG có kho nào thuộc loại điểm ${loaiDiem} theo domain "${definition.chainDomain}" (Dimension "chain") VÀ cũng chưa khai LoaiChuoi tương ứng trong "Ánh xạ Điểm - STK_ID" — kiểm tra lại domain đã đồng bộ đúng mã kho/giá trị chain chưa, hoặc vào "Ánh xạ Điểm - STK_ID" khai LoaiChuoi=${loaiDiem} cho mã Điểm của (các) kho này.`]
      : [`Domain "${definition.chainDomain}" (Dimension "chain") chưa có kho nào thuộc loại điểm ${loaiDiem}, VÀ "Ánh xạ Điểm - STK_ID" cũng chưa có dòng nào khai LoaiChuoi=${loaiDiem} — kiểm tra job đồng bộ domain này đã chạy đủ và đúng giá trị "MART"/"MINIMART" chưa, hoặc khai LoaiChuoi tại "Ánh xạ Điểm - STK_ID".`];
    return { columns: describeColumns(definition), rows: [], warnings };
  }

  // Bước 3.
  const stockDims = await loadLatestDimensionsForDomain(pool, definition.stockDomain, ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang']);
  const candidates = [];
  let scannedInEligibleStk = 0;
  for (const [entityCode, info] of stockDims) {
    const d = info.dimensions;
    if (!d.MaChiNhanh || !effectiveEligibleStk.has(d.MaChiNhanh)) continue;
    scannedInEligibleStk += 1;
    // So khớp ĐÚNG kho (bản 9.46) — 1 mã hàng chỉ tính là Core nếu ĐÚNG kho
    // đó có khai dòng Core tương ứng, không còn áp dụng chung mọi kho cùng
    // LoaiDiem như trước.
    const coreMapForKho = coreByKho.get(d.MaChiNhanh);
    if (!coreMapForKho || !d.MaHangHienThi || !coreMapForKho.has(d.MaHangHienThi)) continue;
    candidates.push({ entityCode, ...d, coreRef: coreMapForKho.get(d.MaHangHienThi) });
  }
  if (!candidates.length) {
    const sampleKho = [...effectiveEligibleStk].slice(0, 3).join(', ');
    // Chẩn đoán (bản 9.57, theo báo cáo người dùng — chọn ĐÚNG 1 kho đã xác
    // nhận có dữ liệu thật qua SQL tay vẫn báo "KHÔNG có dòng dữ liệu nào đã
    // đồng bộ") — phân biệt RÕ 2 trường hợp hoàn toàn khác nhau, trước đây
    // gộp chung 1 câu: (a) domain stockDomain THẬT SỰ rỗng hoàn toàn (0 dòng
    // bất kỳ mã thực thể nào) — khả năng cao rp-server đang đọc nhầm
    // server/CSDL/pool so với nơi admin xác nhận có dữ liệu; (b) domain CÓ
    // dữ liệu (stockDims.size > 0) nhưng KHÔNG mã nào khớp đúng kho đang lọc
    // — khả năng cao lệch định dạng mã kho (vd khoảng trắng/số 0 đầu) giữa
    // "Ánh xạ Điểm - STK_ID"/domain chain VÀ domain tồn kho thật.
    const totalRowsInDomain = stockDims.size;
    const warnings = scannedInEligibleStk
      ? [`Có ${scannedInEligibleStk} dòng (kho, mã hàng) đã đồng bộ trong domain "${definition.stockDomain}" thuộc đúng kho đang lọc, nhưng KHÔNG dòng nào khớp mã hàng trong danh sách Core đã upload cho đúng kho đó — kiểm tra lại "Mã kho" trong file Core (vd ${sampleKho || 'không có kho nào đang lọc'}) có khớp CHÍNH XÁC mã kho (STK_ID) đã đồng bộ trong domain tồn kho/bán hàng không (lệch 1 ký tự/định dạng là không khớp).`]
      : totalRowsInDomain
        ? [`Domain "${definition.stockDomain}" CÓ ${totalRowsInDomain} dòng dữ liệu (mã thực thể) đã đồng bộ, nhưng KHÔNG dòng nào có Mã kho khớp đúng (${sampleKho || 'không có kho nào đang lọc'}) — khả năng lệch ĐỊNH DẠNG mã kho (khoảng trắng/số 0 ở đầu/viết hoa-thường) giữa "Ánh xạ Điểm - STK_ID" hoặc domain "${definition.chainDomain}" VÀ domain "${definition.stockDomain}" thật — so sánh CHÍNH XÁC từng ký tự của mã kho ở 2 nơi.`]
        : [`Domain "${definition.stockDomain}" HOÀN TOÀN KHÔNG có dòng dữ liệu nào (0 dòng, mọi kho) qua kết nối rp-server đang dùng — dù DBA xác nhận CÓ dữ liệu khi tự truy vấn trực tiếp, nghĩa là rp-server đang đọc SAI server/CSDL/pool CSDL kho dữ liệu (DWH) so với nơi admin xác nhận — kiểm tra lại biến môi trường DWH_* trong .env của rp-server ĐANG CHẠY THẬT (không phải máy khác) và chắc chắn đã khởi động lại sau khi sửa.`];
    return { columns: describeColumns(definition), rows: [], warnings };
  }
  const entityCodes = candidates.map(c => c.entityCode);

  // Bước 7 — tra ngược Mã điểm, độc lập với các bước còn lại (không phụ
  // thuộc entityCodes, quét theo STK_ID). diemMapping đã nạp sẵn ở Bước 2.
  const stkToDiem = buildStkToDiemMap(diemMapping);

  // Bước 4 — Y HỆT công thức đã chốt ở topSellingZeroStockRunner.js.
  const [yesterdayStockByEntity, todaySalesByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today)
  ]);

  // Bước 5+6 (tuỳ chọn).
  const [lockAllByEntity, lockByStoreByEntity, pendingOrderByEntity, lastReceivedByEntity, lastSaleByEntity] = await Promise.all([
    definition.lockAllDomain ? loadLatestMeasure(pool, definition.lockAllDomain, entityCodes, 'KhoaAll') : Promise.resolve(new Map()),
    definition.lockByStoreDomain ? loadLatestMeasure(pool, definition.lockByStoreDomain, entityCodes, 'KhoaTheoKho') : Promise.resolve(new Map()),
    definition.pendingOrderDomain ? loadLatestMeasureWithDate(pool, definition.pendingOrderDomain, entityCodes, 'SoLuongDangDat') : Promise.resolve(new Map()),
    definition.lastReceivedDomain ? loadLatestMeasureWithDate(pool, definition.lastReceivedDomain, entityCodes, 'SoLuongDaNhap') : Promise.resolve(new Map()),
    loadLatestMeasureWithDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan')
  ]);

  const rows = [];
  let missingYesterdayStockCount = 0;
  let aboveThresholdCount = 0;
  let lockedCount = 0;
  for (const c of candidates) {
    const yesterdayStock = yesterdayStockByEntity.get(c.entityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) { missingYesterdayStockCount += 1; continue; }
    const todaySales = todaySalesByEntity.get(c.entityCode) || 0;
    const estimatedStock = yesterdayStock - todaySales;
    if (estimatedStock > threshold) { aboveThresholdCount += 1; continue; }
    if (lockAllByEntity.get(c.entityCode) === 1 || lockByStoreByEntity.get(c.entityCode) === 1) { lockedCount += 1; continue; }

    const pendingOrder = pendingOrderByEntity.get(c.entityCode);
    const lastReceived = lastReceivedByEntity.get(c.entityCode);
    const lastSale = lastSaleByEntity.get(c.entityCode);
    // maDiem (bản 9.46) — ƯU TIÊN đúng mã điểm NGƯỜI DÙNG đã khai trong file
    // Core upload (coreRef.maDiem — vì đó là nguồn trực tiếp nhất, không qua
    // suy luận); dự phòng tra ngược "Ánh xạ Điểm - STK_ID" nếu dòng Core đó
    // không khai cột Mã điểm.
    const effectiveMaDiem = c.coreRef.maDiem || stkToDiem.get(c.MaChiNhanh) || null;
    // tenKho (bản 9.52, theo yêu cầu người dùng) — ƯU TIÊN TenSieuThi khai
    // tay trong "Ánh xạ Điểm - STK_ID" (đáng tin hơn — tên chuẩn hoá, không
    // phụ thuộc domain tonkho_sku đã đồng bộ đủ TenChiNhanh cho đúng kho hay
    // chưa, cùng nguyên tắc ưu tiên đã áp dụng ở remapRowsToDiem() cho báo
    // cáo LDTD/HCRC); KHÔNG tìm thấy (mã Điểm chưa khai ánh xạ) thì dùng lại
    // TenChiNhanh tự động như trước, không đổi hành vi cũ.
    const diemInfo = effectiveMaDiem ? diemMapping.get(effectiveMaDiem) : null;
    rows.push({
      maDiem: effectiveMaDiem,
      maKho: c.MaChiNhanh,
      tenKho: (diemInfo && diemInfo.tenSieuThi) || c.TenChiNhanh || c.MaChiNhanh,
      maHang: c.MaHangHienThi,
      tenHang: c.TenHang,
      dvt: c.coreRef.dvt || null,
      maNganh: c.coreRef.maNganh || null,
      tenNganh: c.coreRef.tenNganh || null,
      maNCC: c.coreRef.maNCC || null,
      tenNCC: c.coreRef.tenNCC || null,
      luongGiaoHang: c.coreRef.luongGiaoHang || null,
      tonKho: estimatedStock,
      ngayBanCuoi: lastSale ? formatDateOnly(lastSale.eventDate) : null,
      ...(definition.lastReceivedDomain ? {
        ngayNhapCuoi: lastReceived ? formatDateOnly(lastReceived.eventDate) : null
      } : {}),
      ...(definition.pendingOrderDomain ? {
        slDangDat: pendingOrder ? pendingOrder.value : null,
        ngayDat: pendingOrder ? formatDateOnly(pendingOrder.eventDate) : null,
        maDangDat: pendingOrder && pendingOrder.value > 0 ? 1 : 0
      } : {})
    });
  }

  const columns = describeColumns(definition);
  assignSttIfPresent(rows, columns);
  const warnings = rows.length ? [] : [
    `Có ${candidates.length} (kho, mã hàng) khớp đúng danh sách Core trong phạm vi lọc, nhưng KHÔNG dòng nào hiện ra: ` +
    `${missingYesterdayStockCount} chưa có dữ liệu tồn kho "hôm qua" (chưa đồng bộ đủ ngày), ` +
    `${aboveThresholdCount} tồn kho hiện tại còn > ${threshold} (chưa hết hàng), ` +
    `${lockedCount} đang bị khoá (Khoá All/Khoá theo kho).`
  ];
  return { columns, rows, warnings };
}

module.exports = { runCoreZeroStockReport, resolveEligibleBranchOptions };
