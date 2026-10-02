// lib/syncJobsImport.js — Đọc file Excel admin tải lên để tạo/sửa NHIỀU
// etl.SyncJobs cùng lúc (bản 8.13 — vd cần tạo 1 job "Doanh thu chi nhánh -
// Live" cho MỖI cửa hàng "Thành viên", tất cả đọc CÙNG 1 VIEW/cấu hình cột,
// chỉ khác Nguồn dữ liệu — bấm form từng cái rất mất công). CHỈ hỗ trợ
// Type='table' (job Type='custom' tham chiếu connector viết tay trong
// etl/sources/, không có ý nghĩa để nhập qua Excel).
//
// Khác lib/dataSourcesImport.js — job Type='table' được ĐỐI CHIẾU VỚI SCHEMA
// THẬT của nguồn (gọi mạng qua lib/schemaBrowser.js, xem
// lib/syncJobSchemaValidation.js) ngay khi lưu, nên KHÔNG dùng được kiểu
// staging-table + MERGE gộp 1 câu SQL như dataSourcesImport.js (mỗi dòng cần
// 1 lượt gọi bất đồng bộ riêng, không thể gộp thành SQL thuần) — xử lý TỪNG
// DÒNG tuần tự, phù hợp quy mô thật của tính năng này (vài chục/vài trăm
// dòng, không phải hàng nghìn).
//
// Khoá để TẠO MỚI hay CẬP NHẬT là "Name" (cùng quy ước với etl.DataSources —
// không có UNIQUE ở CSDL, chỉ là quy ước dùng cho import). Job ĐÃ CÓ nhưng
// đổi Nguồn dữ liệu/bảng nguồn so với dòng Excel bị coi là LỖI (không tự sửa
// âm thầm) — ĐÚNG quy tắc PUT hiện có ở routes/admin/syncJobs.js (đổi bảng
// nguồn/nguồn dữ liệu phải xoá job cũ, tạo job mới) để tránh Nhập hàng loạt
// vô tình đổi nguồn dữ liệu 1 job đang chạy tốt do gõ nhầm dòng Excel.
const ExcelJS = require('exceljs');
const cron = require('node-cron');
const { sql } = require('../db');
const { validateTableJobSchema } = require('./syncJobSchemaValidation');
const { guardZipBombSize } = require('./fileSignature');

// 2 dòng ví dụ đúng khuôn "báo cáo doanh thu thành viên.md" (job Doanh
// thu + Giao dịch cho 1 cửa hàng "Thành viên") — điền sẵn ĐÚNG giá trị
// SourceSchema/SourceTable/KeyColumn/DateColumn/.../TargetDomain thật của
// tính năng đó, admin chỉ cần đổi Name/DataSourceName cho từng cửa hàng
// rồi copy dòng xuống — không phải tự tra cứu lại khuôn cột.
//
// Header PHẢI nằm đúng DÒNG 1 — parseSyncJobsFile() ở dưới đọc cứng
// sheet.getRow(1) làm header (giống lib/dataSourcesImport.js), KHÔNG thêm
// dòng ghi chú/hướng dẫn phía trên header (từng có bug y hệt ở
// buildDataSourcesTemplate() — xem VERSION.md bản 8.31/8.32 — đẩy header
// xuống dòng 2 khiến Nhập hàng loạt luôn báo thiếu cột).
async function buildSyncJobsTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sync Jobs');
  const headerRow = sheet.addRow(['Name', 'DataSourceName', 'TargetDomain', 'SourceSchema', 'SourceTable', 'KeyColumn', 'DateColumn', 'UpdatedAtColumn', 'DimensionColumns', 'MeasureColumns', 'CronExpression', 'KeepHistory', 'IsActive']);
  headerRow.font = { bold: true };
  sheet.addRow(['Doanh thu (TV) - ST VIDU', 'DSMART16 - ST VIDU', 'doanhthu_chinhanh_thanhvien', 'dbo', 'V_HCRC_DOANHTHU_CHINHANH', 'STK_ID', 'WORK_DATE', 'WORK_DATE', 'dienTich,chain', 'doanhThu,laiGop', '*/2 * * * *', 'TRUE', 'TRUE']);
  sheet.addRow(['Giao dịch (TV) - ST VIDU', 'DSMART16 - ST VIDU', 'giaodich_chinhanh_thanhvien', 'dbo', 'V_HCRC_GIAODICH_CHINHANH', 'BU_ID', 'TRAN_DATE', 'TRAN_DATE', '', 'SoGiaoDich', '*/2 * * * *', 'TRUE', 'TRUE']);
  sheet.columns.forEach((col) => { col.width = 22; });
  return workbook.xlsx.writeBuffer();
}

