// scripts/seedLdtdHcrcReports.js — Tạo/CẬP NHẬT idempotent 2 báo cáo
// "Báo cáo nhanh doanh thu - Lãnh đạo Tập đoàn" (bc-doanh-thu-ldtd) và
// "- HCRC" (bc-doanh-thu-hcrc) trong app.ReportCatalog — thay cho việc dán
// tay DefinitionJson qua rp-user (Hệ thống → Biểu mẫu). Xem đầy đủ giải
// thích ở "báo cáo doanh thu cuối ngày.md" (Bước 4) và hướng_dẫn_báo_cáo.md
// mục 15. Chạy LẠI file này an toàn — khớp theo ReportId để UPDATE
// DefinitionJson thay vì tạo trùng.
//
// CHƯA gán quyền xem (Hệ thống → Phân quyền) — đó là quyết định "ai được
// xem" tuỳ tổ chức, cố ý ĐỂ NGUYÊN cho admin tự làm ở Bước 5 (giao diện),
// script này chỉ tạo báo cáo.
//
// Cách dùng:
//   node scripts/seedLdtdHcrcReports.js [menuCode]
// menuCode (tuỳ chọn) — Code trong app.MenuItems để gán 2 báo cáo vào,
// mặc định "reports-kinh-doanh" (đã seed sẵn trong rp-db/schema.sql).
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';

// Cột dùng chung cho cả 2 báo cáo — chỉ khác `targetDomain` của khối
// `target` (mỗi bên đọc đúng 1 trong 2 domain chỉ tiêu đã khoá cứng ở
// etl-admin, xem etl-db/schema.sql phần target_importer_LDTD/hcrc).
function buildDefinition(title, targetDomain) {
  return {
    title,
    domain: DOMAIN,
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
      // Domain giao dịch chi nhánh thì KHÔNG dùng useDiemStkMapping (khác
      // doanh thu) — nguồn TRANSHDR vốn đã ở granularity BU_ID (không có
      // STK_ID để remap), và từ khi bỏ tính năng "Ánh xạ mã chi nhánh"
      // (etl.BranchCodeMap, xem VERSION.md), EntityCode của domain này giữ
      // NGUYÊN BU_ID gốc lúc đồng bộ (etl/lib/tableSyncEngine.js) — BU_ID
      // CHÍNH LÀ mã Điểm rồi, không cần remap gì thêm cho khối "hiện tại".
      //
      // NHƯNG khối "cùng kỳ năm trước" (lastYearGD) KHÔNG được coi TRANSHDR
      // là tự động đúng chỉ vì BU_ID không đổi — người dùng xác nhận: mã kho
      // (STK) mới thể hiện đúng nhất giao dịch/doanh thu của 1 điểm; khi 1
      // điểm đóng cửa/mở lại dưới mã kho MỚI khác mã kho CŨ, giao dịch của kỳ
      // trước (thuộc kho CŨ) và kỳ này (thuộc kho MỚI) là 2 điểm bán KHÁC
      // NHAU dù chung BU_ID — không được hiện "Cùng kỳ" trong trường hợp đó,
      // dù TRANSHDR vẫn có số liên tục theo BU_ID. requireStkStability: true
      // tự loại đúng những mã Điểm này khỏi khối lastYearGD dựa vào "Ánh xạ
      // Điểm - STK_ID" (MaStkCu khác MaStkMoi -> loại), xem
      // lib/compositeReportRunner.js.
      { key: 'current', sourceType: 'directDb', domain: DOMAIN, useDiemStkMapping: true },
      { key: 'currentGD', sourceType: 'directDb', domain: 'giaodich_chinhanh' },
      { key: 'lastYear', sourceType: 'directDb', domain: DOMAIN, dateOffsetYears: -1, useDiemStkMapping: true, skipWhen: { field: 'cheDoSoSanh', equals: 'past' } },
      { key: 'lastYearGD', sourceType: 'directDb', domain: 'giaodich_chinhanh', dateOffsetYears: -1, requireStkStability: true, skipWhen: { field: 'cheDoSoSanh', equals: 'past' } },
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
    // Tiêu đề gộp 2 dòng theo màu từng nhóm cột lúc XUẤT Excel/PDF (+ file
    // đính kèm gửi email tự động) — khớp đúng khuôn báo cáo cũ, xem chú
    // thích DefinitionJson.columnGroups đầu lib/compositeReportRunner.js.
    // KHÔNG ảnh hưởng bảng xem trên web (rp-user vẫn vẽ bảng phẳng như cũ).
    columnGroups: [
      { label: 'Doanh thu', color: 'green', keys: ['dt_chiTieu', 'dt_thucDat', 'dt_tyLeDat', 'dt_cungKy', 'dt_lfl'] },
      { label: 'Lãi gộp', color: 'yellow', keys: ['lg_tyLe', 'lg_giaTri'] },
      { label: 'Giao dịch', color: 'orange', keys: ['gd_chiTieu', 'gd_thucDat', 'gd_tyLeDat', 'gd_cungKy', 'gd_lfl'] }
    ],
    groupBy: {
      field: 'current.dimensions.chain',
      groups: [
        { value: 'MART', label: 'Tổng cộng MART' },
        { value: 'MINIMART', label: 'Tổng cộng MINIMART' }
      ],
      grandTotalLabel: 'Tổng cộng',
      labelColumn: 'tenCuaHang'
    }
  };
}

const REPORTS = [
  { reportId: 'bc-doanh-thu-ldtd', title: 'Báo cáo nhanh doanh thu - Lãnh đạo Tập đoàn', targetDomain: 'sales-targets-ldtd' },
  { reportId: 'bc-doanh-thu-hcrc', title: 'Báo cáo nhanh doanh thu - HCRC', targetDomain: 'sales-targets-hcrc' }
];

async function upsertReport(pool, menuItemId, { reportId, title, targetDomain }) {
  const definitionJson = JSON.stringify(buildDefinition(title, targetDomain));
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), DOMAIN)
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
    .input('domain', sql.VarChar(50), DOMAIN)
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
  console.log('✅ Xong — 2 báo cáo đã sẵn sàng. NHỚ vào Hệ thống → Phân quyền gán quyền xem');
  console.log('   cho đúng vai trò (Lãnh đạo Tập đoàn xem bc-doanh-thu-ldtd, HCRC xem bc-doanh-thu-hcrc)');
  console.log('   — script này KHÔNG tự gán quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
