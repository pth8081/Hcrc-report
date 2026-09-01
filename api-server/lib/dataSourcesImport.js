// lib/dataSourcesImport.js — Đọc file Excel admin tải lên để tạo/sửa NHIỀU
// api.DataSources cùng lúc (vd cấu hình kết nối DB cho hàng chục chi nhánh
// cùng cấu trúc, thay vì bấm form từng cái) và ghi vào api.DataSources.
// Chỉ SQL Server (đúng phạm vi api.DataSources hiện tại, không có cột
// Engine — xem etl/lib/dataSourcesImport.js cho bản có Engine bên ETL).
//
// LƯU Ý QUAN TRỌNG: file này chứa MẬT KHẨU THẬT dạng chữ thường (không mã
// hoá) của từng CSDL chi nhánh — chỉ mã hoá SAU khi đọc, ngay trước khi ghi
// (xem upsertDataSources). File gốc KHÔNG được lưu lại (routes/admin/dataSources.js
// dùng multer memoryStorage, chỉ đọc buffer trong RAM, không ghi ra đĩa) —
// nhưng bản thân file .xlsx trên máy admin trước/sau khi tải lên vẫn là dữ
// liệu nhạy cảm, admin tự chịu trách nhiệm xoá sau khi dùng xong.
//
// Định dạng file (.xlsx): dòng 1 là header, các cột BẮT BUỘC: Name, Server,
// DatabaseName, Username, Password. Cột TUỲ CHỌN: Port (mặc định 1433),
// Encrypt, TrustServerCert (chấp nhận TRUE/FALSE/1/0/có/không, để trống =
// mặc định).
//
// Khoá để TẠO MỚI hay CẬP NHẬT là "Name" — xem chú thích tương ứng ở
// etl/lib/dataSourcesImport.js (cùng quy ước).
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { encrypt } = require('./crypto');

const REQUIRED_HEADERS = ['Name', 'Server', 'DatabaseName', 'Username', 'Password'];
const BOOL_TRUE_VALUES = ['true', '1', 'yes', 'có', 'x'];

// Chặn sớm file .xlsx có QUÁ NHIỀU dòng (dù dưới giới hạn dung lượng multer —
// .xlsx là zip, nội dung lặp lại nén rất tốt nên vẫn có thể mở ra hàng trăm
// nghìn dòng trong bộ nhớ) TRƯỚC khi lặp qua từng dòng/mã hoá mật khẩu/ghi
// CSDL — cùng giới hạn với etl/lib/dataSourcesImport.js (bản này trước đây
// thiếu kiểm tra), dùng case thật (vài chục/vài trăm chi nhánh) làm chuẩn.
const MAX_IMPORT_ROWS = 5000;

function parseBool(raw, defaultValue) {
  if (raw === null || raw === undefined || raw === '') return defaultValue;
  return BOOL_TRUE_VALUES.includes(String(raw).trim().toLowerCase());
}

// { rows: [{name, server, port, databaseName, username, password, encrypt, trustServerCert}], rowErrors: string[] }
async function parseDataSourcesFile(buffer) {
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
  for (const name of ['Name', 'Server', 'Port', 'DatabaseName', 'Username', 'Password', 'Encrypt', 'TrustServerCert']) {
    col[name] = headers.indexOf(name); // -1 nếu không có (chỉ Port/Encrypt/TrustServerCert được phép thiếu)
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : row.getCell(colIndex).value);
    const str = (v) => (v != null ? String(v).trim() : '');

    const name = str(cell(col.Name));
    const server = str(cell(col.Server));
    const databaseName = str(cell(col.DatabaseName));
    const username = str(cell(col.Username));
    const password = str(cell(col.Password));
    if (!name && !server && !databaseName && !username && !password) return; // dòng trống bỏ qua, không tính là lỗi

    const missing = [];
    if (!name) missing.push('Name');
    if (!server) missing.push('Server');
    if (!databaseName) missing.push('DatabaseName');
    if (!username) missing.push('Username');
    if (!password) missing.push('Password');
    if (missing.length) { rowErrors.push(`Dòng ${rowNumber}: thiếu ${missing.join(', ')}`); return; }

    const portRaw = str(cell(col.Port));
    const port = portRaw ? Number(portRaw) : 1433;
    if (!Number.isInteger(port) || port <= 0) {
      rowErrors.push(`Dòng ${rowNumber}: "Port" phải là số nguyên dương (đang là "${portRaw}")`);
      return;
    }

    rows.push({
      name, server, port, databaseName, username, password,
      encrypt: parseBool(cell(col.Encrypt), true),
      trustServerCert: parseBool(cell(col.TrustServerCert), false)
    });
  });

  return { rows, rowErrors };
}

// Staging + MERGE — xem chú thích tương ứng ở etl/lib/dataSourcesImport.js.
async function upsertDataSources(pool, rows) {
  if (!rows.length) return { inserted: 0, updated: 0, ids: [] };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`
      IF OBJECT_ID('tempdb..#StagingDataSources') IS NOT NULL DROP TABLE #StagingDataSources;
      CREATE TABLE #StagingDataSources (
        Name              NVARCHAR(200) NOT NULL,
        Server            NVARCHAR(200) NOT NULL,
        Port              INT           NOT NULL,
        DatabaseName      NVARCHAR(100) NOT NULL,
        Username          NVARCHAR(100) NOT NULL,
        PasswordEncrypted NVARCHAR(500) NOT NULL,
        Encrypt           BIT           NOT NULL,
        TrustServerCert   BIT           NOT NULL
      );
    `);

    const table = new sql.Table('#StagingDataSources');
    table.create = false;
    table.columns.add('Name', sql.NVarChar(200), { nullable: false });
    table.columns.add('Server', sql.NVarChar(200), { nullable: false });
    table.columns.add('Port', sql.Int, { nullable: false });
    table.columns.add('DatabaseName', sql.NVarChar(100), { nullable: false });
    table.columns.add('Username', sql.NVarChar(100), { nullable: false });
    table.columns.add('PasswordEncrypted', sql.NVarChar(500), { nullable: false });
    table.columns.add('Encrypt', sql.Bit, { nullable: false });
    table.columns.add('TrustServerCert', sql.Bit, { nullable: false });
    for (const r of rows) {
      table.rows.add(r.name, r.server, r.port, r.databaseName, r.username,
        encrypt(r.password), r.encrypt ? 1 : 0, r.trustServerCert ? 1 : 0);
    }
    await new sql.Request(tx).bulk(table);

    const mergeResult = await new sql.Request(tx).query(`
      MERGE api.DataSources AS target
      USING #StagingDataSources AS src
        ON target.Name = src.Name
      WHEN MATCHED THEN
        UPDATE SET
          Server = src.Server, Port = src.Port, DatabaseName = src.DatabaseName,
          Username = src.Username, PasswordEncrypted = src.PasswordEncrypted,
          Encrypt = src.Encrypt, TrustServerCert = src.TrustServerCert, IsActive = 1
      WHEN NOT MATCHED THEN
        INSERT (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive)
        VALUES (src.Name, src.Server, src.Port, src.DatabaseName, src.Username, src.PasswordEncrypted, src.Encrypt, src.TrustServerCert, 1)
      OUTPUT $action AS Action, inserted.Id AS Id;
    `);

    await tx.commit();
    const actions = mergeResult.recordset;
    return {
      inserted: actions.filter(a => a.Action === 'INSERT').length,
      updated: actions.filter(a => a.Action === 'UPDATE').length,
      ids: actions.map(a => a.Id)
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

module.exports = { parseDataSourcesFile, upsertDataSources, REQUIRED_HEADERS };