const REQUIRED_HEADERS = ['Name', 'DataSourceName', 'TargetDomain', 'SourceSchema', 'SourceTable', 'KeyColumn', 'DateColumn', 'UpdatedAtColumn'];
const DEFAULT_CRON = '*/15 * * * *';
const BOOL_TRUE_VALUES = ['true', '1', 'yes', 'có', 'x'];

// Case thật (vài chục/vài trăm chi nhánh) — dư nhiều lần, chặn sớm trước khi
// lặp qua từng dòng gọi mạng kiểm tra schema (mỗi dòng đã tốn 1-2 lượt gọi
// mạng, KHÔNG nên để lọt số dòng lớn gây chạy quá lâu/treo request).
const MAX_IMPORT_ROWS = 1000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

function parseBool(raw, defaultValue) {
  if (raw === null || raw === undefined || raw === '') return defaultValue;
  return BOOL_TRUE_VALUES.includes(String(raw).trim().toLowerCase());
}

function splitColumnList(raw) {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

// { rows, rowErrors } — CHƯA đối chiếu schema/tồn tại Nguồn dữ liệu (làm ở
// upsertSyncJobs, cần query CSDL) — hàm này chỉ đọc cấu trúc file.
async function parseSyncJobsFile(buffer) {
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
  for (const name of [...REQUIRED_HEADERS, 'DimensionColumns', 'MeasureColumns', 'CronExpression', 'KeepHistory', 'IsActive']) {
    col[name] = headers.indexOf(name);
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const name = str(cell(col.Name));
    const dataSourceName = str(cell(col.DataSourceName));
    const targetDomain = str(cell(col.TargetDomain));
    const sourceSchema = str(cell(col.SourceSchema));
    const sourceTable = str(cell(col.SourceTable));
    const keyColumn = str(cell(col.KeyColumn));
    const dateColumn = str(cell(col.DateColumn));
    const updatedAtColumn = str(cell(col.UpdatedAtColumn));
    if (!name && !dataSourceName && !targetDomain && !sourceSchema && !sourceTable) return; // dòng trống bỏ qua

    const missing = [];
    if (!name) missing.push('Name');
    if (!dataSourceName) missing.push('DataSourceName');
    if (!targetDomain) missing.push('TargetDomain');
    if (!sourceSchema) missing.push('SourceSchema');
    if (!sourceTable) missing.push('SourceTable');
    if (!keyColumn) missing.push('KeyColumn');
    if (!dateColumn) missing.push('DateColumn');
    if (!updatedAtColumn) missing.push('UpdatedAtColumn');
    if (missing.length) { rowErrors.push(`Dòng ${rowNumber}: thiếu ${missing.join(', ')}`); return; }

    const cronExpression = str(cell(col.CronExpression)) || DEFAULT_CRON;
    if (!cron.validate(cronExpression)) {
      rowErrors.push(`Dòng ${rowNumber}: "CronExpression" không hợp lệ ("${cronExpression}")`);
      return;
    }

    rows.push({
      rowNumber, name, dataSourceName, targetDomain, sourceSchema, sourceTable,
      keyColumn, dateColumn, updatedAtColumn,
      dimensionColumns: splitColumnList(cell(col.DimensionColumns)),
      measureColumns: splitColumnList(cell(col.MeasureColumns)),
      cronExpression,
      keepHistory: parseBool(cell(col.KeepHistory), false),
      isActive: parseBool(cell(col.IsActive), true)
    });
  });

  return { rows, rowErrors };
}

