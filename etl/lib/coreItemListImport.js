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
// SỬA bản 9.46 (theo yêu cầu người dùng, kèm file mẫu THẬT đang dùng — "Core
// thg 08.2024 Loại bỏ SKU ko hiệu quả") — TRƯỚC ĐÂY 1 mã hàng là Core (hay
// không) áp dụng CHUNG cho MỌI kho cùng loại điểm, không phân biệt từng kho.
// File mẫu thật của người dùng có "Mã kho" RIÊNG từng dòng (1 mã hàng có thể
// là Core ở kho NÀY nhưng KHÔNG PHẢI Core ở kho KHÁC cùng loại điểm) — đổi
// khoá duy nhất từ (LoaiDiem, MaHang) sang (MaKho, MaHang); "MaKho" giờ BẮT
// BUỘC (trước đây không có khái niệm này). Cột thứ tự KHÁC NHAU giữa 2 sheet
// trong file thật của người dùng (vd sheet "Mini" có thêm Mã NCC/Tên NCC/
// Luồng giao hàng, thứ tự cột cũng khác sheet "Mart") — KHÔNG vấn đề gì vì
// parseSheet() đọc cột theo TÊN header (headers.indexOf(name)), không theo
// vị trí cột cố định.
//
// Mỗi sheet: dòng 1 header — MH (TUỲ CHỌN, mã hàng/mã vạch nội bộ khác theo
// file nguồn DSMART16 — CHỈ lưu để đối chiếu, KHÔNG dùng để lọc dữ liệu),
// MaKho (BẮT BUỘC — khớp ĐÚNG Dimensions.MaChiNhanh/STK_ID đã đồng bộ, xác
// định ĐÚNG kho nào áp dụng dòng Core này), MaHang (BẮT BUỘC — khớp ĐÚNG giá
// trị Dimensions.MaHangHienThi đã đồng bộ ở domain banhang_sku/tonkho_sku,
// xem bc-core-ton-kho-0.md), MaDiem/TenHang/Dvt/MaNganh/TenNganh/MaNCC/
// TenNCC/LuongGiaoHang (TUỲ CHỌN, chỉ để tham khảo/đối chiếu/hiển thị thêm
// trên báo cáo khi xem danh sách — khớp đúng tên cột trong file mẫu thật
// của người dùng).
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

// MAX_IMPORT_ROWS (bản 9.46, NÂNG từ 20000 lên 50000) — Core giờ khai theo
// TỪNG kho (xem chú thích bản 9.46 ở trên) nên cùng 1 mã hàng lặp lại ở
// nhiều dòng (mỗi dòng 1 kho khác nhau), số dòng/sheet tăng hẳn so với
// trước (file mẫu thật người dùng đang dùng: sheet Mart 26248 dòng, sheet
// Mini 11535 dòng) — nâng ngưỡng để không chặn nhầm file thật hợp lệ.
const MAX_IMPORT_ROWS = 50000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

// SỬA bản 9.46 — TRƯỚC ĐÂY chỉ nhận ĐÚNG tên sheet "Core Mart"/"Core
// Minimart" (SHEET_TO_LOAI_DIEM) và tên cột tiếng Anh ("MaHang", "MaKho"...
// HEADER_ALIASES) — file mẫu THẬT người dùng đang dùng (xuất từ hệ thống
// nguồn khác) đặt tên NGẮN "Mart"/"Mini" cho sheet và tên cột TIẾNG VIỆT
// ("Mã hàng", "Mã kho"...). Thêm cả 2 làm BÍ DANH (alias) — chấp nhận CẢ
// quy ước cũ (tương thích ngược, file mẫu hệ thống tự tạo vẫn dùng) LẪN quy
// ước mới (đúng tên sheet/cột trong file thật người dùng) cùng lúc, không
// cần người dùng tự đổi tên cột/sheet trước khi upload.
const SHEET_TO_LOAI_DIEM = { 'Core Mart': 'MART', Mart: 'MART', 'Core Minimart': 'MINIMART', Minimart: 'MINIMART', Mini: 'MINIMART' };
const LOAI_DIEM_TO_SHEET = { MART: 'Core Mart', MINIMART: 'Core Minimart' };

