// jobs/runSync.js — Vòng đời một lượt đồng bộ cho MỘT job (etl.SyncJobs,
// Type='table' hoặc 'custom'), và runAll() chạy tuần tự qua toàn bộ job
// đang bật. Đã thay thế cách nạp nguồn TĨNH cũ (sources/index.js đọc một
// lần lúc khởi động) bằng đọc etl.SyncJobs mỗi lượt chạy — sources/ giờ CHỈ
// còn phục vụ job Type='custom' (logic đồng bộ tuỳ biến, viết tay).
//
// Chạy TUẦN TỰ (không song song nhiều job) — có chủ đích, giữ nguyên lý do
// đã có từ bản đầu: dễ kiểm soát tải lên từng máy chủ nguồn, dễ đọc log khi
// có lỗi. Job nào lỗi chỉ dừng riêng job đó.
const { sql, getPool } = require('../db');
const { getConnection } = require('../lib/dataSourcePool');
const { extractTable, transformRow } = require('../lib/tableSyncEngine');
const { upsertReportFacts } = require('../lib/upsert');
const { alertSyncFailure } = require('../lib/mailer');
const sourcesRegistry = require('../sources');

const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function loadJob(jobId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, jobId).query('SELECT * FROM etl.SyncJobs WHERE Id = @id');
  return result.recordset[0] || null;
}

async function getLastSyncedAt(jobId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, jobId)
    .query('SELECT LastSyncedAt FROM etl.SyncState WHERE SyncJobId = @id');
  return result.recordset[0]?.LastSyncedAt || EPOCH;
}

async function setLastSyncedAt(jobId, timestamp) {
  const pool = await getPool('ADMIN');
  await pool.request()
    .input('id', sql.Int, jobId)
    .input('ts', sql.DateTime2, timestamp)
    .query(`
      MERGE etl.SyncState AS target
      USING (SELECT @id AS SyncJobId) AS src ON target.SyncJobId = src.SyncJobId
      WHEN MATCHED THEN UPDATE SET LastSyncedAt = @ts
      WHEN NOT MATCHED THEN INSERT (SyncJobId, LastSyncedAt) VALUES (@id, @ts);
    `);
}

async function logRun({ jobId, status, rowCount = 0, errorMessage = null, startedAt, finishedAt }) {
  const pool = await getPool('ADMIN');
  await pool.request()
    .input('jobId', sql.Int, jobId)
    .input('status', sql.VarChar(20), status)
    .input('rowCount', sql.Int, rowCount)
    .input('errorMessage', sql.NVarChar(sql.MAX), errorMessage)
    .input('startedAt', sql.DateTime2, startedAt)
    .input('finishedAt', sql.DateTime2, finishedAt)
    .query(`
      INSERT INTO etl.SyncLog (SyncJobId, Status, RowCount, ErrorMessage, StartedAt, FinishedAt)
      VALUES (@jobId, @status, @rowCount, @errorMessage, @startedAt, @finishedAt)
    `);
}

async function runTableJob(job, lastSyncedAt) {
  const connection = await getConnection(job.DataSourceId);
  const { rows, ...meta } = await extractTable(connection, job, lastSyncedAt);
  const transformed = rows.map(r => transformRow(job, meta, r));
  const maxUpdatedAt = rows.reduce((max, r) => {
    const v = r[`m_${meta.updatedCol}`];
    return v > max ? v : max;
  }, lastSyncedAt);
  return { transformed, maxUpdatedAt, rawCount: rows.length };
}

async function runCustomJob(job, lastSyncedAt) {
  const connector = sourcesRegistry.find(s => s.key === job.CustomConnectorKey);
  if (!connector) throw new Error(`Không tìm thấy connector "${job.CustomConnectorKey}" trong etl/sources/`);
  const srcPool = await getPool(connector.envPrefix);
  const rawRows = await connector.extract(srcPool, lastSyncedAt);
  const transformed = rawRows.map(row => connector.transform(row));
  const maxUpdatedAt = rawRows.reduce((max, r) => (r.UpdatedAt > max ? r.UpdatedAt : max), lastSyncedAt);
  return { transformed, maxUpdatedAt, rawCount: rawRows.length };
}

async function runJobObject(job) {
  const startedAt = new Date();
  console.log(`▶ [${job.Name}] Bắt đầu đồng bộ...`);
  try {
    const lastSyncedAt = await getLastSyncedAt(job.Id);
    const { transformed, maxUpdatedAt, rawCount } = job.Type === 'table'
      ? await runTableJob(job, lastSyncedAt)
      : await runCustomJob(job, lastSyncedAt);

    if (!rawCount) {
      console.log(`  [${job.Name}] Không có dòng nào thay đổi kể từ ${lastSyncedAt.toISOString()}.`);
      await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: 0, startedAt, finishedAt: new Date() });
      return;
    }

    const dwhPool = await getPool('DWH');
    const { inserted, updated } = await upsertReportFacts(dwhPool, transformed, { keepHistory: !!job.KeepHistory });
    await setLastSyncedAt(job.Id, maxUpdatedAt);
    await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: transformed.length, startedAt, finishedAt: new Date() });
    console.log(`✅ [${job.Name}] Xong — ${inserted} dòng mới, ${updated} dòng cập nhật.`);
  } catch (err) {
    console.error(`⛔ [${job.Name}] Lỗi đồng bộ:`, err.message);
    await logRun({
      jobId: job.Id,
      status: 'FAILED',
      errorMessage: err.message,
      startedAt,
      finishedAt: new Date()
    }).catch(() => {});
    await alertSyncFailure({ key: job.Name, label: job.Name }, err).catch(() => {});
  }
}

async function runJob(jobId) {
  const job = await loadJob(jobId);
  if (!job) throw new Error(`Không tìm thấy job #${jobId}`);
  return runJobObject(job);
}

async function runAll() {
  const pool = await getPool('ADMIN');
  const result = await pool.request().query('SELECT * FROM etl.SyncJobs WHERE IsActive = 1 ORDER BY Name');
  for (const job of result.recordset) {
    await runJobObject(job);
  }
}

module.exports = { runJob, runJobObject, runAll };
