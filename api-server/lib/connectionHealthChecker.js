// lib/connectionHealthChecker.js — Kiểm tra kết nối THẬT tới MỌI
// api.DataSources đang bật, lưu kết quả vào api.DataSourceConnectionStatus
// (bản 8.57) — mirror ĐÚNG etl/lib/connectionHealthChecker.js (cùng tính
// năng "Trạng thái kết nối", áp dụng cho cả 2 service theo yêu cầu người
// dùng), chỉ khác api.DataSources không có cột Engine (luôn mssql, xem
// lib/dataSourcePool.js). Dùng CHUNG cho job nền định kỳ (server.js, mỗi 15
// phút) VÀ nút "Kiểm tra lại ngay" (routes/admin/connectionStatus.js).
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { testConnectionsBatch } = require('./dataSourcePool');

async function checkAllConnections() {
  const pool = await getPool('ADMIN');
  const sources = (await pool.request().query(`
    SELECT Id, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM api.DataSources WHERE IsActive = 1
  `)).recordset;

  const items = sources.map(s => ({
    config: {
      server: s.Server, port: s.Port, database: s.DatabaseName,
      user: s.Username, password: decrypt(s.PasswordEncrypted),
      encrypt: !!s.Encrypt, trustServerCert: !!s.TrustServerCert
    }
  }));
  const results = await testConnectionsBatch(items);

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const r = results[i];
    await pool.request()
      .input('id', sql.Int, s.Id)
      .input('isConnected', sql.Bit, r.ok ? 1 : 0)
      .input('errorMessage', sql.NVarChar(500), r.ok ? null : String(r.error || '').slice(0, 500))
      .query(`
        MERGE api.DataSourceConnectionStatus AS target
        USING (SELECT @id AS DataSourceId) AS src ON target.DataSourceId = src.DataSourceId
        WHEN MATCHED THEN UPDATE SET IsConnected = @isConnected, ErrorMessage = @errorMessage, LastCheckedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (DataSourceId, IsConnected, ErrorMessage, LastCheckedAt)
          VALUES (@id, @isConnected, @errorMessage, SYSUTCDATETIME());
      `);
  }
}

module.exports = { checkAllConnections };