// HEADER_ALIASES — khoá NỘI BỘ (dùng xuyên suốt code bên dưới) -> danh sách
// tên cột CHẤP NHẬN được trong file (thử LẦN LƯỢT, lấy cột đầu tiên khớp).
const HEADER_ALIASES = {
  mh: ['MH'],
  maKho: ['MaKho', 'Mã kho'],
  maDiem: ['MaDiem', 'Mã điểm'],
  maHang: ['MaHang', 'Mã hàng'],
  tenHang: ['TenHang', 'Tên hàng'],
  dvt: ['Dvt', 'Đvt'],
  maNganh: ['MaNganh', 'Mã ngành'],
  tenNganh: ['TenNganh', 'Tên ngành'],
  maNCC: ['MaNCC', 'Mã NCC'],
  tenNCC: ['TenNCC', 'Tên NCC'],
  luongGiaoHang: ['LuongGiaoHang', 'Luồng giao hàng']
};
function resolveHeaderIndex(headers, aliases) {
  for (const name of aliases) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseSheet(sheet, loaiDiem) {
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  const col = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    col[key] = resolveHeaderIndex(headers, aliases);
  }
  if (col.maHang === -1) {
    throw new Error(`Sheet "${sheet.name}" thiếu cột bắt buộc "MaHang" (hoặc "Mã hàng")`);
  }
  if (col.maKho === -1) {
    throw new Error(`Sheet "${sheet.name}" thiếu cột bắt buộc "MaKho"/"Mã kho" (bản 9.46 — Core giờ áp dụng theo TỪNG kho, không còn chung cho cả loại điểm)`);
  }

  const rows = [];
  const rowErrors = [];
  const seenInSheet = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const mh = str(cell(col.mh));
    const maKho = str(cell(col.maKho));
    const maDiem = str(cell(col.maDiem));
    const maHang = str(cell(col.maHang));
    const tenHang = str(cell(col.tenHang));
    const dvt = str(cell(col.dvt));
    const maNganh = str(cell(col.maNganh));
    const tenNganh = str(cell(col.tenNganh));
    const maNCC = str(cell(col.maNCC));
    const tenNCC = str(cell(col.tenNCC));
    const luongGiaoHang = str(cell(col.luongGiaoHang));
    if (!mh && !maKho && !maDiem && !maHang && !tenHang && !dvt && !maNganh && !tenNganh && !maNCC && !tenNCC && !luongGiaoHang) return; // dòng trống bỏ qua

    if (!maHang) { rowErrors.push(`Sheet "${sheet.name}" dòng ${rowNumber}: thiếu MaHang`); return; }
    if (!maKho) { rowErrors.push(`Sheet "${sheet.name}" dòng ${rowNumber}: thiếu MaKho`); return; }
    const key = `${maKho}|${maHang}`;
    if (seenInSheet.has(key)) { rowErrors.push(`Sheet "${sheet.name}" dòng ${rowNumber}: cặp (MaKho "${maKho}", MaHang "${maHang}") đã xuất hiện ở dòng khác trong CHÍNH sheet này`); return; }
    seenInSheet.add(key);

    rows.push({
      loaiDiem,
      maKho,
      maDiem: maDiem || null,
      maHang,
      mh: mh || null,
      tenHang: tenHang || null,
      dvt: dvt || null,
      maNganh: maNganh || null,
      tenNganh: tenNganh || null,
      maNCC: maNCC || null,
      tenNCC: tenNCC || null,
      luongGiaoHang: luongGiaoHang || null
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
        const values = chunk.map(r => `(${sqlNStr(r.loaiDiem)}, ${sqlNStr(r.maKho)}, ${sqlNStrOrNull(r.maDiem)}, ${sqlNStr(r.maHang)}, ${sqlNStrOrNull(r.mh)}, ${sqlNStrOrNull(r.tenHang)}, ${sqlNStrOrNull(r.dvt)}, ${sqlNStrOrNull(r.maNganh)}, ${sqlNStrOrNull(r.tenNganh)}, ${sqlNStrOrNull(r.maNCC)}, ${sqlNStrOrNull(r.tenNCC)}, ${sqlNStrOrNull(r.luongGiaoHang)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
        await new sql.Request(tx).query(`
          INSERT INTO etl.CoreItemList (LoaiDiem, MaKho, MaDiem, MaHang, MH, TenHang, Dvt, MaNganh, TenNganh, MaNCC, TenNCC, LuongGiaoHang, ImportedBy)
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
// CORE_COLUMNS (bản 9.46) — 1 thứ tự cột DUY NHẤT cho cả 2 sheet (khác file
// mẫu thật của người dùng, nơi 2 sheet có thứ tự cột khác nhau — KHÔNG vấn
// đề gì vì parseSheet() đọc theo TÊN header, không theo vị trí, nên vẫn nhập
// được file của người dùng dù thứ tự cột khác file mẫu này).
const CORE_COLUMNS = ['MH', 'MaKho', 'MaDiem', 'MaHang', 'TenHang', 'Dvt', 'MaNganh', 'TenNganh', 'MaNCC', 'TenNCC', 'LuongGiaoHang'];

async function buildWorkbook(sheetsData) {
  const workbook = new ExcelJS.Workbook();
  for (const { sheetName, dataRows } of sheetsData) {
    const sheet = workbook.addWorksheet(sheetName);
    const headerRow = sheet.addRow(CORE_COLUMNS);
    headerRow.font = { bold: true };
    for (const row of dataRows) sheet.addRow(row);
    sheet.columns.forEach((col) => { col.width = 24; });
  }
  return workbook.xlsx.writeBuffer();
}

// Mã "VIDU" — XOÁ trước khi nhập. MaKho/MaDiem (bản 9.46, BẮT BUỘC từ bản
// này) có ví dụ kèm theo để người dùng thấy ngay đúng vị trí cần điền.
async function buildCoreItemListTemplate() {
  return buildWorkbook([
    { sheetName: 'Core Mart', dataRows: [['293279690000', 'VIDU10011', 'VIDU001', 'VIDU2005327969', 'Tên hàng ví dụ', 'Cái', '2005', 'Mỹ phẩm (Cosmetic) - XOÁ dòng này trước khi nhập', '', '', '']] },
    { sheetName: 'Core Minimart', dataRows: [['292065170000', 'VIDU12061', 'VIDU206', 'VIDU2002206517', 'Tên hàng ví dụ', 'Chai', '2002', 'Đồ uống, thuốc lá (Beverage and Tobacco) - XOÁ dòng này trước khi nhập', '', '', '']] }
  ]);
}

function buildCoreItemListExport(rowsByLoaiDiem) {
  const sheetsData = Object.entries(LOAI_DIEM_TO_SHEET).map(([loaiDiem, sheetName]) => ({
    sheetName,
    dataRows: (rowsByLoaiDiem[loaiDiem] || []).map(r => [
      r.mh || '', r.maKho || '', r.maDiem || '', r.maHang, r.tenHang || '', r.dvt || '',
      r.maNganh || '', r.tenNganh || '', r.maNCC || '', r.tenNCC || '', r.luongGiaoHang || ''
    ])
  }));
  return buildWorkbook(sheetsData);
}

module.exports = {
  parseCoreItemListFile, replaceCoreItemList,
  buildCoreItemListTemplate, buildCoreItemListExport,
  SHEET_TO_LOAI_DIEM, LOAI_DIEM_TO_SHEET
};
