// scripts/exportEntityCodesReport.js — Xuất Excel ĐỐI CHIẾU 3 nguồn mã
// entityCode đang tồn tại song song trong hệ thống, dùng để dò lệch mã giữa
// dữ liệu THỰC ĐẠT (dwh.ReportFacts), CHỈ TIÊU (dwh.SalesTargets) và bảng
// "Ánh xạ Điểm - STK_ID" (etl.DiemStkMapping) — theo yêu cầu người dùng khi
// phát hiện báo cáo LDTD/HCRC bị trống cột "Thực đạt" do 2 file (chỉ tiêu
// LDTD dùng mã "Điểm" ngắn vd "001", thực đạt DSMART16 dùng mã STK_ID 5 chữ
// số vd "13061") không khớp nhau — xem "báo cáo doanh thu cuối ngày.md".
//
// KHÔNG sửa dữ liệu gì cả — chỉ đọc (SELECT) để đối chiếu thủ công, giúp
// nghiệp vụ nhìn thấy đủ 3 tập mã cạnh nhau trong 1 file, tự xác định mã nào
// khớp mã nào rồi quyết định sửa file chỉ tiêu hay khai "Ánh xạ Điểm -
// STK_ID". Chạy lại nhiều lần an toàn (chỉ đọc, không ghi CSDL).
//
// Cách dùng:
//   node scripts/exportEntityCodesReport.js [domain1,domain2,...]
// Không truyền domain thì mặc định soi 2 domain thực đạt của LDTD/HCRC
// ("doanhthu_chinhanh", "giaodich_chinhanh") — đổi domain khác nếu cần soi
// nghiệp vụ khác (vd tồn kho).
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { sql, getPool } = require('../db');

const DEFAULT_ACTUAL_DOMAINS = ['doanhthu_chinhanh', 'giaodich_chinhanh'];
const TARGET_DOMAINS = ['sales-targets-ldtd', 'sales-targets-hcrc'];

function parseJsonSafe(raw) {
  try { return JSON.parse(raw); } catch { return {}; }
}

// 1 dòng ĐẠI DIỆN gần nhất/domain+entityCode (ROW_NUMBER rn=1) — Dimensions
// vốn là thuộc tính TĨNH của chi nhánh (tên/diện tích), lấy dòng mới nhất là
// đủ, không cần liệt kê hết mọi ngày.
async function fetchActualEntityCodes(pool, domains) {
  const request = pool.request();
  const placeholders = domains.map((d, i) => {
    request.input(`d${i}`, sql.VarChar(50), d);
    return `@d${i}`;
  }).join(',');
  const result = await request.query(`
    ;WITH Ranked AS (
      SELECT Domain, EntityCode, EventDate, Dimensions,
             ROW_NUMBER() OVER (PARTITION BY Domain, EntityCode ORDER BY EventDate DESC) AS rn,
             COUNT(*) OVER (PARTITION BY Domain, EntityCode) AS SoNgayCoDuLieu,
             MIN(EventDate) OVER (PARTITION BY Domain, EntityCode) AS NgaySomNhat
      FROM dwh.ReportFacts
      WHERE Domain IN (${placeholders})
    )
    SELECT Domain, EntityCode, EventDate AS NgayGanNhat, NgaySomNhat, SoNgayCoDuLieu, Dimensions
    FROM Ranked WHERE rn = 1
    ORDER BY Domain, EntityCode
  `);
  return result.recordset.map(r => {
    const dims = parseJsonSafe(r.Dimensions);
    return {
      domain: r.Domain, entityCode: r.EntityCode,
      tenSieuThi: dims.tenSieuThi || '', dienTich: dims.dienTich ?? '', chain: dims.chain || '',
      ngaySomNhat: r.NgaySomNhat, ngayGanNhat: r.NgayGanNhat, soNgayCoDuLieu: r.SoNgayCoDuLieu
    };
  });
}

