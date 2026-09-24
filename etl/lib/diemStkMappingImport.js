// lib/diemStkMappingImport.js — Đọc file Excel "Ánh xạ Điểm - STK_ID" và ghi
// vào etl.DiemStkMapping (xem chú thích đầy đủ tại CREATE TABLE trong
// etl-db/schema.sql). Khác hẳn lib/branchCodeMapImport.js (1 mã gốc <-> ĐÚNG
// 1 mã chuẩn): ở đây 1 mã Điểm (BU_ID, dùng nguyên trong file chỉ tiêu
// LDTD/HCRC) gộp NHIỀU mã kho STK_ID, tách riêng theo kỳ QUÁ KHỨ (MaStkCu)
// và HIỆN TẠI (MaStkMoi) — xem rp-server/lib/diemStkMapping.js/
// compositeReportRunner.js phía tiêu thụ dữ liệu này.
//
// Định dạng file (.xlsx): dòng 1 header — STT (bỏ qua, chỉ để người nhập dễ
// theo dõi), MaDiem (BẮT BUỘC), MaStkCu, MaStkMoi (cả 2 TUỲ CHỌN — nhiều mã
// cách nhau bằng dấu PHẨY, không dấu cách, để trống nếu kỳ đó không áp
// dụng), TenSieuThi (TUỲ CHỌN).
//
// RÀNG BUỘC NGHIỆP VỤ đã xác nhận với người dùng: 1 mã STK_ID chỉ được thuộc
// ĐÚNG 1 mã Điểm (mã Điểm sinh ra mã STK_ID nên về lý thuyết không bao giờ
// trùng) — validateNoDuplicateStkIds() phát hiện vi phạm thì CHẶN HẲN toàn
// bộ file (không nhập phần nào, kể cả các dòng không liên quan tới STK_ID bị
// trùng) — khác mọi file import khác trong repo (thường chỉ bỏ qua ĐÚNG dòng
// lỗi, các dòng khác vẫn nhập) vì đây là lỗi cấu hình nghiêm trọng (dẫn tới
// CỘNG TRÙNG doanh thu giữa 2 mã Điểm), không phải lỗi 1 dòng đơn lẻ.
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const MAX_IMPORT_ROWS = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

