// lib/syncState.js — Đọc/ghi mốc đồng bộ (watermark) của từng nguồn trong
// dwh.SyncState. ETL đọc mốc này trước khi extract (chỉ lấy dòng có UpdatedAt
// mới hơn), và ghi lại mốc mới NGAY SAU KHI upsert vào kho thành công.
const { getPool, sql } = require('../db');

const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function getLastSyncedAt(sourceKey) {
  const pool = await getPool('DWH');
  const result = await pool.request()
    .input('source', sql.VarChar(50), sourceKey)
    .query('SELECT LastSyncedAt FROM dwh.SyncState WHERE SourceSystem = @source');
  return result.recordset[0]?.LastSyncedAt || EPOCH;
}

async function setLastSyncedAt(sourceKey, timestamp) {
  const pool = await getPool('DWH');
  await pool.request()
    .input('source', sql.VarChar(50), sourceKey)
    .input('ts', sql.DateTime2, timestamp)
    .query(`
      MERGE dwh.SyncState AS target
      USING (SELECT @source AS SourceSystem) AS src
        ON target.SourceSystem = src.SourceSystem
      WHEN MATCHED THEN
        UPDATE SET LastSyncedAt = @ts
      WHEN NOT MATCHED THEN
        INSERT (SourceSystem, LastSyncedAt) VALUES (@source, @ts);
    `);
}

module.exports = { getLastSyncedAt, setLastSyncedAt };
