// lib/coreItemListImport.js — Đọc file Excel "Danh sách hàng Core" và ghi vào
// etl.CoreItemList (xem chú thích đầy đủ tại CREATE TABLE trong
// etl-db/schema.sql). Dùng cho báo cáo "Core stock = 0"
// (rp-server/lib/coreZeroStockRunner.js).
//
// Định dạng file (.xlsx): ĐÚNG 2 sheet cố định, tên "Core Mart" và
// "Core Minimart" (khớp thói quen file nguồn "Core Mart-G"/"Core mini-G")
// — sheet nào có trong file thì THAY HẲN (replace) toàn bộ danh sách của
// ĐÚNG loại điểm đó, sheet nào KHÔNG có trong file thì GIỮ NGUYÊN danh sách
// hiện tại của loại điểm kia (upload 1 sheet vẫn dùng được, không bắt buộc
// đủ cả 2 mỗi lần). Đây là ĐIỂM KHÁC quan trọng so với
// lib/diemStkMappingImport.js (upsert cộng dồn theo khoá) — danh sách Core
// là danh sách CỐ ĐỊNH do admin định nghĩa, xoá 1 mã khỏi file rồi nhập lại
// nghĩa là mã đó KHÔNG CÒN thuộc diện Core nữa, không phải "quên khai".
//
// Mỗi sheet: dòng 1 header — MH (TUỲ CHỌN, mã hàng/mã vạch nội bộ khác theo
// file nguồn DSMART16 — CHỈ lưu để đối chiếu, KHÔNG dùng để lọc dữ liệu),
// MaHang (BẮT BUỘC — khớp ĐÚNG giá trị Dimensions.MaHangHienThi đã đồng bộ ở
// domain banhang_sku/tonkho_sku, xem hướng_dẫn_báo_cáo.md mục 12/14), TenHang/
// MaNganh/TenNganh (TUỲ CHỌN, chỉ để tham khảo/đối chiếu khi xem danh sách).
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const MAX_IMPORT_ROWS = 20000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

const SHEET_TO_LOAI_DIEM = { 'Core Mart': 'MART', 'Core Minimart': 'MINIMART' };
const LOAI_DIEM_TO_SHEET = { MART: 'Core Mart', MINIMART: 'Core Minimart' };

function parseSheet(sheet, loaiDiem) {
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  if (!headers.includes('MaHang')) {
    throw new Error(`Sheet "${sheet.name}" thiếu cột bắt buộc "MaHang"`);
  }
  const col = {};
  for (const name of ['MH', 'MaHang', 'TenHang', 'MaNganh', 'TenNganh']) {
    col[name] = headers.indexOf(name);
  }

  const rows = [];
  const rowErrors = [];
  const seenInSheet = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const mh = str(cell(col.MH));
    const maHang = str(cell(col.MaHang));
    const tenHang = str(cell(col.TenHang));
    const maNganh = str(cell(col.MaNganh));
    const tenNganh = str(cell(col.TenNganh));
    if (!mh && !maHang && !tenHang && !maNganh && !tenNganh) return; // dòng trống bỏ qua

    if (!maHang) { rowErrors.push(`Sheet "${sheet.name}" dòng ${rowNumber}: thiếu MaHang`); return; }
    if (seenInSheet.has(maHang)) { rowErrors.push(`Sheet "${sheet.name}" dòng ${rowNumber}: MaHang "${maHang}" đã xuất hiện ở dòng khác trong CHÍNH sheet này`); return; }
    seenInSheet.add(maHang);

    rows.push({
      loaiDiem,
      maHang,
      mh: mh || null,
      tenHang: tenHang || null,
      maNganh: maNganh || null,
      tenNganh: tenNganh || null
    });
  });

  return { rows, rowErrors };
}

