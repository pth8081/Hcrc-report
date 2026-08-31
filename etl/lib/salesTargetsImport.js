// lib/salesTargetsImport.js — Đọc file Excel chỉ tiêu (target/KPI) admin tải
// lên và ghi vào dwh.SalesTargets (bảng RIÊNG khỏi dwh.ReportFacts — xem
// dwh/schema.sql + dwh/grants.sql). Dùng RIÊNG pool "DWH_TARGET_IMPORTER"
// (KHÔNG dùng pool "DWH"/etl_writer) — xem routes/admin/salesTargets.js.
//
// Định dạng file (.xlsx): dòng 1 là header, 2 cột ĐẦU CỐ ĐỊNH tên
// "MaSieuThi" và "Thang" (dạng YYYY-MM). Các cột SAU tuỳ ý — TÊN CỘT trở
// thành đúng tên khoá trong TargetsJson của dòng đó, không cố định trước
// trong code danh sách chỉ tiêu nào phải có (giống tinh thần Measures của
// dwh.ReportFacts — linh hoạt theo từng báo cáo).
//
// Cột "TrangThai" (TUỲ CHỌN, không bắt buộc có) — "HoatDong" (mặc định nếu
// để trống/không có cột) hoặc "DaDong". Report composite (xem
// rp-server/lib/compositeReportRunner.js) LOẠI HẲN siêu thị khỏi báo cáo
// khi thấy ĐÚNG "DaDong" — CỐ Ý không suy luận từ việc THIẾU dòng chỉ tiêu
// (siêu thị chưa kịp nhập chỉ tiêu tháng đó vẫn phải hiện ra, chỉ trống cột
// Chỉ tiêu, không được âm thầm biến mất chỉ vì ai đó quên 1 dòng).
const ExcelJS = require('exceljs');
const { sql } = require('../db');

const REQUIRED_HEADERS = ['MaSieuThi', 'Thang'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TRANG_THAI_VALUES = ['HoatDong', 'DaDong'];

// Chặn sớm file .xlsx có QUÁ NHIỀU dòng — xem chú thích cùng tên trong
// lib/dataSourcesImport.js.
const MAX_IMPORT_ROWS = 5000;

// { rows: [{entityCode, periodMonth: Date, targets: {...}}], rowErrors: string[] }
async function parseSalesTargetsFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new Error(`File có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
  }

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`File thiếu cột bắt buộc "${required}"`);
    }
  }
  const maSieuThiCol = headers.indexOf('MaSieuThi');
  const thangCol = headers.indexOf('Thang');
  const trangThaiCol = headers.indexOf('TrangThai'); // -1 nếu file không có cột này (hợp lệ, tuỳ chọn)
  const targetCols = [];
  headers.forEach((name, colNumber) => {
    if (name && name !== 'MaSieuThi' && name !== 'Thang' && name !== 'TrangThai') targetCols.push({ name, colNumber });
  });
  // Chấp nhận file CHỈ có cột TrangThai (không cột chỉ tiêu số nào) — vd
  // chỉ để đánh dấu đóng cửa hàng loạt tháng này, không cần kèm số liệu.
  if (!targetCols.length && trangThaiCol === -1) {
    throw new Error('File không có cột chỉ tiêu nào ngoài MaSieuThi/Thang, và cũng không có cột TrangThai');
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const entityCodeRaw = row.getCell(maSieuThiCol).value;
    const entityCode = entityCodeRaw != null ? String(entityCodeRaw).trim() : '';
    const thangRaw = row.getCell(thangCol).value;
    const thang = thangRaw != null ? String(thangRaw).trim() : '';
    if (!entityCode && !thang) return; // dòng trống bỏ qua, không tính là lỗi

    if (!entityCode) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaSieuThi`); return; }
    if (!PERIOD_RE.test(thang)) {
      rowErrors.push(`Dòng ${rowNumber}: "Thang" phải dạng YYYY-MM (đang là "${thang}")`);
      return;
    }

    let trangThai = null;
    if (trangThaiCol !== -1) {
      const raw = row.getCell(trangThaiCol).value;
      const value = raw != null ? String(raw).trim() : '';
      if (value) {
        if (!TRANG_THAI_VALUES.includes(value)) {
          rowErrors.push(`Dòng ${rowNumber}: "TrangThai" phải là "HoatDong" hoặc "DaDong" (đang là "${value}")`);
          return;
        }
        trangThai = value;
      }
    }

    const targets = {};
    for (const { name, colNumber } of targetCols) {
      const v = row.getCell(colNumber).value;
      if (v === null || v === undefined || v === '') continue;
      const num = Number(v);
      targets[name] = Number.isFinite(num) ? num : v;
    }
    if (trangThai) targets.TrangThai = trangThai;
    if (!Object.keys(targets).length) {
      rowErrors.push(`Dòng ${rowNumber}: không có giá trị chỉ tiêu nào (và không đánh dấu TrangThai)`);
      return;
    }

    rows.push({
      entityCode,
      periodMonth: new Date(`${thang}-01T00:00:00Z`),
      targets
    });
  });

  return { rows, rowErrors };
}

// Staging + MERGE — cùng mẫu với lib/upsert.js, khoá theo
// (Domain, EntityCode, PeriodMonth) thay vì (SourceSystem, Domain, EntityCode).
async function upsertSalesTargets(pool, domain, rows, importedBy) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`
      IF OBJECT_ID('tempdb..#StagingTargets') IS NOT NULL DROP TABLE #StagingTargets;
      CREATE TABLE #StagingTargets (
        Domain      VARCHAR(50)   NOT NULL,
        EntityCode  NVARCHAR(100) NOT NULL,
        PeriodMonth DATE          NOT NULL,
        TargetsJson NVARCHAR(MAX) NOT NULL
      );
    `);

    const table = new sql.Table('#StagingTargets');
    table.create = false;
    table.columns.add('Domain', sql.VarChar(50), { nullable: false });
    table.columns.add('EntityCode', sql.NVarChar(100), { nullable: false });
    table.columns.add('PeriodMonth', sql.Date, { nullable: false });
    table.columns.add('TargetsJson', sql.NVarChar(sql.MAX), { nullable: false });
    for (const r of rows) {
      table.rows.add(domain, r.entityCode, r.periodMonth, JSON.stringify(r.targets));
    }
    await new sql.Request(tx).bulk(table);

    const mergeResult = await new sql.Request(tx)
      .input('importedBy', sql.NVarChar(50), importedBy || null)
      .query(`
        MERGE dwh.SalesTargets AS target
        USING #StagingTargets AS src
          ON  target.Domain = src.Domain
          AND target.EntityCode = src.EntityCode
          AND target.PeriodMonth = src.PeriodMonth
        WHEN MATCHED THEN
          UPDATE SET
            TargetsJson = src.TargetsJson,
            ImportedAt = SYSUTCDATETIME(),
            ImportedBy = @importedBy
        WHEN NOT MATCHED THEN
          INSERT (Domain, EntityCode, PeriodMonth, TargetsJson, ImportedAt, ImportedBy)
          VALUES (src.Domain, src.EntityCode, src.PeriodMonth, src.TargetsJson, SYSUTCDATETIME(), @importedBy)
        OUTPUT $action AS Action;
      `);

    await tx.commit();
    const actions = mergeResult.recordset.map(r => r.Action);
    return {
      inserted: actions.filter(a => a === 'INSERT').length,
      updated: actions.filter(a => a === 'UPDATE').length
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

module.exports = { parseSalesTargetsFile, upsertSalesTargets, PERIOD_RE, TRANG_THAI_VALUES };
