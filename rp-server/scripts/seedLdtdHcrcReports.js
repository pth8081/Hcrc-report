// scripts/seedLdtdHcrcReports.js — Tạo/CẬP NHẬT idempotent 4 báo cáo
// "Báo cáo nhanh doanh thu" trong app.ReportCatalog — thay cho việc dán tay
// DefinitionJson qua rp-user (Hệ thống → Biểu mẫu):
//   bc-doanh-thu-ldtd / bc-doanh-thu-hcrc — bản GỐC, đọc tập trung tại
//     trung tâm (xem "báo cáo doanh thu cuối ngày.md" Bước 4).
//   bc-doanh-thu-ldtd-thanh-vien / bc-doanh-thu-hcrc-thanh-vien — bản
//     "Thành viên" (bản 8.13), NỘI DUNG giống hệt bản gốc, chỉ khác domain
//     Doanh thu/Giao dịch của 2 khối current/currentGD (đọc Live trực tiếp
//     từng cửa hàng — xem "báo cáo doanh thu thành viên.md"). 2 khối
//     lastYear/lastYearGD ("Cùng kỳ năm trước") LUÔN đọc domain GỐC (bản
//     8.27 — xem buildDefinition() bên dưới), vì dữ liệu tháng đã đóng sổ
//     giống hệt nhau dù qua domain nào, không cần đồng bộ lặp lại.
// Xem thêm hướng_dẫn_báo_cáo.md mục 15. Chạy LẠI file này an toàn — khớp
// theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — đó là quyết định "ai được
// xem" tuỳ tổ chức, cố ý ĐỂ NGUYÊN cho admin tự làm ở Bước 5 (giao diện),
// script này chỉ tạo báo cáo.
//
// Cách dùng:
//   node scripts/seedLdtdHcrcReports.js [menuCode]
// menuCode (tuỳ chọn) — Code trong app.MenuItems để gán 4 báo cáo vào,
// mặc định "reports-kinh-doanh" (đã seed sẵn trong rp-db/schema.sql).
require('dotenv').config();
const { sql, getPool } = require('../db');

// 2 cặp domain doanh thu/giao dịch — "gốc" (đọc tập trung tại trung tâm,
// STRANS/STRANS_YYYYMM qua ETL) và "Thành viên" (bản 8.13 — phần Live đọc
// TRỰC TIẾP từng cửa hàng, phần Lịch sử vẫn tập trung, xem "báo cáo doanh
// thu thành viên.md"). buildDefinition() nhận domain làm THAM SỐ (KHÔNG còn
// đóng cứng hằng số DOMAIN như trước bản 8.13) để REPORTS bên dưới tái dùng
// ĐÚNG 1 hàm cho cả 4 báo cáo thay vì chép lại logic.
const DOMAIN_GOC = { revenue: 'doanhthu_chinhanh', transaction: 'giaodich_chinhanh' };
const DOMAIN_THANH_VIEN = { revenue: 'doanhthu_chinhanh_thanhvien', transaction: 'giaodich_chinhanh_thanhvien' };

