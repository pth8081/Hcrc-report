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
// (LoaiMaKhac, MaKhac). TrangThai không đề cập ở dòng nào đó (file không có
// cột, hoặc để trống) -> COALESCE giữ nguyên giá trị cũ (nếu có), KHÔNG tự
// ý xoá TrangThai='DaDong' đang có — cùng lý do với dwh.SalesTargets (xem
// lib/salesTargetsImport.js) — re-upload chỉ sửa vài dòng không được âm
// thầm "mở lại" các dòng khác lỡ quên cột TrangThai.
async function upsertBranchCodeMap(pool, rows, importedBy) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`
      IF OBJECT_ID('tempdb..#StagingBranchCodeMap') IS NOT NULL DROP TABLE #StagingBranchCodeMap;
      CREATE TABLE #StagingBranchCodeMap (
        LoaiMaKhac VARCHAR(50)   NOT NULL,
        MaKhac     NVARCHAR(50)  NOT NULL,
        MaChuan    NVARCHAR(100) NOT NULL,
        TenSieuThi NVARCHAR(200) NULL,
        TrangThai  VARCHAR(20)   NULL
      );
    `);

    const table = new sql.Table('#StagingBranchCodeMap');
    table.create = false;
    table.columns.add('LoaiMaKhac', sql.VarChar(50), { nullable: false });
    table.columns.add('MaKhac', sql.NVarChar(50), { nullable: false });
    table.columns.add('MaChuan', sql.NVarChar(100), { nullable: false });
    table.columns.add('TenSieuThi', sql.NVarChar(200), { nullable: true });
    table.columns.add('TrangThai', sql.VarChar(20), { nullable: true });
    for (const r of rows) {
      table.rows.add(r.loaiMaKhac, r.maKhac, r.maChuan, r.tenSieuThi, r.trangThai);
    }
    await new sql.Request(tx).bulk(table);

    const mergeResult = await new sql.Request(tx)
      .input('importedBy', sql.NVarChar(50), importedBy || null)
      .query(`
        MERGE etl.BranchCodeMap AS target
        USING #StagingBranchCodeMap AS src
          ON  target.LoaiMaKhac = src.LoaiMaKhac
          AND target.MaKhac = src.MaKhac
        WHEN MATCHED THEN
          UPDATE SET
            MaChuan = src.MaChuan,
            TenSieuThi = src.TenSieuThi,
            TrangThai = COALESCE(src.TrangThai, target.TrangThai),
            ImportedAt = SYSUTCDATETIME(),
            ImportedBy = @importedBy
        WHEN NOT MATCHED THEN
          INSERT (LoaiMaKhac, MaKhac, MaChuan, TenSieuThi, TrangThai, ImportedAt, ImportedBy)
          VALUES (src.LoaiMaKhac, src.MaKhac, src.MaChuan, src.TenSieuThi, src.TrangThai, SYSUTCDATETIME(), @importedBy)
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

module.exports = { parseBranchCodeMapFile, upsertBranchCodeMap, REQUIRED_HEADERS, TRANG_THAI_VALUES };
