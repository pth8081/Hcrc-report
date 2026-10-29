// scripts/seedNganhHangReports.js — Tạo/CẬP NHẬT idempotent các báo cáo
// "Doanh thu theo ngành hàng"/"Nhập hàng theo ngành hàng"/"Doanh thu theo
// ngành hàng (LDTD)" trong app.ReportCatalog. Chạy LẠI file này an toàn —
// khớp theo ReportId để UPDATE DefinitionJson thay vì tạo trùng.
//
// Bản 9.67 (theo yêu cầu người dùng — "đừng tách bc nhé, tôi đã có hai báo
// cáo này... cần bạn cập nhật hai báo cáo này thôi"): SỬA LẠI bản 9.63 ban
// đầu lỡ tạo 1 báo cáo thứ 3 RIÊNG `bc-doanh-thu-nganhhang-brgmart`. ĐÚNG
// ý người dùng là cập nhật TRỰC TIẾP 2 báo cáo DOANH THU đã có (gốc +
// LDTD) sang định dạng mới (SourceType='nganhHangBrg', xem
// lib/nganhHangBrgRunner.js — 3 khối "Toàn hệ thống BRG"/"LFL"/"NSO" + cụm
// Lãi gộp + "Giá trị hàng hỏng hủy"/"Doanh thu cuối"), MỖI báo cáo GIỮ
// NGUYÊN domain Chỉ tiêu RIÊNG đã có từ trước (`sales-targets-nganhhang-dt`/
// `sales-targets-nganhhang-dt-ldtd` — KHÔNG gộp chung, KHÔNG tạo domain Chỉ
// tiêu "BRGMART" riêng nào khác). Trường `ChiTieuLaiGop` tự nhận được ở CẢ
// 2 trang etl-admin Chỉ tiêu đã có, nhờ cơ chế field-động
// `etl/lib/salesTargetsImport.js:parseGenericShape()` — admin chỉ cần thêm
// cột `ChiTieuLaiGop` vào file Excel nhập Chỉ tiêu hiện tại, KHÔNG cần đổi
// code/trang nào. "Siêu thị NSO" (etl.NsoStores) vẫn DÙNG CHUNG cho cả 2
// báo cáo (1 danh sách duy nhất, không tách riêng theo báo cáo).
//
// Báo cáo "Nhập hàng theo ngành hàng" (`bc-nhap-hang-nganhhang`) KHÔNG đổi
// — giữ nguyên SourceType='composite' cũ (không có khái niệm Lãi gộp/hàng
// hỏng hủy cho nhập hàng, người dùng không yêu cầu đổi báo cáo này).
//
// Cách dùng:
//   node scripts/seedNganhHangReports.js [menuCode]
require('dotenv').config();
const { sql, getPool } = require('../db');

const EXPORT_TITLE_DOANH_THU = 'Hệ thống siêu thị BRGMART - Báo cáo doanh thu theo ngành hàng ngày {ngayBaoCao}';
const EXPORT_TITLE_NHAP_HANG = 'Hệ thống siêu thị BRGMART - Báo cáo nhập hàng theo ngành hàng ngày {ngayBaoCao}';

// Định dạng MỚI (bản 9.63/9.67) — SourceType='nganhHangBrg'. DefinitionJson
// CHỈ cần đủ field tối thiểu để tìm đúng runner + hiện đúng tiêu đề xuất
// file — cột/khối/công thức KHÔNG khai ở đây, runner tự khai trong code
// (xem lib/nganhHangBrgRunner.js), không đọc từ DefinitionJson.
//
// 4 filter MỚI (bản 9.90, theo yêu cầu người dùng — "3 filter theo Total/
// LFL/NSO: chọn siêu thị" + "Bỏ hàng hỏng hủy: không đưa hàng hỏng hủy vào
// và lãi theo doanh thu không trừ hàng hỏng hủy"):
// - branchesBrg/branchesLfl/branchesNso (multiSelect, optionsSource.
//   nganhHangBranches='brg'/'lfl'/'nso' — mỗi ô CHỈ liệt kê đúng siêu thị
//   thuộc khối đó, xem lib/nganhHangBrgRunner.js:resolveNganhHangBranchOptions()).
//   Không chọn = giữ nguyên mặc định (BRG = mọi siêu thị, LFL/NSO = đúng 2
//   tập đã phân loại tự động theo etl.NsoStores), chọn = thu hẹp lại đúng
//   khối đó, KHÔNG ảnh hưởng 2 khối còn lại.
// - excludeHongHuy (select tĩnh 'Có trừ'/'Không trừ') — xem
//   lib/nganhHangBrgRunner.js:computeRowFields() để biết chính xác công
//   thức đổi thế nào khi bật.
function buildNganhHangBrgDefinition({ title, exportFileCode, exportTitle, domain, targetDomain }) {
  return {
    title,
    exportTitle,
    exportFileCode,
    domain,
    targetDomain,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
      {
        field: 'branchesBrg', type: 'multiSelect', label: 'Siêu thị — khối Toàn hệ thống BRG (không chọn = tất cả)',
        optionsSource: { nganhHangBranches: 'brg' }
      },
      {
        field: 'branchesLfl', type: 'multiSelect', label: 'Siêu thị — khối LFL (không chọn = tất cả siêu thị LFL)',
        optionsSource: { nganhHangBranches: 'lfl' }
      },
      {
        field: 'branchesNso', type: 'multiSelect', label: 'Siêu thị — khối NSO (không chọn = tất cả siêu thị NSO)',
        optionsSource: { nganhHangBranches: 'nso' }
      },
      {
        field: 'excludeHongHuy', type: 'select', label: 'Lãi gộp có trừ Giá trị hàng hỏng hủy?',
        options: [
          { value: '', label: 'Có trừ (mặc định)' },
          { value: '1', label: 'Không trừ (bỏ hàng hỏng hủy khỏi Lãi gộp)' }
        ]
      }
    ]
  };
}