// pool: ADMIN pool. rescheduleJob: hàm gọi lại sau khi ghi (route tự truyền
// vào — lib này không phụ thuộc jobs/scheduler.js để dễ test/tách bạch).
// Trả { inserted, updated, rowErrors, ids } — rowErrors ở đây là lỗi PHÁT
// SINH LÚC GHI (không tìm thấy Nguồn dữ liệu, sai schema thật, đổi nguồn của
// job đã có...), khác rowErrors của parseSyncJobsFile (lỗi cấu trúc file).
async function upsertSyncJobs(pool, rows) {
  if (!rows.length) return { inserted: 0, updated: 0, rowErrors: [], ids: [] };

  const sourcesResult = await pool.request().query('SELECT Id, Name FROM etl.DataSources');
  const dataSourceIdByName = new Map(sourcesResult.recordset.map(s => [s.Name, s.Id]));

  const existingResult = await pool.request().query('SELECT Id, Name, Type, DataSourceId, SourceSchema, SourceTable FROM etl.SyncJobs');
  const existingByName = new Map(existingResult.recordset.map(j => [j.Name, j]));

  let inserted = 0;
  let updated = 0;
  const rowErrors = [];
  const ids = [];

  for (const row of rows) {
    const dataSourceId = dataSourceIdByName.get(row.dataSourceName);
    if (!dataSourceId) {
      rowErrors.push(`Dòng ${row.rowNumber} (${row.name}): không tìm thấy Nguồn dữ liệu tên "${row.dataSourceName}" — tạo nguồn này trước (trang Nguồn dữ liệu) rồi nhập lại`);
      continue;
    }

    const b = {
      dataSourceId, sourceSchema: row.sourceSchema, sourceTable: row.sourceTable,
      keyColumn: row.keyColumn, dateColumn: row.dateColumn, updatedAtColumn: row.updatedAtColumn,
      dimensionColumns: row.dimensionColumns, measureColumns: row.measureColumns
    };
    try {
      await validateTableJobSchema(b);
    } catch (err) {
      rowErrors.push(`Dòng ${row.rowNumber} (${row.name}): ${err.message}`);
      continue;
    }

    const existing = existingByName.get(row.name);
    if (existing) {
      if (existing.Type !== 'table' || existing.DataSourceId !== dataSourceId || existing.SourceSchema !== row.sourceSchema || existing.SourceTable !== row.sourceTable) {
        rowErrors.push(`Dòng ${row.rowNumber} (${row.name}): job đã tồn tại nhưng khác Loại/Nguồn dữ liệu/bảng nguồn với dòng Excel — Nhập hàng loạt KHÔNG đổi các trường này (đúng quy tắc Sửa job hiện có), xoá job cũ và tạo job mới nếu thật sự cần đổi`);
        continue;
      }
      await pool.request()
        .input('id', sql.Int, existing.Id)
        .input('name', sql.NVarChar(200), row.name)
        .input('cronExpression', sql.VarChar(50), row.cronExpression)
        .input('isActive', sql.Bit, row.isActive ? 1 : 0)
        .input('targetDomain', sql.VarChar(50), row.targetDomain)
        .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(row.dimensionColumns))
        .input('measureColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(row.measureColumns))
        .input('keepHistory', sql.Bit, row.keepHistory ? 1 : 0)
        .query(`
          UPDATE etl.SyncJobs
          SET Name = @name, CronExpression = @cronExpression, IsActive = @isActive, TargetDomain = @targetDomain,
              DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
              KeepHistory = @keepHistory
          WHERE Id = @id
        `);
      updated++;
      ids.push(existing.Id);
    } else {
      const result = await pool.request()
        .input('name', sql.NVarChar(200), row.name)
        .input('type', sql.VarChar(10), 'table')
        .input('dataSourceId', sql.Int, dataSourceId)
        .input('sourceSchema', sql.NVarChar(100), row.sourceSchema)
        .input('sourceTable', sql.NVarChar(100), row.sourceTable)
        .input('keyColumn', sql.NVarChar(100), row.keyColumn)
        .input('dateColumn', sql.NVarChar(100), row.dateColumn)
        .input('updatedAtColumn', sql.NVarChar(100), row.updatedAtColumn)
        .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(row.dimensionColumns))
        .input('measureColumnsJson', sql.NVarChar(sql.MAX), JSON.stringify(row.measureColumns))
        .input('targetDomain', sql.VarChar(50), row.targetDomain)
        .input('cronExpression', sql.VarChar(50), row.cronExpression)
        .input('isActive', sql.Bit, row.isActive ? 1 : 0)
        .input('keepHistory', sql.Bit, row.keepHistory ? 1 : 0)
        .query(`
          INSERT INTO etl.SyncJobs (
            Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
            DimensionColumnsJson, MeasureColumnsJson, TargetDomain, CronExpression, IsActive, KeepHistory
          )
          OUTPUT INSERTED.Id
          VALUES (
            @name, @type, @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
            @dimensionColumnsJson, @measureColumnsJson, @targetDomain, @cronExpression, @isActive, @keepHistory
          )
        `);
      inserted++;
      ids.push(result.recordset[0].Id);
      existingByName.set(row.name, { Id: result.recordset[0].Id, Type: 'table', DataSourceId: dataSourceId, SourceSchema: row.sourceSchema, SourceTable: row.sourceTable });
    }
  }

  return { inserted, updated, rowErrors, ids };
}

module.exports = { parseSyncJobsFile, upsertSyncJobs, buildSyncJobsTemplate, REQUIRED_HEADERS };
