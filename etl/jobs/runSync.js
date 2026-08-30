// jobs/runSync.js — Vòng đời một lượt đồng bộ cho một nguồn (đọc mốc → extract
// → transform → upsert → cập nhật mốc → ghi log), và runAll() chạy tuần tự
// qua toàn bộ nguồn đã đăng ký trong sources/index.js.
//
// Chạy TUẦN TỰ (không Promise.all song song nhiều nguồn) — có chủ đích: mỗi
// nguồn là một máy chủ SQL Server khác nhau, chạy song song nhiều nguồn cùng
// lúc làm khó kiểm soát tải lên từng máy chủ nguồn và khó đọc log khi có lỗi.
// Nguồn nào lỗi chỉ dừng riêng nguồn đó — không chặn các nguồn còn lại.
const { getPool } = require('../db');
const sources = require('../sources');
const { getLastSyncedAt, setLastSyncedAt } = require('../lib/syncState');
const { logRun } = require('../lib/syncLog');
const { upsertReportFacts } = require('../lib/upsert');
const { alertSyncFailure } = require('../lib/mailer');

async function runSource(source) {
  const startedAt = new Date();
  console.log(`▶ [${source.key}] Bắt đầu đồng bộ...`);
  try {
    const srcPool = await getPool(source.envPrefix);
    const lastSyncedAt = await getLastSyncedAt(source.key);

    const rawRows = await source.extract(srcPool, lastSyncedAt);
    if (!rawRows.length) {
      console.log(`  [${source.key}] Không có dòng nào thay đổi kể từ ${lastSyncedAt.toISOString()}.`);
      await logRun({ sourceKey: source.key, status: 'SUCCESS', rowCount: 0, startedAt, finishedAt: new Date() });
      return;
    }

    const rows = rawRows.map(row => source.transform(row));
    const dwhPool = await getPool('DWH');
    const { inserted, updated } = await upsertReportFacts(dwhPool, rows);

    // Mốc đồng bộ mới = UpdatedAt lớn nhất trong lô vừa lấy — connector PHẢI
    // SELECT kèm cột UpdatedAt (xem sources/_template.js) để dòng này hoạt động.
    const maxUpdatedAt = rawRows.reduce(
      (max, r) => (r.UpdatedAt > max ? r.UpdatedAt : max),
      lastSyncedAt
    );
    await setLastSyncedAt(source.key, maxUpdatedAt);

    await logRun({ sourceKey: source.key, status: 'SUCCESS', rowCount: rows.length, startedAt, finishedAt: new Date() });
    console.log(`✅ [${source.key}] Xong — ${inserted} dòng mới, ${updated} dòng cập nhật.`);
  } catch (err) {
    console.error(`⛔ [${source.key}] Lỗi đồng bộ:`, err.message);
    // Log/gửi email không được để lỗi tiếp lan ra ngoài — một lượt chạy thất
    // bại không nên vì ghi log thất bại mà làm crash cả tiến trình ETL.
    await logRun({
      sourceKey: source.key,
      status: 'FAILED',
      errorMessage: err.message,
      startedAt,
      finishedAt: new Date()
    }).catch(() => {});
    await alertSyncFailure(source, err).catch(() => {});
  }
}

async function runAll() {
  for (const source of sources) {
    await runSource(source);
  }
}

module.exports = { runSource, runAll };
