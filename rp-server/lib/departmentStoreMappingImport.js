// lib/departmentStoreMappingImport.js — Đọc file Excel "Ánh xạ Phòng ban ->
// Siêu thị" và ghi vào app.DepartmentStoreMapping (bản 8.49) — mirror ĐÚNG
// khuôn etl/lib/diemStkMappingImport.js, đơn giản hoá vì ở đây chỉ map 1-1
// (1 tên Department <-> ĐÚNG 1 mã Điểm, không có khái niệm gộp nhiều mã
// kho/tách kỳ cũ-mới như STK_ID) — không cần kiểm tra trùng phức tạp, UNIQUE
// (DepartmentRaw) ở CSDL đã đủ ngăn trùng, UPSERT theo đúng khoá đó.
//
// Định dạng file (.xlsx): dòng 1 header — STT (bỏ qua), DepartmentRaw (BẮT
// BUỘC, đúng nguyên văn giá trị "Department" đồng bộ từ vpdt — xem cột
// "Phòng ban" ở trang Người dùng), MaDiem (BẮT BUỘC, đúng mã Điểm đã khai ở
// "Ánh xạ Điểm - STK_ID").
const ExcelJS = require('exceljs');
const { sql } = require('../db');

const MAX_IMPORT_ROWS = 2000;

// { rows: [{departmentRaw, maDiem}], rowErrors: string[] }
async function parseDepartmentStoreMappingFile(buffer) {
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
  if (!headers.includes('DepartmentRaw')) throw new Error('File thiếu cột bắt buộc "DepartmentRaw"');
  if (!headers.includes('MaDiem')) throw new Error('File thiếu cột bắt buộc "MaDiem"');
  const col = { DepartmentRaw: headers.indexOf('DepartmentRaw'), MaDiem: headers.indexOf('MaDiem') };

  const rows = [];
  const rowErrors = [];
  const seenInFile = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const departmentRaw = str(cell(col.DepartmentRaw));
    const maDiem = str(cell(col.MaDiem));
    if (!departmentRaw && !maDiem) return; // dòng trống bỏ qua

    if (!departmentRaw) { rowErrors.push(`Dòng ${rowNumber}: thiếu DepartmentRaw`); return; }
    if (!maDiem) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaDiem`); return; }
    if (seenInFile.has(departmentRaw)) { rowErrors.push(`Dòng ${rowNumber}: "${departmentRaw}" đã xuất hiện ở dòng khác trong CHÍNH file này`); return; }
    seenInFile.add(departmentRaw);

    rows.push({ departmentRaw, maDiem });
  });

  return { rows, rowErrors };
}

// UPSERT theo UNIQUE(DepartmentRaw) — số dòng kỳ vọng nhỏ (đúng bằng số
// siêu thị, không phải số giao dịch), nên vòng lặp SELECT-rồi-UPDATE/INSERT
// đơn giản là đủ, KHÔNG cần staging+MERGE theo lô như
// lib/diemStkMappingImport.js (bảng đó phục vụ STK_ID, số dòng lớn hơn
// nhiều và có ràng buộc trùng phức tạp hơn).
async function upsertDepartmentStoreMapping(pool, rows, importedBy) {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await pool.request().input('departmentRaw', sql.NVarChar(200), row.departmentRaw)
      .query('SELECT Id FROM app.DepartmentStoreMapping WHERE DepartmentRaw = @departmentRaw');
    if (existing.recordset.length) {
      await pool.request()
        .input('id', sql.Int, existing.recordset[0].Id)
        .input('maDiem', sql.NVarChar(50), row.maDiem)
        .input('importedBy', sql.NVarChar(50), importedBy || null)
        .query('UPDATE app.DepartmentStoreMapping SET MaDiem = @maDiem, ImportedAt = SYSUTCDATETIME(), ImportedBy = @importedBy WHERE Id = @id');
      updated++;
    } else {
      await pool.request()
        .input('departmentRaw', sql.NVarChar(200), row.departmentRaw)
        .input('maDiem', sql.NVarChar(50), row.maDiem)
        .input('importedBy', sql.NVarChar(50), importedBy || null)
        .query('INSERT INTO app.DepartmentStoreMapping (DepartmentRaw, MaDiem, ImportedBy) VALUES (@departmentRaw, @maDiem, @importedBy)');
      inserted++;
    }
  }
  return { inserted, updated };
}

async function buildWorkbook(sheetName, headers, dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((c) => { c.width = 30; });
  return workbook.xlsx.writeBuffer();
}

// Mã "VIDU" — XOÁ trước khi nhập.
async function buildDepartmentStoreMappingTemplate() {
  return buildWorkbook('Anh xa Phong ban - Sieu thi', ['STT', 'DepartmentRaw', 'MaDiem'], [
    [1, 'BRGMart 120 Hang Trong (vi du - XOA truoc khi nhap)', 'SM01']
  ]);
}

function buildDepartmentStoreMappingExport(rows) {
  const dataRows = rows.map((r, i) => [i + 1, r.departmentRaw, r.maDiem]);
  return buildWorkbook('Anh xa Phong ban - Sieu thi', ['STT', 'DepartmentRaw', 'MaDiem'], dataRows);
}

module.exports = {
  parseDepartmentStoreMappingFile, upsertDepartmentStoreMapping,
  buildDepartmentStoreMappingTemplate, buildDepartmentStoreMappingExport
};
