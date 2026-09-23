// lib/branchCodeMapImport.js — Đọc file Excel "Ánh xạ mã chi nhánh" admin tải
// lên và ghi vào etl.BranchCodeMap (xem chú thích đầy đủ tại CREATE TABLE
// trong etl-db/schema.sql). Dùng chung pool "ADMIN" (bảng nằm trong CSDL
// etl, không cần vai trò/pool riêng như dwh.SalesTargets).
//
// Định dạng file (.xlsx): dòng 1 là header, cột BẮT BUỘC: LoaiMaKhac,
// MaKhac, MaChuan. Cột TUỲ CHỌN: TenSieuThi (chỉ để hiển thị, không dùng để
// đối chiếu), TrangThai ("HoatDong" mặc định nếu để trống, hoặc "DaDong" —
// ngừng áp dụng dòng này, giữ lại lịch sử thay vì xoá).
//
// Khoá để TẠO MỚI hay CẬP NHẬT là (LoaiMaKhac, MaKhac) — trùng khoá UNIQUE
// của etl.BranchCodeMap, re-upload sửa 1 dòng (giữ nguyên các dòng khác)
// không tạo trùng.
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const REQUIRED_HEADERS = ['LoaiMaKhac', 'MaKhac', 'MaChuan'];
const TRANG_THAI_VALUES = ['HoatDong', 'DaDong'];

// Chặn sớm file .xlsx quá nhiều dòng/zip bomb — xem chú thích cùng tên
// trong lib/dataSourcesImport.js.
const MAX_IMPORT_ROWS = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

// { rows: [{loaiMaKhac, maKhac, maChuan, tenSieuThi, trangThai}], rowErrors: string[] }
async function parseBranchCodeMapFile(buffer) {
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
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) throw new Error(`File thiếu cột bắt buộc "${required}"`);
  }
  const col = {};
  for (const name of ['LoaiMaKhac', 'MaKhac', 'MaChuan', 'TenSieuThi', 'TrangThai']) {
    col[name] = headers.indexOf(name); // -1 nếu không có (chỉ TenSieuThi/TrangThai được phép thiếu)
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const loaiMaKhac = str(cell(col.LoaiMaKhac));
    const maKhac = str(cell(col.MaKhac));
    const maChuan = str(cell(col.MaChuan));
    const tenSieuThi = str(cell(col.TenSieuThi));
    if (!loaiMaKhac && !maKhac && !maChuan && !tenSieuThi) return; // dòng trống bỏ qua

    const missing = [];
    if (!loaiMaKhac) missing.push('LoaiMaKhac');
    if (!maKhac) missing.push('MaKhac');
    if (!maChuan) missing.push('MaChuan');
    if (missing.length) { rowErrors.push(`Dòng ${rowNumber}: thiếu ${missing.join(', ')}`); return; }

    let trangThai = null;
    const trangThaiRaw = str(cell(col.TrangThai));
    if (trangThaiRaw) {
      if (!TRANG_THAI_VALUES.includes(trangThaiRaw)) {
        rowErrors.push(`Dòng ${rowNumber}: "TrangThai" phải là "HoatDong" hoặc "DaDong" (đang là "${trangThaiRaw}")`);
        return;
      }
      trangThai = trangThaiRaw;
    }

    rows.push({ loaiMaKhac, maKhac, maChuan, tenSieuThi: tenSieuThi || null, trangThai });
  });

  return { rows, rowErrors };
}