// { rowsByLoaiDiem: { MART: [...], MINIMART: [...] } (CHỈ chứa key nào có
// sheet tương ứng trong file), rowErrors: string[] }
async function parseCoreItemListFile(buffer) {
  guardZipBombSize(buffer, MAX_UNCOMPRESSED_BYTES);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const rowsByLoaiDiem = {};
  const rowErrors = [];
  let matchedAnySheet = false;

  for (const sheet of workbook.worksheets) {
    const loaiDiem = SHEET_TO_LOAI_DIEM[sheet.name];
    if (!loaiDiem) continue; // sheet lạ (không đúng tên "Core Mart"/"Core Minimart") -> bỏ qua, không báo lỗi
    matchedAnySheet = true;
    if (sheet.rowCount > MAX_IMPORT_ROWS) {
      throw new Error(`Sheet "${sheet.name}" có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
    }
    const { rows, rowErrors: sheetErrors } = parseSheet(sheet, loaiDiem);
    rowsByLoaiDiem[loaiDiem] = rows;
    rowErrors.push(...sheetErrors);
  }

  if (!matchedAnySheet) {
    throw new Error('File không có sheet nào tên đúng "Core Mart" hoặc "Core Minimart"');
  }

  return { rowsByLoaiDiem, rowErrors };
}

// ---- Ghi vào CSDL — REPLACE (xoá hết dòng cùng LoaiDiem rồi ghi lại toàn
// bộ), khác lib/diemStkMappingImport.js (upsert theo khoá) — xem chú thích
// đầu file. Chỉ ĐÚNG LoaiDiem có mặt trong rowsByLoaiDiem mới bị xoá/ghi lại;
// LoaiDiem còn lại (không có sheet trong lượt nhập này) giữ nguyên.
const CORE_ITEM_INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

async function replaceCoreItemList(pool, rowsByLoaiDiem, importedBy) {
  const loaiDiems = Object.keys(rowsByLoaiDiem);
  const counts = {};

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const loaiDiem of loaiDiems) {
      const rows = rowsByLoaiDiem[loaiDiem];
      const req = new sql.Request(tx);
      req.input('loaiDiem', sql.VarChar(20), loaiDiem);
      await req.query('DELETE FROM etl.CoreItemList WHERE LoaiDiem = @loaiDiem');

      for (let i = 0; i < rows.length; i += CORE_ITEM_INSERT_BATCH_SIZE) {
        const chunk = rows.slice(i, i + CORE_ITEM_INSERT_BATCH_SIZE);
        if (!chunk.length) continue;
        const values = chunk.map(r => `(${sqlNStr(r.loaiDiem)}, ${sqlNStr(r.maHang)}, ${sqlNStrOrNull(r.mh)}, ${sqlNStrOrNull(r.tenHang)}, ${sqlNStrOrNull(r.maNganh)}, ${sqlNStrOrNull(r.tenNganh)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
        await new sql.Request(tx).query(`
          INSERT INTO etl.CoreItemList (LoaiDiem, MaHang, MH, TenHang, MaNganh, TenNganh, ImportedBy)
          VALUES ${values};
        `);
      }
      counts[loaiDiem] = rows.length;
    }
    await tx.commit();
    return counts;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// ---- Xuất file mẫu (template) + xuất dữ liệu hiện có (export) — cùng tinh
// thần lib/diemStkMappingImport.js, nhưng 2 sheet cố định thay vì 1.
async function buildWorkbook(sheetsData) {
  const workbook = new ExcelJS.Workbook();
  for (const { sheetName, dataRows } of sheetsData) {
    const sheet = workbook.addWorksheet(sheetName);
    const headerRow = sheet.addRow(['MH', 'MaHang', 'TenHang', 'MaNganh', 'TenNganh']);
    headerRow.font = { bold: true };
    for (const row of dataRows) sheet.addRow(row);
    sheet.columns.forEach((col) => { col.width = 24; });
  }
  return workbook.xlsx.writeBuffer();
}

// Mã "VIDU" — XOÁ trước khi nhập.
async function buildCoreItemListTemplate() {
  return buildWorkbook([
    { sheetName: 'Core Mart', dataRows: [['293279690000', 'VIDU2005327969', 'Tên hàng ví dụ', '2005', 'Mỹ phẩm (Cosmetic) - XOÁ dòng này trước khi nhập']] },
    { sheetName: 'Core Minimart', dataRows: [['292065170000', 'VIDU2002206517', 'Tên hàng ví dụ', '2002', 'Đồ uống, thuốc lá (Beverage and Tobacco) - XOÁ dòng này trước khi nhập']] }
  ]);
}

function buildCoreItemListExport(rowsByLoaiDiem) {
  const sheetsData = Object.entries(LOAI_DIEM_TO_SHEET).map(([loaiDiem, sheetName]) => ({
    sheetName,
    dataRows: (rowsByLoaiDiem[loaiDiem] || []).map(r => [r.mh || '', r.maHang, r.tenHang || '', r.maNganh || '', r.tenNganh || ''])
  }));
  return buildWorkbook(sheetsData);
}

module.exports = {
  parseCoreItemListFile, replaceCoreItemList,
  buildCoreItemListTemplate, buildCoreItemListExport,
  SHEET_TO_LOAI_DIEM, LOAI_DIEM_TO_SHEET
};