// Cột dùng chung cho cả 2 báo cáo — chỉ khác `targetDomain` của khối
// `target` (mỗi bên đọc đúng 1 trong 2 domain chỉ tiêu đã khoá cứng ở
// etl-admin, xem etl-db/schema.sql phần target_importer_LDTD/hcrc).
//
// 3 khái niệm TÁCH RIÊNG (theo đúng yêu cầu người dùng, bản 8.3 — xem
// VERSION.md):
//   title          — tên báo cáo trong DANH MỤC (chọn báo cáo trên web),
//                     TĨNH, không có ngày, phân biệt rõ HCRC/LDTD.
//   exportTitle    — tiêu đề HIỂN THỊ TRONG TÀI LIỆU lúc xuất Excel/PDF,
//                     có token {ngayBaoCao} (xem lib/reportTitleDate.js)
//                     — GIỐNG HỆT NHAU cho cả 2 báo cáo, không phân biệt.
//   exportFileCode — mã CỐ ĐỊNH ghép vào TÊN FILE tải xuống
//                     ("<mã>-ddmmyyyy.xlsx/pdf", xem routes/reports.js),
//                     theo đúng quy tắc đặt tên nội bộ, không liên quan
//                     gì tới title/exportTitle ở trên.
const EXPORT_TITLE = 'Hệ thống siêu thị BRGMART - Báo cáo nhanh doanh thu ngày {ngayBaoCao}';
function buildDefinition(title, targetDomain, exportFileCode, domains) {
  const { revenue: revenueDomain, transaction: transactionDomain } = domains;
  return {
    title,
    exportTitle: EXPORT_TITLE,
    exportFileCode,
    // compactSinglePage: true (bản 8.18) — xuất PDF ép khổ A4 DỌC cố định,
    // tự dò cỡ chữ nhỏ dần cho vừa đúng 1 trang (theo file mẫu người dùng
    // cung cấp) — xem rp-server/lib/exportPdf.js. CHỈ 4 báo cáo doanh thu
    // này khai cờ này, không ảnh hưởng cách xuất PDF của báo cáo khác.
    compactSinglePage: true,
    domain: revenueDomain,
    filters: [
      // type: 'dateRange' (trước là 'date', chỉ chọn được 1 ngày) — chọn 1
      // ngày (from=to) hoặc nhiều ngày liên tiếp để xem tổng cộng dồn, xem
      // rp-server/lib/compositeReportRunner.js.
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
      // "So sánh quá khứ" — ẨN HẲN 4 cột Cùng kỳ năm trước/LFL (Doanh thu +
      // Giao dịch) và BỎ QUA (không truy vấn) 2 khối lastYear/lastYearGD —
      // dùng khi xem lại 1 khoảng ngày ĐÃ QUA và không cần đối chiếu thêm
      // với cùng kỳ năm trước, chỉ cần Doanh thu/Giao dịch thực đạt so với
      // Chỉ tiêu (đỡ 1 lượt truy vấn CSDL Lịch sử không ai xem tới, xem
      // block.skipWhen/column.hideWhen ở rp-server/lib/compositeReportRunner.js).
      {
        field: 'cheDoSoSanh', type: 'select', label: 'Chế độ so sánh', default: 'full',
        options: [
          { value: 'full', label: 'Đầy đủ (kèm Cùng kỳ năm trước)' },
          { value: 'past', label: 'So sánh quá khứ (ẩn Cùng kỳ, chỉ Doanh thu/Giao dịch vs Chỉ tiêu)' }
        ]
      }
    ],
    blocks: [
      // useDiemStkMapping: true (CHỈ domain doanh thu) — EntityCode thật
      // trong dwh.ReportFacts của domain doanh thu chi nhánh là mã KHO
      // (STK_ID), nhưng file chỉ tiêu LDTD/HCRC dùng mã "Điểm" (BU_ID) — gộp
      // nhiều STK_ID (tách kho CŨ/MỚI theo etl.DiemStkMapping) về đúng 1
      // dòng/mã Điểm để ghép khớp được với khối target (đã khoá theo mã
      // Điểm sẵn) — xem lib/diemStkMapping.js + lib/compositeReportRunner.js.
      //
      // Domain giao dịch chi nhánh KHÔNG dùng useDiemStkMapping (khác doanh
      // thu) — nguồn TRANSHDR vốn đã ở granularity BU_ID (không có STK_ID).
      // TRƯỚC ĐÂY tài liệu giả định "BU_ID giữ nguyên = mã Điểm" — SAI, đã
      // xác nhận lại bằng dữ liệu thật (SELECT DISTINCT BU_ID/STK_ID qua
      // STRANS JOIN TRANSHDR, xem "quy tắc mã BU_ID và STK_ID.md" + VERSION.md).
      // mapBuIdToMaDiem: true dịch entityCode thô (BU_ID) về đúng mã Điểm
      // qua bảng "Ánh xạ Điểm - STK_ID" (etl.DiemStkMapping.BuId — CHỈ 1
      // CỘT DUY NHẤT, KHÔNG tách cũ/mới như MaStkCu/MaStkMoi — BU_ID là mã
      // Điểm, KHÔNG THAY ĐỔI theo thời gian, dùng chung cho cả 2 khối — xem
      // lib/compositeReportRunner.js/lib/diemStkMapping.js:buildBuIdLookup()).
      // Mã Điểm CHƯA khai BuId tường minh trong bảng ánh xạ thì KHÔNG khớp
      // gì cả (KHÔNG tự suy "+00" — bỏ hẳn quy tắc mặc định này sau khi
      // người dùng chỉ rõ đó chỉ là quan sát từ mẫu ĐÃ kiểm tra qua SQL,
      // không phải quy ước DSMART áp dụng chung, tự suy có rủi ro gộp sai
      // dữ liệu vào nhầm mã Điểm mà không ai biết để kiểm tra lại) — SAU
      // KHI gộp theo ngày, TRƯỚC khi so khớp entityCode với khối Doanh
      // thu/Chỉ tiêu. Thiếu khai BuId khiến cột Giao dịch LUÔN TRỐNG cho
      // đúng mã Điểm đó (an toàn — không phải sai âm thầm), tới khi admin
      // xác nhận đúng BU_ID qua SQL thật rồi điền vào bảng ánh xạ.
      //
      // Khối "cùng kỳ năm trước" (lastYearGD) KHÔNG được coi TRANSHDR là tự
      // động đúng chỉ vì BU_ID không đổi — người dùng xác nhận: mã kho (STK)
      // mới thể hiện đúng nhất giao dịch/doanh thu của 1 điểm; khi 1 điểm
      // đóng cửa/mở lại dưới mã kho MỚI khác mã kho CŨ, giao dịch của kỳ
      // trước (thuộc kho CŨ) và kỳ này (thuộc kho MỚI) là 2 điểm bán KHÁC
      // NHAU — không được hiện "Cùng kỳ" trong trường hợp đó, dù TRANSHDR vẫn
      // có số liên tục theo BU_ID (BU_ID không đổi, chỉ STK đổi).
      // requireStkStability: true tự loại đúng những mã Điểm này khỏi khối
      // lastYearGD dựa vào "Ánh xạ Điểm - STK_ID" (MaStkCu khác MaStkMoi ->
      // loại), xem lib/compositeReportRunner.js.
      { key: 'current', sourceType: 'directDb', domain: revenueDomain, useDiemStkMapping: true },
      { key: 'currentGD', sourceType: 'directDb', domain: transactionDomain, mapBuIdToMaDiem: true },
      // lastYear/lastYearGD LUÔN đọc domain GỐC (DOMAIN_GOC), KỂ CẢ ở 2 báo
      // cáo "(Thành viên)" — bản 8.27, theo đúng góp ý người dùng: "Cùng kỳ
      // năm trước" là dữ liệu THÁNG ĐÃ ĐÓNG SỔ, giống hệt nhau dù đọc qua
      // domain nào (cả 2 domain Lịch sử đều đồng bộ CHUNG 1 VIEW
      // V_HCRC_DOANHTHU_CHINHANH/V_HCRC_GIAODICH_CHINHANH trên
      // DSMART16_EOM, xem etl/scripts/seedThanhVienHistorySync.js — vốn chỉ
      // tạo thêm domain "_thanhvien" TRÙNG Y HỆT nguồn, không phải dữ liệu
      // khác). Trước đây 2 báo cáo "(Thành viên)" dùng domain
      // "_thanhvien" cho CẢ 4 khối, bắt buộc phải có 2 Sync Job riêng
      // ("Doanh thu/Giao dịch chi nhánh (Thành viên) - Lịch sử") đồng bộ
      // LẶP LẠI ĐÚNG dữ liệu đã có ở domain gốc — tốn thời gian/tài nguyên
      // vô ích. Đổi lastYear/lastYearGD về domain gốc CỐ ĐỊNH -> 2 Sync Job
      // đó không còn cần thiết nữa (xem etl/scripts/disableThanhVienHistorySync.js).
      { key: 'lastYear', sourceType: 'directDb', domain: DOMAIN_GOC.revenue, dateOffsetYears: -1, useDiemStkMapping: true, skipWhen: { field: 'cheDoSoSanh', equals: 'past' } },
      { key: 'lastYearGD', sourceType: 'directDb', domain: DOMAIN_GOC.transaction, dateOffsetYears: -1, mapBuIdToMaDiem: true, requireStkStability: true, skipWhen: { field: 'cheDoSoSanh', equals: 'past' } },
      // targetGranularity: 'day' — 2 mẫu file chỉ tiêu thật (LDTD/HCRC) đều
      // là chỉ tiêu THEO NGÀY (xem etl/lib/salesTargetsImport.js), không
      // phải chỉ tiêu tháng chia đều — tra đúng ngày báo cáo thay vì gộp cả
      // tháng (xem rp-server/lib/compositeReportRunner.js).
      { key: 'target', isTarget: true, targetDomain, targetGranularity: 'day' }
    ],
    // Chỉ hiện thực thể CÓ chỉ tiêu (loại mã rác/mã test có dữ liệu thực đạt
    // nhưng chưa từng được nhập chỉ tiêu) — xem compositeReportRunner.js.
    requireTargetMatch: true,
    // Chỉ hiện mã Điểm ĐÃ khai "Ánh xạ Điểm - STK_ID" — mã Điểm có chỉ tiêu
    // (qua bộ lọc requireTargetMatch ở trên) nhưng CHƯA khai ánh xạ vẫn có
    // dữ liệu Giao dịch/Chỉ tiêu (2 khối này không cần ánh xạ) nên sẽ lọt
    // qua bộ lọc trên với cột Doanh thu luôn trống — ẨN HẲN dòng đó cho tới
    // khi khai đủ ánh xạ, xem compositeReportRunner.js.
    requireDiemStkMapping: true,
    columns: [
      // "stt" — cột đặc biệt, KHÔNG có formula (giá trị thô rơi về undefined,
      // hiện trống trên bảng web) — lúc XUẤT (Excel/PDF/email tự động)
      // lib/exportExcel.js/lib/exportPdf.js tự đánh số lại từ 1 theo TỪNG
      // NHÓM groupBy bên dưới, để trống ở dòng "Tổng cộng" — khớp đúng cột
      // "TT" trong file mẫu báo cáo cũ (xem lib/reportCellFormat.js).
      { key: 'stt', label: 'TT', width: 0.4 },
      // "current.dimensions.tenSieuThi" — tên siêu thị THẬT, do ETL ghi vào
      // lúc đồng bộ nếu job đã cấu hình "Ánh xạ mã chi nhánh" có cột
      // TenSieuThi (xem etl/jobs/runSync.js). Chưa cấu hình/chưa có tên thì
      // "||" rơi về hiện đúng entityCode như trước (không để trống).
      { key: 'tenCuaHang', label: 'Siêu thị/Cửa hàng', formula: 'current.dimensions.tenSieuThi || entityCode', width: 2.4 },
      { key: 'dienTich', label: 'Diện tích', formula: 'current.dimensions.dienTich', width: 0.9 },

      { key: 'dt_chiTieu', label: 'Chỉ tiêu', formula: 'target.ChiTieuDoanhThu', width: 1.1 },
      { key: 'dt_thucDat', label: 'Thực đạt', formula: 'current.measures.doanhThu', width: 1.1 },
      { key: 'dt_tyLeDat', label: 'Tỷ lệ đạt', formula: 'ROUND(current.measures.doanhThu / target.ChiTieuDoanhThu * 100, 1)', format: 'percent', width: 0.8 },
      { key: 'dt_cungKy', label: 'Cùng kỳ năm 2025', formula: 'lastYear.measures.doanhThu', width: 1.1, hideWhen: { field: 'cheDoSoSanh', equals: 'past' } },
      { key: 'dt_lfl', label: 'Tỷ lệ % LFL', formula: 'ROUND(current.measures.doanhThu / lastYear.measures.doanhThu * 100, 1)', format: 'percent', width: 0.8, hideWhen: { field: 'cheDoSoSanh', equals: 'past' } },

      { key: 'lg_tyLe', label: 'Tỷ lệ', formula: 'ROUND(current.measures.laiGop / current.measures.doanhThu * 100, 1)', format: 'percent', width: 0.7 },
      { key: 'lg_giaTri', label: 'Giá trị', formula: 'current.measures.laiGop', width: 1.1 },

      { key: 'gd_chiTieu', label: 'Chỉ tiêu', formula: 'target.ChiTieuGiaoDich', width: 0.8 },
      { key: 'gd_thucDat', label: 'Thực đạt', formula: 'currentGD.measures.SoGiaoDich', width: 0.8 },
      { key: 'gd_tyLeDat', label: 'Tỷ lệ đạt', formula: 'ROUND(currentGD.measures.SoGiaoDich / target.ChiTieuGiaoDich * 100, 1)', format: 'percent', width: 0.8 },
      { key: 'gd_cungKy', label: 'Cùng kỳ năm 2025', formula: 'lastYearGD.measures.SoGiaoDich', width: 0.9, hideWhen: { field: 'cheDoSoSanh', equals: 'past' } },
      { key: 'gd_lfl', label: 'Tỷ lệ % LFL', formula: 'ROUND(currentGD.measures.SoGiaoDich / lastYearGD.measures.SoGiaoDich * 100, 1)', format: 'percent', width: 0.8, hideWhen: { field: 'cheDoSoSanh', equals: 'past' } },

      { key: 'trungBinhGD', label: 'Trung bình GD', formula: 'ROUND(current.measures.doanhThu / currentGD.measures.SoGiaoDich, 0)', width: 1.1 },
      { key: 'doanhThuTrenM2', label: 'Doanh thu/m2', formula: 'ROUND(current.measures.doanhThu / current.dimensions.dienTich, 0)', width: 1.1 }
    ],
    // Tiêu đề gộp 2 dòng theo màu từng nhóm cột — ÁP DỤNG ĐỒNG THỜI web/
    // Excel/PDF (bản 8.53 nối thêm web, bản 8.58 đổi mã màu + thêm
    // standaloneColumnColors — xem chú thích DefinitionJson.columnGroups
    // đầu lib/compositeReportRunner.js). Màu/thứ tự khớp ĐÚNG file mẫu
    // BRGMART người dùng gửi (bản 8.58): xanh lá=Doanh thu, cam đất=Lãi
    // gộp, vàng gold=Giao dịch — ĐỔI chỗ 'yellow'/'orange' so với trước
    // (trước đây Lãi gộp='yellow', Giao dịch='orange', nay ngược lại) vì
    // lib/reportCellFormat.js đã đổi mã HEX đứng sau 2 tên này cho khớp
    // đúng file mẫu, không phải lỗi gõ nhầm.
    columnGroups: [
      { label: 'Doanh thu', color: 'green', keys: ['dt_chiTieu', 'dt_thucDat', 'dt_tyLeDat', 'dt_cungKy', 'dt_lfl'] },
      { label: 'Lãi gộp', color: 'orange', keys: ['lg_tyLe', 'lg_giaTri'] },
      { label: 'Giao dịch', color: 'yellow', keys: ['gd_chiTieu', 'gd_thucDat', 'gd_tyLeDat', 'gd_cungKy', 'gd_lfl'] }
    ],
    // standaloneColumnColors (bản 8.58, MỚI) — tô tím HEADER 2 cột đơn lẻ
    // "Trung bình GD"/"Doanh thu/m2" (KHÔNG thuộc columnGroups nào) đúng
    // file mẫu BRGMART — khác columnGroups, KHÔNG vẽ thêm dòng tiêu đề
    // nhóm phía trên 2 cột này.
    standaloneColumnColors: { trungBinhGD: 'purple', doanhThuTrenM2: 'purple' },
    groupBy: {
      field: 'current.dimensions.chain',
      groups: [
        { value: 'MART', label: 'Tổng cộng MART' },
        { value: 'MINIMART', label: 'Tổng cộng MINIMART' }
      ],
      grandTotalLabel: 'Tổng cộng',
      labelColumn: 'tenCuaHang',
      // Sắp xếp CÁC SIÊU THỊ trong mỗi nhóm MART/MINIMART theo Diện tích
      // GIẢM DẦN (lớn -> nhỏ) — khớp đúng file mẫu tham chiếu (bản 8.4,
      // xem VERSION.md), KHÔNG sắp xếp dòng "Tổng cộng".
      sortBy: { field: 'current.dimensions.dienTich', direction: 'desc' }
    }
  };
}