function parseStkList(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

// { rows: [{maDiem, maStkCu:[], maStkMoi:[], tenSieuThi}], rowErrors: string[] }
async function parseDiemStkMappingFile(buffer) {
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
  for (const name of ['MaDiem', 'MaStkCu', 'MaStkMoi', 'TenSieuThi']) {
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
    const maStkCuRaw = str(cell(col.MaStkCu));
    const maStkMoiRaw = str(cell(col.MaStkMoi));
    const tenSieuThi = str(cell(col.TenSieuThi));
    if (!maDiem && !maStkCuRaw && !maStkMoiRaw && !tenSieuThi) return; // dòng trống bỏ qua

    if (!maDiem) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaDiem`); return; }
    if (seenInFile.has(maDiem)) { rowErrors.push(`Dòng ${rowNumber}: MaDiem "${maDiem}" đã xuất hiện ở dòng khác trong CHÍNH file này`); return; }
    seenInFile.add(maDiem);

    rows.push({
      maDiem,
      maStkCu: parseStkList(maStkCuRaw),
      maStkMoi: parseStkList(maStkMoiRaw),
      tenSieuThi: tenSieuThi || null
    });
  });

  return { rows, rowErrors };
}

// Đối chiếu MỌI mã STK_ID (gộp cả MaStkCu+MaStkMoi) — TRONG chính file đang
// nhập, VÀ với dữ liệu đã lưu trong DB (trừ các dòng MaDiem đang được CHÍNH
// file này cập nhật — coi là "ghi đè", không phải "khác nhau"). Trả về danh
// sách xung đột dạng chuỗi mô tả sẵn, RỖNG nếu không có gì trùng.
async function findDuplicateStkIds(pool, rows) {
  const conflicts = [];

  // 1) Trùng NGAY TRONG file đang nhập (2 mã Điểm khác nhau cùng khai 1 STK_ID).
  const inFileMap = new Map(); // stk -> maDiem đầu tiên gặp
  for (const r of rows) {
    for (const stk of [...r.maStkCu, ...r.maStkMoi]) {
      if (inFileMap.has(stk) && inFileMap.get(stk) !== r.maDiem) {
        conflicts.push(`Mã STK_ID "${stk}" xuất hiện ở CẢ mã Điểm "${inFileMap.get(stk)}" và "${r.maDiem}" trong cùng file đang nhập`);
      } else if (!inFileMap.has(stk)) {
        inFileMap.set(stk, r.maDiem);
      }
    }
  }

  // 2) Trùng với dữ liệu ĐÃ LƯU của 1 mã Điểm KHÁC (không nằm trong lượt nhập này).
  const maDiemsInFile = new Set(rows.map(r => r.maDiem));
  const existing = await pool.request().query('SELECT MaDiem, MaStkCu, MaStkMoi FROM etl.DiemStkMapping');
  for (const dbRow of existing.recordset) {
    if (maDiemsInFile.has(dbRow.MaDiem)) continue; // dòng này sẽ bị GHI ĐÈ bởi chính file, không phải xung đột
    for (const stk of [...parseStkList(dbRow.MaStkCu), ...parseStkList(dbRow.MaStkMoi)]) {
      if (inFileMap.has(stk)) {
        conflicts.push(`Mã STK_ID "${stk}" trong file đang gán cho mã Điểm "${inFileMap.get(stk)}" nhưng ĐÃ thuộc mã Điểm "${dbRow.MaDiem}" trong dữ liệu đang lưu`);
      }
    }
  }

  return conflicts;
}

// Staging + MERGE — cùng mẫu với lib/branchCodeMapImport.js (KHÔNG dùng
// request.bulk()/sql.Table — xem chú thích ở đó), khoá theo MaDiem.
const DIEM_STK_ROWS_PER_TRANSACTION = 2000;
const DIEM_STK_INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

function buildDiemStkInsertBatches(rows, importedBy) {
  const batches = [];
  for (let i = 0; i < rows.length; i += DIEM_STK_INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + DIEM_STK_INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${sqlNStr(r.maDiem)}, ${sqlNStrOrNull(r.maStkCu.join(','))}, ${sqlNStrOrNull(r.maStkMoi.join(','))}, ${sqlNStrOrNull(r.tenSieuThi)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
    batches.push(`INSERT INTO #StagingDiemStkMapping (MaDiem, MaStkCu, MaStkMoi, TenSieuThi, ImportedBy) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_DIEM_STK_SQL = `
IF OBJECT_ID('tempdb..#StagingDiemStkMapping') IS NOT NULL DROP TABLE #StagingDiemStkMapping;
CREATE TABLE #StagingDiemStkMapping (
  MaDiem     NVARCHAR(50)  NOT NULL,
  MaStkCu    NVARCHAR(500) NULL,
  MaStkMoi   NVARCHAR(500) NULL,
  TenSieuThi NVARCHAR(200) NULL,
  ImportedBy NVARCHAR(50)  NULL
);`;

const MERGE_DIEM_STK_SQL = `
MERGE etl.DiemStkMapping AS target
USING #StagingDiemStkMapping AS src
  ON target.MaDiem = src.MaDiem
WHEN MATCHED THEN
  UPDATE SET
    MaStkCu = src.MaStkCu,
    MaStkMoi = src.MaStkMoi,
    TenSieuThi = src.TenSieuThi,
    ImportedAt = SYSUTCDATETIME(),
    ImportedBy = src.ImportedBy
WHEN NOT MATCHED THEN
  INSERT (MaDiem, MaStkCu, MaStkMoi, TenSieuThi, ImportedAt, ImportedBy)
  VALUES (src.MaDiem, src.MaStkCu, src.MaStkMoi, src.TenSieuThi, SYSUTCDATETIME(), src.ImportedBy)
OUTPUT $action AS Action;`;

async function upsertDiemStkMapping(pool, rows, importedBy) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += DIEM_STK_ROWS_PER_TRANSACTION) {
    const chunk = rows.slice(i, i + DIEM_STK_ROWS_PER_TRANSACTION);
    const result = await upsertDiemStkMappingChunk(pool, chunk, importedBy);
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

async function upsertDiemStkMappingChunk(pool, rows, importedBy) {
  const setupSql = [CREATE_STAGING_DIEM_STK_SQL, ...buildDiemStkInsertBatches(rows, importedBy)].join('\n');

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const mergeResult = await new sql.Request(tx).query([setupSql, MERGE_DIEM_STK_SQL].join('\n'));

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

// ---- Xuất file mẫu (template) + xuất dữ liệu hiện có (export) — cùng
// tinh thần lib/branchCodeMapImport.js/lib/salesTargetsImport.js.
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

// Mã "VIDU" — XOÁ trước khi nhập. KHÔNG kèm dòng ghi chú phía trên header
// (giống lib/branchCodeMapImport.js) — parser đọc CỐ ĐỊNH dòng 1 là header.
async function buildDiemStkMappingTemplate() {
  return buildWorkbook(
    'Anh xa Diem-STK',
    ['STT', 'MaDiem', 'MaStkCu', 'MaStkMoi', 'TenSieuThi'],
    [
      [1, 'VIDU', '10001,10002', '13061', 'Tên siêu thị ví dụ - XOÁ dòng này trước khi nhập'],
      [2, 'VIDU2', '', '13051,13052', 'Nhiều mã cách nhau bằng dấu phẩy, KHÔNG dấu cách']
    ]
  );
}

function buildDiemStkMappingExport(rows) {
  const dataRows = rows.map((r, i) => [i + 1, r.maDiem, r.maStkCu.join(','), r.maStkMoi.join(','), r.tenSieuThi || '']);
  return buildWorkbook('Anh xa Diem-STK', ['STT', 'MaDiem', 'MaStkCu', 'MaStkMoi', 'TenSieuThi'], dataRows);
}

// Đồng bộ TỰ ĐỘNG sang etl.BranchCodeMap (LoaiMaKhac='BU_ID') mỗi khi
// "Ánh xạ Điểm - STK_ID" được ghi (PUT /one hoặc POST /import) — theo yêu
// cầu người dùng, tránh phải khai 2 nơi cùng 1 dữ liệu (trước đây phải chạy
// tay scripts/generateBranchCodeMapFromDiemStk.js rồi tự nhập lại qua trang
// "Ánh xạ mã chi nhánh").
//
// LẤY 1 mã kho BẤT KỲ trong "Điểm mới" (MaStkMoi[0]), hoặc "Điểm cũ" nếu mã
// Điểm đã đóng (MaStkMoi rỗng) — TRANSHDR (nguồn của domain
// giaodich_chinhanh) vốn không tách được theo từng kho con nên quy về kho
// nào trong số các kho hiện có CŨNG ĐƯỢC, báo cáo composite
// (block.useDiemStkMapping, xem rp-server/lib/compositeReportRunner.js) sẽ
// tự cộng dồn lại đúng theo mã Điểm ở bước sau, không quan trọng đã "chẻ"
// theo đúng kho con nào lúc đồng bộ.
//
// Mã Điểm KHÔNG có mã kho nào (cả cũ lẫn mới đều trống) -> KHÔNG thể xác
// định MaChuan (cột NOT NULL của etl.BranchCodeMap) -> bỏ qua, trả về trong
// `skipped` để caller cảnh báo cho người dùng (không tự ý xoá/đóng dòng
// BranchCodeMap cũ nếu có — người dùng tự xử lý thủ công nếu cần).
function buildBranchCodeMapSyncRows(diemStkRows) {
  const rows = [];
  const skipped = [];
  for (const r of diemStkRows) {
    const maChuan = (r.maStkMoi && r.maStkMoi[0]) || (r.maStkCu && r.maStkCu[0]);
    if (!maChuan) { skipped.push(r.maDiem); continue; }
    rows.push({ loaiMaKhac: 'BU_ID', maKhac: r.maDiem, maChuan, tenSieuThi: r.tenSieuThi || null, trangThai: null });
  }
  return { rows, skipped };
}

module.exports = {
  parseDiemStkMappingFile, findDuplicateStkIds, upsertDiemStkMapping, parseStkList,
  buildDiemStkMappingTemplate, buildDiemStkMappingExport, buildBranchCodeMapSyncRows
};
