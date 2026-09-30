// lib/dataSourcesEncryptedExport.js — Xuất/Nhập TOÀN BỘ etl.DataSources dưới
// dạng 1 khối MÃ HOÁ (bản 8.13) — khác HẲN "Nhập hàng loạt" (.xlsx, chứa mật
// khẩu THẬT dạng chữ thường, xem lib/dataSourcesImport.js): file xuất ra ở
// đây KHÔNG mở được bằng Excel/trình soạn thảo — CHỈ chính ETL (giữ
// ETL_ENCRYPTION_KEY) giải mã + đọc lại được. Dùng khi cần sao lưu/di chuyển
// cấu hình kết nối nhiều chi nhánh mà KHÔNG muốn mật khẩu thật từng lộ ra
// dạng đọc được ở bất kỳ bước nào — mật khẩu giữ NGUYÊN dạng đã mã hoá sẵn
// trong CSDL (PasswordEncrypted), KHÔNG giải mã rồi mã hoá lại — không có
// thời điểm nào trong luồng này mật khẩu tồn tại dạng chữ thường ngoài CSDL
// gốc, kể cả tạm thời trong bộ nhớ.
//
// Định dạng file: dòng 1 là chuỗi nhận diện cố định MAGIC_HEADER (để phân
// biệt ngay với .xlsx/file khác, báo lỗi rõ ràng nếu đưa nhầm file — không
// phải để bảo mật, bảo mật đến từ AES-256-GCM ở dưới) + dòng 2 là toàn bộ
// payload JSON (danh sách nguồn) đã mã hoá bằng lib/crypto.js (CÙNG khoá
// ETL_ENCRYPTION_KEY dùng mã hoá mật khẩu — không phải khoá riêng — nên tự
// động thừa hưởng cơ chế xoay khoá ETL_ENCRYPTION_KEY_PREVIOUS đã có).
const { sql } = require('../db');
const { encrypt, decrypt } = require('./crypto');

const MAGIC_HEADER = 'HCRC-ETL-DATASOURCES-V1';

async function exportDataSourcesEncrypted(pool) {
  const result = await pool.request().query(`
    SELECT Name, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive
    FROM etl.DataSources ORDER BY Name
  `);
  const payload = { version: 1, exportedAt: new Date().toISOString(), rows: result.recordset };
  const ciphertext = encrypt(JSON.stringify(payload));
  return Buffer.from(`${MAGIC_HEADER}\n${ciphertext}`, 'utf8');
}

function decryptDataSourcesPayload(buffer) {
  const text = buffer.toString('utf8');
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1 || text.slice(0, newlineIndex) !== MAGIC_HEADER) {
    throw new Error('File không đúng định dạng xuất mã hoá của hệ thống (thiếu/sai dòng nhận diện) — chỉ nhận file do chính chức năng "Xuất file" ở trang này tạo ra');
  }
  const ciphertext = text.slice(newlineIndex + 1).trim();
  let payload;
  try {
    payload = JSON.parse(decrypt(ciphertext));
  } catch (err) {
    throw new Error('Không giải mã được file — sai khoá ETL_ENCRYPTION_KEY hiện tại (và ETL_ENCRYPTION_KEY_PREVIOUS nếu có) hoặc file bị hỏng/chỉnh sửa (AES-256-GCM tự phát hiện file bị chỉnh sửa qua authTag)');
  }
  if (!payload || payload.version !== 1 || !Array.isArray(payload.rows)) {
    throw new Error('Nội dung sau giải mã không đúng định dạng mong đợi (version/rows)');
  }
  return payload.rows;
}

// Upsert theo Name (cùng quy ước với lib/dataSourcesImport.js) — mật khẩu
// GIỮ NGUYÊN ciphertext đã có trong file xuất, KHÔNG gọi encrypt() lần nữa
// (khác lib/dataSourcesImport.js — nơi input là mật khẩu chữ thường thật sự
// cần mã hoá lần đầu). Quy mô thật (vài chục/vài trăm dòng) nên xử lý từng
// dòng tuần tự, không cần staging-table + MERGE gộp như import Excel (vốn
// tối ưu cho quy mô lớn hơn, tới 5000 dòng).
async function importDataSourcesEncrypted(pool, buffer) {
  const rows = decryptDataSourcesPayload(buffer);

  const existingResult = await pool.request().query('SELECT Id, Name FROM etl.DataSources');
  const existingIdByName = new Map(existingResult.recordset.map(s => [s.Name, s.Id]));

  let inserted = 0;
  let updated = 0;
  const ids = [];
  for (const r of rows) {
    if (!r.Name || !r.Server || !r.DatabaseName || !r.Username || !r.PasswordEncrypted) continue; // dòng hỏng bỏ qua, không chặn cả lượt
    const existingId = existingIdByName.get(r.Name);
    const request = pool.request()
      .input('name', sql.NVarChar(200), r.Name)
      .input('engine', sql.VarChar(20), r.Engine || 'mssql')
      .input('server', sql.NVarChar(200), r.Server)
      .input('port', sql.Int, r.Port || 1433)
      .input('databaseName', sql.NVarChar(100), r.DatabaseName)
      .input('username', sql.NVarChar(100), r.Username)
      .input('passwordEncrypted', sql.NVarChar(500), r.PasswordEncrypted)
      .input('encryptConn', sql.Bit, r.Encrypt === false ? 0 : 1)
      .input('trustServerCert', sql.Bit, r.TrustServerCert ? 1 : 0)
      .input('isActive', sql.Bit, r.IsActive === false ? 0 : 1);

    if (existingId) {
      await request.input('id', sql.Int, existingId).query(`
        UPDATE etl.DataSources
        SET Engine = @engine, Server = @server, Port = @port, DatabaseName = @databaseName,
            Username = @username, PasswordEncrypted = @passwordEncrypted,
            Encrypt = @encryptConn, TrustServerCert = @trustServerCert, IsActive = @isActive
        WHERE Id = @id
      `);
      updated++;
      ids.push(existingId);
    } else {
      const result = await request.query(`
        INSERT INTO etl.DataSources (Name, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert, IsActive)
        OUTPUT INSERTED.Id
        VALUES (@name, @engine, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert, @isActive)
      `);
      inserted++;
      ids.push(result.recordset[0].Id);
    }
  }
  return { inserted, updated, ids };
}

module.exports = { exportDataSourcesEncrypted, importDataSourcesEncrypted, MAGIC_HEADER };