// title — tên trong DANH MỤC báo cáo (chọn báo cáo trên rp-user), TĨNH,
// đúng theo yêu cầu người dùng (bản 8.3): "Báo cáo doanh thu cuối ngày
// HCRC"/"...LDTD" — KHÔNG còn kèm ngày/thương hiệu BRGMART ở đây nữa
// (phần đó chuyển sang exportTitle, xem buildDefinition() phía trên).
// exportFileCode — mã cố định ghép tên file tải xuống, theo ĐÚNG quy tắc
// người dùng cung cấp: HCRC = "BCDTHCRC-ddmmyyyy" (ĐÍNH CHÍNH bản 8.7 — mã
// cũ "BCDTRC" sai), LDTD = "BCDDTLDTD-ddmmyyyy".
// 2 báo cáo "(Thành viên)" (bản 8.13) — NỘI DUNG giống hệt 2 báo cáo gốc ở
// trên (cùng cột/công thức/nhóm — dùng CHUNG buildDefinition(), CHUNG domain
// chỉ tiêu sales-targets-*/ánh xạ điểm, KHÔNG tạo thêm luồng upload riêng
// nào — theo đúng yêu cầu người dùng), CHỈ khác domain Doanh thu/Giao dịch
// (DOMAIN_THANH_VIEN — phần Live đọc trực tiếp từng cửa hàng "Thành viên"
// thay vì qua CSDL trung tâm, xem "báo cáo doanh thu thành viên.md").
// exportFileCode thêm hậu tố "TV" — TỰ CHỌN (không phải quy tắc người dùng
// cung cấp như 2 mã gốc), đổi lại dễ nếu người dùng muốn mã khác.
const REPORTS = [
  { reportId: 'bc-doanh-thu-ldtd', title: 'Báo cáo doanh thu cuối ngày LDTD', targetDomain: 'sales-targets-ldtd', exportFileCode: 'BCDDTLDTD', domains: DOMAIN_GOC },
  { reportId: 'bc-doanh-thu-hcrc', title: 'Báo cáo doanh thu cuối ngày HCRC', targetDomain: 'sales-targets-hcrc', exportFileCode: 'BCDTHCRC', domains: DOMAIN_GOC },
  { reportId: 'bc-doanh-thu-ldtd-thanh-vien', title: 'Báo cáo doanh thu cuối ngày LDTD (Thành viên)', targetDomain: 'sales-targets-ldtd', exportFileCode: 'BCDDTLDTDTV', domains: DOMAIN_THANH_VIEN },
  { reportId: 'bc-doanh-thu-hcrc-thanh-vien', title: 'Báo cáo doanh thu cuối ngày HCRC (Thành viên)', targetDomain: 'sales-targets-hcrc', exportFileCode: 'BCDTHCRCTV', domains: DOMAIN_THANH_VIEN }
];