// Staging + MERGE — cùng mẫu với lib/dataSourcesImport.js, khoá theo
// (LoaiMaKhac, MaKhac).
//
// LƯU Ý QUAN TRỌNG — TẠI SAO KHÔNG DÙNG request.bulk()/sql.Table VÀ KHÔNG
// DÙNG .input(): đã tìm ra và sửa lỗi thật "Invalid object name" xảy ra
// NGAY TẠI request.bulk() khi dùng trên Request gắn Transaction (xem
// lib/upsert.js — dwh.ReportFacts — và lib/salesTargetsImport.js —
// dwh.SalesTargets — cùng gặp lỗi này); `.input()` trên câu MERGE có tham
// chiếu temp table cũng từng gây lỗi tương tự (xem #StagingTargets trước
// khi sửa). Áp dụng cùng cách đã chứng minh ổn định: gộp CREATE TABLE +
// INSERT (literal, escape thủ công) + MERGE vào CÙNG 1 chuỗi SQL/1 lượt
// .query() — importedBy/preserveTrangThai nạp cùng bulk-insert (mỗi dòng
// lặp lại giá trị NHƯ NHAU) thay vì `.input()`.
//
// preserveTrangThaiIfUnspecified — CHỈ bật cho POST /import (nhập file, mirror
// lib/salesTargetsImport.js): file re-upload có thể không đề cập TrangThai ở
// 1 dòng nào đó (file không có cột, hoặc để trống) -> COALESCE giữ nguyên
// giá trị cũ (nếu có), KHÔNG tự ý xoá TrangThai='DaDong' đang có — re-upload
// chỉ sửa vài dòng không được âm thầm "mở lại" các dòng khác lỡ quên cột
// TrangThai. PUT /one (sửa 1 dòng) KHÔNG bật cờ này — route đó có tài liệu
// rõ "GHI ĐÈ nguyên" vì giao diện đã tự tải dữ liệu hiện có lên form: để
// trống nghĩa là admin CHỦ Ý đặt về đang áp dụng (NULL/HoatDong), không phải
// "không biết/không đụng tới" — thiếu nhánh này trước đây khiến 1 dòng đã
// đóng ('DaDong') KHÔNG BAO GIỜ mở lại được qua form sửa đơn (frontend không
// có cách gửi literal "HoatDong", chỉ gửi '' hoặc "DaDong" — '' bị coi là
// "không đề cập" nên COALESCE luôn giữ nguyên "DaDong" cũ).
const BRANCH_MAP_ROWS_PER_TRANSACTION = 2000;
const BRANCH_MAP_INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

