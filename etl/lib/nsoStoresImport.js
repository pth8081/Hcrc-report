// lib/nsoStoresImport.js — Đọc file Excel "Siêu thị NSO" và ghi vào
// etl.NsoStores (xem chú thích đầy đủ tại CREATE TABLE trong
// etl-db/schema.sql). Mirror lib/diemStkMappingImport.js, ĐƠN GIẢN HƠN —
// chỉ MaDiem (BẮT BUỘC) + TenSieuThi (tuỳ chọn), không có khái niệm
// kho cũ/mới hay BU_ID, và không cần kiểm tra trùng STK_ID xuyên mã Điểm
// (MERGE theo MaDiem là đủ, UNIQUE constraint tự chặn trùng).
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const MAX_IMPORT_ROWS = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

// { rows: [{maDiem, tenSieuThi}], rowErrors: string[] }
async function parseNsoStoresFile(buffer) {
  guardZipBombSize(buffer, MAX_UNCOMPRESSED_BYTES);
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
  if (!headers.includes('MaDiem')) throw new Error('File thiếu cột bắt buộc "MaDiem"');
  const col = {};
  for (const name of ['MaDiem', 'TenSieuThi']) {
    col[name] = headers.indexOf(name);
  }

  const rows = [];
  const rowErrors = [];
  const seenInFile = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const maDiem = str(cell(col.MaDiem));
    const tenSieuThi = str(cell(col.TenSieuThi));
    if (!maDiem && !tenSieuThi) return; // dòng trống bỏ qua

    if (!maDiem) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaDiem`); return; }
    if (seenInFile.has(maDiem)) { rowErrors.push(`Dòng ${rowNumber}: MaDiem "${maDiem}" đã xuất hiện ở dòng khác trong CHÍNH file này`); return; }
    seenInFile.add(maDiem);

    rows.push({ maDiem, tenSieuThi: tenSieuThi || null });
  });

  return { rows, rowErrors };
}

// Staging + MERGE — cùng mẫu lib/diemStkMappingImport.js, khoá theo MaDiem.
const NSO_ROWS_PER_TRANSACTION = 2000;
const NSO_INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

function buildNsoInsertBatches(rows, importedBy) {
  const batches = [];
  for (let i = 0; i < rows.length; i += NSO_INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + NSO_INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${sqlNStr(r.maDiem)}, ${sqlNStrOrNull(r.tenSieuThi)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
    batches.push(`INSERT INTO #StagingNsoStores (MaDiem, TenSieuThi, ImportedBy) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_NSO_SQL = `
IF OBJECT_ID('tempdb..#StagingNsoStores') IS NOT NULL DROP TABLE #StagingNsoStores;
CREATE TABLE #StagingNsoStores (
  MaDiem     NVARCHAR(50)  NOT NULL,
  TenSieuThi NVARCHAR(200) NULL,
  ImportedBy NVARCHAR(50)  NULL
);`;

const MERGE_NSO_SQL = `
MERGE etl.NsoStores AS target
USING #StagingNsoStores AS src
  ON target.MaDiem = src.MaDiem
WHEN MATCHED THEN
  UPDATE SET
    TenSieuThi = src.TenSieuThi,
    IsActive = 1,
    ImportedAt = SYSUTCDATETIME(),
    ImportedBy = src.ImportedBy
WHEN NOT MATCHED THEN
  INSERT (MaDiem, TenSieuThi, IsActive, ImportedAt, ImportedBy)
  VALUES (src.MaDiem, src.TenSieuThi, 1, SYSUTCDATETIME(), src.ImportedBy)
OUTPUT $action AS Action;`;

async function upsertNsoStores(pool, rows, importedBy) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += NSO_ROWS_PER_TRANSACTION) {
    const chunk = rows.slice(i, i + NSO_ROWS_PER_TRANSACTION);
    const result = await upsertNsoStoresChunk(pool, chunk, importedBy);
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

async function upsertNsoStoresChunk(pool, rows, importedBy) {
  const setupSql = [CREATE_STAGING_NSO_SQL, ...buildNsoInsertBatches(rows, importedBy)].join('\n');

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const mergeResult = await new sql.Request(tx).query([setupSql, MERGE_NSO_SQL].join('\n'));

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

// ---- Xuất file mẫu (template) + xuất dữ liệu hiện có (export).
async function buildWorkbook(sheetName, headers, dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((col) => { col.width = 22; });
  return workbook.xlsx.writeBuffer();
}

async function buildNsoStoresTemplate() {
  return buildWorkbook(
    'Sieu thi NSO',
    ['STT', 'MaDiem', 'TenSieuThi'],
    [
      [1, 'VIDU', 'Tên siêu thị ví dụ - XOÁ dòng này trước khi nhập'],
      [2, 'VIDU2', 'Tuỳ chọn, hiện trực tiếp trên báo cáo']
    ]
  );
}

function buildNsoStoresExport(rows) {
  const dataRows = rows.map((r, i) => [i + 1, r.maDiem, r.tenSieuThi || '']);
  return buildWorkbook('Sieu thi NSO', ['STT', 'MaDiem', 'TenSieuThi'], dataRows);
}

module.exports = {
  parseNsoStoresFile, upsertNsoStores, buildNsoStoresTemplate, buildNsoStoresExport
};
