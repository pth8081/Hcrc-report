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
const ExcelJS = require('exceljs');
const { sql } = require('../db');

const REQUIRED_HEADERS = ['MaSieuThi', 'Thang'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// { rows: [{entityCode, periodMonth: Date, targets: {...}}], rowErrors: string[] }
async function parseSalesTargetsFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');

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
  const targetCols = [];
  headers.forEach((name, colNumber) => {
    if (name && name !== 'MaSieuThi' && name !== 'Thang') targetCols.push({ name, colNumber });
  });
  if (!targetCols.length) throw new Error('File không có cột chỉ tiêu nào ngoài MaSieuThi/Thang');

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

    const targets = {};
    for (const { name, colNumber } of targetCols) {
      const v = row.getCell(colNumber).value;
      if (v === null || v === undefined || v === '') continue;
      const num = Number(v);
      targets[name] = Number.isFinite(num) ? num : v;
    }
    if (!Object.keys(targets).length) {
      rowErrors.push(`Dòng ${rowNumber}: không có giá trị chỉ tiêu nào`);
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

module.exports = { parseSalesTargetsFile, upsertSalesTargets };