// Định dạng CŨ (bản 9.41+) — SourceType='composite', dùng cho "Nhập hàng
// theo ngành hàng" (giữ nguyên, không đổi).
function buildCompositeDefinition({ title, domain, targetDomain, exportFileCode, exportTitle, thucDatField, chiTieuField, thucDatLabel }) {
  return {
    title,
    exportTitle,
    exportFileCode,
    domain,
    filters: [
      { field: 'eventDate', type: 'dateRange', label: 'Khoảng ngày báo cáo' },
      {
        // Bản 10.39 (theo báo cáo người dùng — dropdown hiện thẳng STK_ID
        // trần, vd "12441", thay vì tên siêu thị): thêm
        // `translateStkViaDiemStkMapping: true` — dịch nhãn qua "Ánh xạ
        // Điểm - STK_ID" (xem routes/reports.js), GIỮ NGUYÊN `value` vẫn
        // là STK_ID thô (khớp đúng `remapEntityCode.filterField: 'STK_ID'`
        // ở block bên dưới, KHÔNG đổi sang Mã Điểm).
        field: 'branches', type: 'multiSelect', label: 'Chi nhánh (không chọn = toàn hệ thống)',
        optionsSource: { domain, valueField: 'STK_ID', translateStkViaDiemStkMapping: true }
      }
    ],
    blocks: [
      {
        key: 'current', sourceType: 'directDb', domain,
        remapEntityCode: { field: 'DEPT_ID', filterField: 'STK_ID', filterValuesField: 'branches' }
      },
      {
        key: 'lastYear', sourceType: 'directDb', domain, dateOffsetYears: -1,
        remapEntityCode: { field: 'DEPT_ID', filterField: 'STK_ID', filterValuesField: 'branches' }
      },
      { key: 'target', isTarget: true, targetDomain }
    ],
    requireTargetMatch: false,
    sortBy: { field: 'entityCode', direction: 'asc' },
    columns: [
      { key: 'stt', label: 'TT' },
      { key: 'entityCode' },
      { key: 'tenNganhHang', label: 'Ngành hàng', formula: 'current.dimensions.TenNganhHang || lastYear.dimensions.TenNganhHang || entityCode', width: 2 },
      { key: 'chiTieu', label: 'Chỉ tiêu', formula: `target.${chiTieuField}`, width: 1.2 },
      { key: 'thucDat', label: thucDatLabel, formula: `current.measures.${thucDatField}`, width: 1.2 },
      { key: 'tyLeDat', label: 'Tỷ lệ đạt', formula: `ROUND(current.measures.${thucDatField} / target.${chiTieuField} * 100, 1)`, format: 'percent', width: 0.9 },
      { key: 'cungKy', label: 'Cùng kỳ năm trước', formula: `lastYear.measures.${thucDatField}`, width: 1.2 },
      { key: 'lfl', label: 'Tỷ lệ % LFL', formula: `ROUND(current.measures.${thucDatField} / lastYear.measures.${thucDatField} * 100, 1)`, format: 'percent', width: 0.9 }
    ]
  };
}