async function fetchTargetEntityCodes(pool, domains) {
  const request = pool.request();
  const placeholders = domains.map((d, i) => {
    request.input(`t${i}`, sql.VarChar(50), d);
    return `@t${i}`;
  }).join(',');
  const result = await request.query(`
    ;WITH Ranked AS (
      SELECT Domain, EntityCode, PeriodMonth, TargetsJson,
             ROW_NUMBER() OVER (PARTITION BY Domain, EntityCode ORDER BY PeriodMonth DESC) AS rn,
             COUNT(*) OVER (PARTITION BY Domain, EntityCode) AS SoNgayCoChiTieu,
             MIN(PeriodMonth) OVER (PARTITION BY Domain, EntityCode) AS NgaySomNhat
      FROM dwh.SalesTargets
      WHERE Domain IN (${placeholders})
    )
    SELECT Domain, EntityCode, PeriodMonth AS NgayGanNhat, NgaySomNhat, SoNgayCoChiTieu, TargetsJson
    FROM Ranked WHERE rn = 1
    ORDER BY Domain, EntityCode
  `);
  return result.recordset.map(r => {
    const targets = parseJsonSafe(r.TargetsJson);
    return {
      domain: r.Domain, entityCode: r.EntityCode,
      chiTieuDoanhThu: targets.ChiTieuDoanhThu ?? '', chiTieuGiaoDich: targets.ChiTieuGiaoDich ?? '',
      trangThai: targets.TrangThai || '',
      ngaySomNhat: r.NgaySomNhat, ngayGanNhat: r.NgayGanNhat, soNgayCoChiTieu: r.SoNgayCoChiTieu
    };
  });
}

async function fetchDiemStkMapping(pool) {
  const result = await pool.request().query(`
    SELECT MaDiem, MaStkCu, MaStkMoi, TenSieuThi, ImportedAt, ImportedBy
    FROM etl.DiemStkMapping
    ORDER BY MaDiem
  `);
  return result.recordset;
}

