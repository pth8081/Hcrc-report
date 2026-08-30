// lib/syncLog.js — Ghi nhật ký từng lượt chạy ETL vào dwh.SyncLog, dùng để tra
// soát khi có sự cố và làm căn cứ gửi cảnh báo (xem lib/mailer.js). Lỗi khi ghi
// log KHÔNG được để làm crash tiến trình ETL — nơi gọi (jobs/runSync.js) tự bọc
// .catch() cho hàm này.
const { getPool, sql } = require('../db');

async function logRun({ sourceKey, status, rowCount = 0, errorMessage = null, startedAt, finishedAt }) {
  const pool = await getPool('DWH');
  await pool.request()
    .input('source', sql.VarChar(50), sourceKey)
    .input('status', sql.VarChar(20), status)
    .input('rowCount', sql.Int, rowCount)
    .input('errorMessage', sql.NVarChar(sql.MAX), errorMessage)
    .input('startedAt', sql.DateTime2, startedAt)
    .input('finishedAt', sql.DateTime2, finishedAt)
    .query(`
      INSERT INTO dwh.SyncLog (SourceSystem, Status, RowCount, ErrorMessage, StartedAt, FinishedAt)
      VALUES (@source, @status, @rowCount, @errorMessage, @startedAt, @finishedAt);
    `);
}

module.exports = { logRun };
