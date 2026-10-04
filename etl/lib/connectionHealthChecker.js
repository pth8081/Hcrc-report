// lib/connectionHealthChecker.js — Kiểm tra kết nối THẬT tới MỌI
// etl.DataSources đang bật, lưu kết quả vào etl.DataSourceConnectionStatus
// (bản 8.57) — dùng CHUNG cho job nền định kỳ (etl/server.js, mỗi 15 phút)
// VÀ nút "Kiểm tra lại ngay" (routes/admin/connectionStatus.js), code chỉ
// viết 1 nơi, cả 2 đường gọi khớp tuyệt đối với nhau. Dùng lại NGUYÊN
// testConnectionsBatch() đã có (song song có giới hạn 5 — xem
// lib/dataSourcePool.js), không mở thêm cơ chế kết nối riêng.
const { sql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { testConnectionsBatch } = require('./dataSourcePool');

async function checkAllConnections() {
  const pool = await getPool('ADMIN');
  const sources = (await pool.request().query(`
    SELECT Id, Engine, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM etl.DataSources WHERE IsActive = 1
  `)).recordset;

  const items = sources.map(s => ({
    config: {
      engine: s.Engine, server: s.Server, port: s.Port, database: s.DatabaseName,
      user: s.Username, password: decrypt(s.PasswordEncrypted),
      encrypt: !!s.Encrypt, trustServerCert: !!s.TrustServerCert
    }
  }));
  // testConnectionsBatch() giữ ĐÚNG thứ tự items -> ghép lại theo chỉ số với
  // sources, không cần item.name (chỉ dùng cho nhãn hiển thị log lúc nhập
  // hàng loạt, không cần ở đây).
  const results = await testConnectionsBatch(items);

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const r = results[i];
    await pool.request()
      .input('id', sql.Int, s.Id)
      .input('isConnected', sql.Bit, r.ok ? 1 : 0)
      .input('errorMessage', sql.NVarChar(500), r.ok ? null : String(r.error || '').slice(0, 500))
      .query(`
        MERGE etl.DataSourceConnectionStatus AS target
        USING (SELECT @id AS DataSourceId) AS src ON target.DataSourceId = src.DataSourceId
        WHEN MATCHED THEN UPDATE SET IsConnected = @isConnected, ErrorMessage = @errorMessage, LastCheckedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (DataSourceId, IsConnected, ErrorMessage, LastCheckedAt)
          VALUES (@id, @isConnected, @errorMessage, SYSUTCDATETIME());
      `);
  }
}

module.exports = { checkAllConnections };