function addSheet(workbook, name, headers, rows, mapRow) {
  const sheet = workbook.addWorksheet(name);
  const headerRow = sheet.addRow(headers.map(h => h.label));
  headerRow.font = { bold: true };
  for (const row of rows) sheet.addRow(mapRow(row));
  sheet.columns.forEach((col, i) => { col.width = headers[i]?.width || 20; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

async function main() {
  const actualDomains = process.argv[2] ? process.argv[2].split(',').map(s => s.trim()) : DEFAULT_ACTUAL_DOMAINS;
  console.log(`Đang truy vấn — mã thực đạt: [${actualDomains.join(', ')}], mã chỉ tiêu: [${TARGET_DOMAINS.join(', ')}]...`);

  const dwhPool = await getPool('DWH_TARGET_IMPORTER');
  const adminPool = await getPool('ADMIN');

  const [actualRows, targetRows, diemStkRows] = await Promise.all([
    fetchActualEntityCodes(dwhPool, actualDomains),
    fetchTargetEntityCodes(dwhPool, TARGET_DOMAINS),
    fetchDiemStkMapping(adminPool)
  ]);

  const workbook = new ExcelJS.Workbook();

  addSheet(workbook, 'Ma thuc dat (ReportFacts)',
    [{ label: 'Domain', width: 22 }, { label: 'EntityCode', width: 16 }, { label: 'Tên siêu thị', width: 30 },
     { label: 'Diện tích', width: 12 }, { label: 'Chain', width: 12 }, { label: 'Ngày sớm nhất', width: 16 },
     { label: 'Ngày gần nhất', width: 16 }, { label: 'Số ngày có dữ liệu', width: 18 }],
    actualRows,
    r => [r.domain, r.entityCode, r.tenSieuThi, r.dienTich, r.chain, r.ngaySomNhat, r.ngayGanNhat, r.soNgayCoDuLieu]
  );

  addSheet(workbook, 'Ma chi tieu (SalesTargets)',
    [{ label: 'Domain', width: 22 }, { label: 'EntityCode', width: 16 }, { label: 'Chỉ tiêu Doanh thu (mẫu)', width: 22 },
     { label: 'Chỉ tiêu Giao dịch (mẫu)', width: 22 }, { label: 'Trạng thái', width: 14 },
     { label: 'Ngày sớm nhất', width: 16 }, { label: 'Ngày gần nhất', width: 16 }, { label: 'Số ngày có chỉ tiêu', width: 18 }],
    targetRows,
    r => [r.domain, r.entityCode, r.chiTieuDoanhThu, r.chiTieuGiaoDich, r.trangThai, r.ngaySomNhat, r.ngayGanNhat, r.soNgayCoChiTieu]
  );

  // LƯU Ý QUAN TRỌNG (đọc trước khi dùng sheet dưới đây để đối chiếu) —
  // etl.DiemStkMapping là bảng ánh xạ DUY NHẤT còn dùng (từ khi bỏ tính năng
  // "Ánh xạ mã chi nhánh"/etl.BranchCodeMap — xem VERSION.md):
  //   - Domain doanhthu_chinhanh: EntityCode thật trong dwh.ReportFacts là mã
  //     kho STK_ID (nguồn DSMART16 STOCK) — đối chiếu cột EntityCode ở sheet
  //     "Ma thuc dat" với MaStkCu/MaStkMoi ở sheet dưới đây; STK không khớp
  //     ĐÚNG mã thật này thì cột "Thực đạt" của mã Điểm đó sẽ trống.
  //   - Domain giaodich_chinhanh: EntityCode thật ĐÃ LÀ mã "Điểm" (BU_ID gốc,
  //     giữ nguyên lúc đồng bộ — xem etl/lib/tableSyncEngine.js), khớp trực
  //     tiếp với MaDiem, KHÔNG cần đối chiếu qua STK.
  //   - File chỉ tiêu LDTD/HCRC (sheet "Ma chi tieu") cũng dùng mã "Điểm" —
  //     khớp trực tiếp với MaDiem.
  addSheet(workbook, 'Anh xa Diem-STK',
    [{ label: 'MaDiem (BU_ID)', width: 16 }, { label: 'MaStkCu (kỳ cũ)', width: 22 }, { label: 'MaStkMoi (kỳ mới)', width: 22 },
     { label: 'Tên siêu thị', width: 30 }, { label: 'Người nhập', width: 16 }, { label: 'Lúc nhập', width: 20 }],
    diemStkRows,
    r => [r.MaDiem, r.MaStkCu || '', r.MaStkMoi || '', r.TenSieuThi || '', r.ImportedBy || '', r.ImportedAt]
  );

  // ---- Sheet "mẫu" — CHỈ liệt kê mã Điểm đang CÓ trong chỉ tiêu nhưng CHƯA
  // khai ở "Ánh xạ Điểm - STK_ID" (đúng nhóm mã bị lệch phát hiện hôm qua) —
  // điền cột MaStkMoi/MaStkCu (mã STK_ID THẬT lấy từ sheet "Ma thuc dat" bên
  // trên) rồi nộp thẳng qua nút "Nhập file ánh xạ" ở trang "Ánh xạ Điểm -
  // STK_ID" (đúng khuôn cột, nạp lại được luôn).
  const diemMappedSet = new Set(diemStkRows.map(r => r.MaDiem));
  const missingRows = targetRows.filter(r => !diemMappedSet.has(r.entityCode));
  addSheet(workbook, 'Mau dien anh xa con thieu',
    [{ label: 'MaDiem', width: 16 }, { label: 'MaStkCu (TỰ ĐIỀN mã thật)', width: 26 }, { label: 'MaStkMoi (TỰ ĐIỀN mã thật)', width: 26 },
     { label: 'TenSieuThi (tuỳ chọn)', width: 30 }],
    missingRows,
    r => [r.entityCode, '', '', '']
  );

  const exportDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const outputPath = path.join(exportDir, `doi-chieu-ma-sieu-thi-${stamp}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Đã xuất ${actualRows.length} mã thực đạt, ${targetRows.length} mã chỉ tiêu, ${diemStkRows.length} dòng ánh xạ.`);
  console.log(`✅ File: ${outputPath}`);
  console.log('Tải file này về máy bằng scp/WinSCP, vd (chạy từ máy CÁ NHÂN, không phải trên server):');
  console.log(`   scp <user>@<server>:${outputPath} .`);
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
