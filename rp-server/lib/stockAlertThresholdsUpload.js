// lib/stockAlertThresholdsUpload.js — Đọc file Excel "Cảnh báo hàng tồn" do
// NGƯỜI DÙNG BÁO CÁO (siêu thị) upload ngay trên rp-user (bản 8.70, theo
// yêu cầu người dùng — khác đường cũ: admin upload qua etl-admin, xem bản
// 8.68/8.69) — ĐÚNG cùng định dạng file với etl/lib/
// stockAlertThresholdsImport.js:parseStockAlertThresholdsFile() (2 codebase
// tách biệt, không require chéo được, lặp lại logic parse ở đây).
//
// Luồng: rp-user upload -> rp-server (file này parse + kiểm tra storeScope
// của người đăng nhập) -> rp-server gọi API nội bộ sang api-server (lib/
// internalApiClient.js) -> api-server ghi thẳng vào etl.StockAlertThresholds
// (CSDL HCRC_ETL) — xem routes/stockAlertThresholdsUpload.js.
const ExcelJS = require('exceljs');
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

async function parseStockAlertThresholdsUploadFile(buffer) {
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

function distinctMaDiems(rows) {
  return [...new Set(rows.map(r => r.maDiem))];
}

async function buildStockAlertThresholdsUploadTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const headerRow = sheet.addRow(['MaHang', 'MaDiem', 'NguongCanhBao', 'TenHang', 'NhaCungCap']);
  headerRow.font = { bold: true };
  sheet.addRow(['SKU0001', 'DIEM-001', 10, 'Tên hàng ví dụ - XOÁ dòng này trước khi nhập', 'Nhà cung cấp ví dụ']);
  sheet.columns.forEach((col) => { col.width = 22; });
  return workbook.xlsx.writeBuffer();
}

module.exports = { parseStockAlertThresholdsUploadFile, distinctMaDiems, buildStockAlertThresholdsUploadTemplate };