function buildBranchMapInsertBatches(rows, importedBy, preserveTrangThaiValue) {
  const batches = [];
  for (let i = 0; i < rows.length; i += BRANCH_MAP_INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + BRANCH_MAP_INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${sqlNStr(r.loaiMaKhac)}, ${sqlNStr(r.maKhac)}, ${sqlNStr(r.maChuan)}, ${sqlNStrOrNull(r.tenSieuThi)}, ${sqlNStrOrNull(r.trangThai)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'}, ${preserveTrangThaiValue ? 1 : 0})`).join(',\n');
    batches.push(`INSERT INTO #StagingBranchCodeMap (LoaiMaKhac, MaKhac, MaChuan, TenSieuThi, TrangThai, ImportedBy, PreserveTrangThai) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_BRANCH_MAP_SQL = `
IF OBJECT_ID('tempdb..#StagingBranchCodeMap') IS NOT NULL DROP TABLE #StagingBranchCodeMap;
CREATE TABLE #StagingBranchCodeMap (
  LoaiMaKhac        VARCHAR(50)   NOT NULL,
  MaKhac            NVARCHAR(50)  NOT NULL,
  MaChuan           NVARCHAR(100) NOT NULL,
  TenSieuThi        NVARCHAR(200) NULL,
  TrangThai         VARCHAR(20)   NULL,
  ImportedBy        NVARCHAR(50)  NULL,
  PreserveTrangThai BIT           NOT NULL
);`;

const MERGE_BRANCH_MAP_SQL = `
MERGE etl.BranchCodeMap AS target
USING #StagingBranchCodeMap AS src
  ON  target.LoaiMaKhac = src.LoaiMaKhac
  AND target.MaKhac = src.MaKhac
WHEN MATCHED THEN
  UPDATE SET
    MaChuan = src.MaChuan,
    TenSieuThi = src.TenSieuThi,
    TrangThai = CASE WHEN src.PreserveTrangThai = 1 THEN COALESCE(src.TrangThai, target.TrangThai) ELSE src.TrangThai END,
    ImportedAt = SYSUTCDATETIME(),
    ImportedBy = src.ImportedBy
WHEN NOT MATCHED THEN
  INSERT (LoaiMaKhac, MaKhac, MaChuan, TenSieuThi, TrangThai, ImportedAt, ImportedBy)
  VALUES (src.LoaiMaKhac, src.MaKhac, src.MaChuan, src.TenSieuThi, src.TrangThai, SYSUTCDATETIME(), src.ImportedBy)
OUTPUT $action AS Action;`;

async function upsertBranchCodeMap(pool, rows, importedBy, { preserveTrangThaiIfUnspecified = false } = {}) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BRANCH_MAP_ROWS_PER_TRANSACTION) {
    const chunk = rows.slice(i, i + BRANCH_MAP_ROWS_PER_TRANSACTION);
    const result = await upsertBranchCodeMapChunk(pool, chunk, importedBy, { preserveTrangThaiIfUnspecified });
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

async function upsertBranchCodeMapChunk(pool, rows, importedBy, { preserveTrangThaiIfUnspecified = false } = {}) {
  const preserveTrangThaiValue = !!preserveTrangThaiIfUnspecified;
  const setupSql = [CREATE_STAGING_BRANCH_MAP_SQL, ...buildBranchMapInsertBatches(rows, importedBy, preserveTrangThaiValue)].join('\n');

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const mergeResult = await new sql.Request(tx).query([setupSql, MERGE_BRANCH_MAP_SQL].join('\n'));

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

// ---- Xuất file mẫu (template) + xuất dữ liệu hiện có (export) — theo yêu
// cầu người dùng, cùng tinh thần lib/salesTargetsImport.js: tải "file mẫu"
// về, điền rồi NHẬP LẠI được luôn qua chính POST /import; "xuất dữ liệu
// hiện có" đọc lại etl.BranchCodeMap, dựng về đúng khuôn cột file gốc.
async function buildWorkbook(sheetName, headers, dataRows, noteLine) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  if (noteLine) sheet.addRow([noteLine]);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((col) => { col.width = 22; });
  return workbook.xlsx.writeBuffer();
}

// Mã "VIDU" (không khớp mã thật nào) — XOÁ trước khi nhập. KHÔNG kèm dòng
// ghi chú phía trên header (khác lib/salesTargetsImport.js) — parser file
// này đọc CỐ ĐỊNH dòng 1 là header (xem parseBranchCodeMapFile() ở trên,
// không có detectHeaderRow dò nhiều dòng như salesTargetsImport.js), thêm
// dòng ghi chú sẽ khiến chính file mẫu KHÔNG nhập lại được — giải thích cột
// đã có sẵn trong đoạn hướng dẫn trên trang (BranchCodeMapPage.jsx).
async function buildBranchCodeMapTemplate() {
  return buildWorkbook(
    'Anh xa',
    ['LoaiMaKhac', 'MaKhac', 'MaChuan', 'TenSieuThi', 'TrangThai'],
    [['BU_ID', 'VIDU-00100', '13061', 'Tên siêu thị ví dụ - XOÁ dòng này trước khi nhập', '']]
  );
}

function buildBranchCodeMapExport(rows) {
  const dataRows = rows.map(r => [r.loaiMaKhac, r.maKhac, r.maChuan, r.tenSieuThi || '', r.trangThai || '']);
  return buildWorkbook('Anh xa', ['LoaiMaKhac', 'MaKhac', 'MaChuan', 'TenSieuThi', 'TrangThai'], dataRows);
}

module.exports = {
  parseBranchCodeMapFile, upsertBranchCodeMap, REQUIRED_HEADERS, TRANG_THAI_VALUES,
  buildBranchCodeMapTemplate, buildBranchCodeMapExport
};
