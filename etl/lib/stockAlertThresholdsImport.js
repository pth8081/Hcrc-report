// lib/stockAlertThresholdsImport.js — Đọc file Excel "Cảnh báo hàng tồn" và
// ghi vào etl.StockAlertThresholds (xem chú thích đầy đủ tại CREATE TABLE
// trong etl-db/schema.sql). Dùng cho báo cáo "Cảnh báo hàng tồn"
// (rp-server/lib/stockAlertRunner.js).
//
// Định dạng file (.xlsx): 1 sheet duy nhất, dòng 1 header — MaHang (BẮT
// BUỘC, khớp Dimensions.MaHangHienThi đã đồng bộ), MaDiem (BẮT BUỘC, khớp
// "Ánh xạ Điểm - STK_ID"), NguongCanhBao (BẮT BUỘC, số), TenHang/NhaCungCap
// (TUỲ CHỌN, chỉ để hiển thị/lọc).
//
// REPLACE THEO TỪNG MaDiem có trong file (bản 8.69, SỬA LỖI theo yêu cầu
// người dùng) — KHÔNG còn REPLACE TOÀN BẢNG như trước: trước đây 1 lượt
// nhập của 1 siêu thị XOÁ SẠCH ngưỡng cảnh báo của MỌI siêu thị khác (vì
// DELETE FROM etl.StockAlertThresholds không lọc điều kiện gì), rất nguy
// hiểm khi mỗi siêu thị tự upload file RIÊNG (xem routes/admin/
// stockAlertThresholds.js — từ bản 8.69 còn chặn theo storeScope của người
// upload). Giờ chỉ XOÁ+GHI LẠI đúng (các) MaDiem CÓ xuất hiện trong file —
// mirror ĐÚNG lib/coreItemListImport.js:replaceCoreItemList() (scoped theo
// LoaiDiem). File không có dòng dữ liệu nào (0 dòng) = KHÔNG LÀM GÌ (không
// còn khái niệm "xoá sạch toàn bộ qua upload" — muốn xoá 1 siêu thị, dùng
// nút "Xoá N mục đã chọn" đã có sẵn trên trang, chọn đúng các dòng của siêu
// thị đó).
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const MAX_IMPORT_ROWS = 20000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const SHEET_NAME = 'Cảnh báo hàng tồn';

function parseSheet(sheet) {
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  for (const required of ['MaHang', 'MaDiem', 'NguongCanhBao']) {
    if (!headers.includes(required)) throw new Error(`File thiếu cột bắt buộc "${required}"`);
  }
  const col = {};
  for (const name of ['MaHang', 'MaDiem', 'NguongCanhBao', 'TenHang', 'NhaCungCap']) {
    col[name] = headers.indexOf(name);
  }

  const rows = [];
  const rowErrors = [];
  const seen = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const maHang = str(cell(col.MaHang));
    const maDiem = str(cell(col.MaDiem));
    const nguongRaw = cell(col.NguongCanhBao);
    const tenHang = str(cell(col.TenHang));
    const nhaCungCap = str(cell(col.NhaCungCap));
    if (!maHang && !maDiem && (nguongRaw === null || nguongRaw === undefined || nguongRaw === '') && !tenHang && !nhaCungCap) return; // dòng trống bỏ qua

    if (!maHang) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaHang`); return; }
    if (!maDiem) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaDiem`); return; }
    const nguongCanhBao = Number(nguongRaw);
    if (!Number.isFinite(nguongCanhBao)) { rowErrors.push(`Dòng ${rowNumber}: NguongCanhBao "${nguongRaw}" không phải số hợp lệ`); return; }
    const key = `${maHang}\u0000${maDiem}`;
    if (seen.has(key)) { rowErrors.push(`Dòng ${rowNumber}: cặp (MaHang, MaDiem) "${maHang}"/"${maDiem}" đã xuất hiện ở dòng khác trong file`); return; }
    seen.add(key);

    rows.push({ maHang, maDiem, nguongCanhBao, tenHang: tenHang || null, nhaCungCap: nhaCungCap || null });
  });

  return { rows, rowErrors };
}

// { rows: [...], rowErrors: string[] }
async function parseStockAlertThresholdsFile(buffer) {
  guardZipBombSize(buffer, MAX_UNCOMPRESSED_BYTES);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new Error(`File có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
  }
  return parseSheet(sheet);
}

// ---- Ghi vào CSDL — REPLACE THEO TỪNG MaDiem có trong `rows` (xem chú
// thích đầu file), giống lib/coreItemListImport.js:replaceCoreItemList().
const INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

// Danh sách MaDiem XUẤT HIỆN trong rows đã parse — dùng để kiểm tra phạm vi
// siêu thị của người upload TRƯỚC khi ghi (routes/admin/
// stockAlertThresholds.js), và để nhóm rows theo MaDiem khi ghi bên dưới.
function distinctMaDiems(rows) {
  return [...new Set(rows.map(r => r.maDiem))];
}

async function replaceStockAlertThresholds(pool, rows, importedBy) {
  const rowsByMaDiem = new Map();
  for (const r of rows) {
    if (!rowsByMaDiem.has(r.maDiem)) rowsByMaDiem.set(r.maDiem, []);
    rowsByMaDiem.get(r.maDiem).push(r);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const [maDiem, chunkRows] of rowsByMaDiem) {
      await new sql.Request(tx).input('maDiem', sql.NVarChar(50), maDiem)
        .query('DELETE FROM etl.StockAlertThresholds WHERE MaDiem = @maDiem');
      for (let i = 0; i < chunkRows.length; i += INSERT_BATCH_SIZE) {
        const chunk = chunkRows.slice(i, i + INSERT_BATCH_SIZE);
        if (!chunk.length) continue;
        const values = chunk.map(r => `(${sqlNStr(r.maHang)}, ${sqlNStr(r.maDiem)}, ${Number(r.nguongCanhBao)}, ${sqlNStrOrNull(r.tenHang)}, ${sqlNStrOrNull(r.nhaCungCap)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
        await new sql.Request(tx).query(`
          INSERT INTO etl.StockAlertThresholds (MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap, ImportedBy)
          VALUES ${values};
        `);
      }
    }
    await tx.commit();
    return rows.length;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// ---- File mẫu + xuất dữ liệu hiện có.
async function buildWorkbook(dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const headerRow = sheet.addRow(['MaHang', 'MaDiem', 'NguongCanhBao', 'TenHang', 'NhaCungCap']);
  headerRow.font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((col) => { col.width = 22; });
  return workbook.xlsx.writeBuffer();
}

function buildStockAlertThresholdsTemplate() {
  return buildWorkbook([['SKU0001', 'DIEM-001', 10, 'Tên hàng ví dụ - XOÁ dòng này trước khi nhập', 'Nhà cung cấp ví dụ']]);
}

function buildStockAlertThresholdsExport(rows) {
  return buildWorkbook(rows.map(r => [r.maHang, r.maDiem, r.nguongCanhBao, r.tenHang || '', r.nhaCungCap || '']));
}

module.exports = {
  parseStockAlertThresholdsFile, replaceStockAlertThresholds, distinctMaDiems,
  buildStockAlertThresholdsTemplate, buildStockAlertThresholdsExport
};