const REPORTS = [
  {
    reportId: 'bc-doanh-thu-nganhhang', title: 'Báo cáo doanh thu theo ngành hàng',
    sourceType: 'nganhHangBrg',
    exportFileCode: 'BCDTNGANHHANG', domain: 'doanhthu_nganhhang', targetDomain: 'sales-targets-nganhhang-dt',
    exportTitle: EXPORT_TITLE_DOANH_THU
  },
  {
    reportId: 'bc-nhap-hang-nganhhang', title: 'Báo cáo nhập hàng theo ngành hàng',
    sourceType: 'composite',
    exportFileCode: 'BCNHAPHANGNGANHHANG', domain: 'nhaphang_nganhhang', targetDomain: 'sales-targets-nganhhang-nh',
    exportTitle: EXPORT_TITLE_NHAP_HANG, thucDatField: 'GiaTriNhap', chiTieuField: 'ChiTieuGiaTriNhap', thucDatLabel: 'Thực nhập'
  },
  // Bản 9.43 — báo cáo "(LDTD)" RIÊNG của đội Lãnh đạo Tập đoàn, DÙNG
  // CHUNG domain thực đạt `doanhthu_nganhhang` (cùng 1 nguồn dữ liệu Thực
  // đạt với báo cáo gốc, không đồng bộ lặp lại) nhưng targetDomain RIÊNG
  // (`sales-targets-nganhhang-dt-ldtd`) để đội LDTD tự nhập Chỉ tiêu độc
  // lập — bản 9.67 chuyển sang SourceType='nganhHangBrg' CÙNG lúc với báo
  // cáo gốc (2 báo cáo CÙNG định dạng mới, chỉ khác domain Chỉ tiêu).
  {
    reportId: 'bc-doanh-thu-nganhhang-ldtd', title: 'Báo cáo doanh thu theo ngành hàng (LDTD)',
    sourceType: 'nganhHangBrg',
    exportFileCode: 'BCDTNGANHHANGLDTD', domain: 'doanhthu_nganhhang', targetDomain: 'sales-targets-nganhhang-dt-ldtd',
    exportTitle: EXPORT_TITLE_DOANH_THU
  }
];

async function upsertReport(pool, menuItemId, report) {
  const { reportId, title, domain, sourceType } = report;
  const definition = sourceType === 'nganhHangBrg' ? buildNganhHangBrgDefinition(report) : buildCompositeDefinition(report);
  const definitionJson = JSON.stringify(definition);
  const existing = await pool.request().input('reportId', sql.VarChar(80), reportId)
    .query('SELECT ReportId FROM app.ReportCatalog WHERE ReportId = @reportId');
  if (existing.recordset.length) {
    await pool.request()
      .input('reportId', sql.VarChar(80), reportId)
      .input('title', sql.NVarChar(200), title)
      .input('domain', sql.VarChar(50), domain)
      .input('sourceType', sql.VarChar(30), sourceType)
      .input('menuItemId', sql.Int, menuItemId)
      .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
      .query(`
        UPDATE app.ReportCatalog SET
          Title = @title, Domain = @domain, MenuItemId = @menuItemId, DataSourceId = NULL,
          SourceType = @sourceType, ApiConnectionId = NULL, ApiTarget = NULL, ExternalConnectionId = NULL,
          DefinitionJson = @definitionJson, IsActive = 1
        WHERE ReportId = @reportId
      `);
    console.log(`↻ Đã cập nhật báo cáo "${title}" (${reportId}), SourceType='${sourceType}'.`);
    return;
  }
  await pool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .input('title', sql.NVarChar(200), title)
    .input('domain', sql.VarChar(50), domain)
    .input('sourceType', sql.VarChar(30), sourceType)
    .input('menuItemId', sql.Int, menuItemId)
    .input('definitionJson', sql.NVarChar(sql.MAX), definitionJson)
    .query(`
      INSERT INTO app.ReportCatalog (ReportId, Title, Domain, MenuItemId, SourceType, DefinitionJson)
      VALUES (@reportId, @title, @domain, @menuItemId, @sourceType, @definitionJson)
    `);
  console.log(`✅ Đã tạo báo cáo "${title}" (${reportId}), SourceType='${sourceType}'.`);
}

async function main() {
  // Bản 9.43 (theo yêu cầu người dùng) — chuyển mặc định từ
  // 'reports-kinh-doanh' sang 'reports-mua-hang' ("Báo cáo Mua hàng") —
  // chạy lại script này sẽ UPDATE MenuItemId của 3 báo cáo đã có (khớp
  // ReportId), tự chuyển nhóm mà không cần xoá/tạo lại.
  const menuCode = process.argv[2] || 'reports-mua-hang';
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
  console.log('✅ Xong — cả 3 báo cáo đã sẵn sàng. NHỚ:');
  console.log('   1. Đã chạy node etl/scripts/seedNganhHangSync.js (domain Live có dữ liệu —');
  console.log('      bản 9.68 đã gộp "Giá trị hàng hỏng hủy" + Bán lẻ/Bán buôn vào CHÍNH domain');
  console.log('      doanhthu_nganhhang, không cần job/domain riêng nữa).');
  console.log('   2. Đã nhập Chỉ tiêu qua etl-admin → "Chỉ tiêu Doanh thu theo ngành hàng"/');
  console.log('      "Chỉ tiêu Doanh thu theo ngành hàng (LDTD)"/"Chỉ tiêu Nhập hàng theo ngành');
  console.log('      hàng" — thêm cột ChiTieuLaiGop vào file Excel nhập Chỉ tiêu 2 trang Doanh thu');
  console.log('      nếu muốn có cột "% so chỉ tiêu" của Lãi gộp (để trống MaSieuThi, điền MaNganhHang).');
  console.log('   3. (Nếu cần phân biệt LFL/NSO) Vào etl-admin → "Siêu thị NSO" khai Mã Điểm.');
  console.log('   4. Vào Hệ thống → Phân quyền gán quyền xem cho đúng vai trò — script này KHÔNG');
  console.log('      tự gán quyền.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