async function upsertReport(pool, menuItemId, { reportId, title, targetDomain, exportFileCode, domains }) {
  const definitionJson = JSON.stringify(buildDefinition(title, targetDomain, exportFileCode, domains));
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domains.revenue)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = 'composite', ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${reportId}).`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .input('title', sql.NVarChar(200), title)
    .input('domain', sql.VarChar(50), domains.revenue)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, 'composite', @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${title}" (${reportId}).`);
}

async function main() {
  const menuCode = process.argv[2] || 'reports-kinh-doanh';
  const pool = await getPool('RP');

  const menuRow = await pool.request().input('code', sql.VarChar(50), menuCode)
    .query('SELECT Id FROM app.MenuItems WHERE Code = @code');
  if (!menuRow.recordset.length) {
    console.error(`⛔ Không tìm thấy menu "${menuCode}" trong app.MenuItems — kiểm tra lại Code hoặc chạy rp-db/schema.sql trước.`);
    process.exit(1);
  }
  const menuItemId = menuRow.recordset[0].Id;

  for (const report of REPORTS) {
    await upsertReport(pool, menuItemId, report);
  }

  console.log('');
  console.log('✅ Xong — 4 báo cáo đã sẵn sàng. NHỚ vào Hệ thống → Phân quyền gán quyền xem');
  console.log('   cho đúng vai trò (Lãnh đạo Tập đoàn xem 2 báo cáo ldtd, HCRC xem 2 báo cáo hcrc,');
  console.log('   kể cả bản gốc lẫn bản "Thành viên") — script này KHÔNG tự gán quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
