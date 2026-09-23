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
const { logInfo, logWarn, logError } = require('../lib/systemLog');
const sourcesRegistry = require('../sources');

const EPOCH = new Date('1970-01-01T00:00:00.000Z');
const WATERMARK_SAFETY_LAG_MS = 5000;

// "Watermark tie": lần chạy SAU lọc "WHERE UpdatedAt > watermark" — nếu 2
// dòng nguồn commit gần như đồng thời cùng 1 mốc UpdatedAt (độ phân giải
// thô, hoặc giao dịch B bắt đầu trước giao dịch A nhưng commit SAU khi câu
// SELECT của lượt chạy hiện tại đã đọc xong), dòng B có thể mang ĐÚNG mốc
// thời gian đã bị dùng làm watermark mới nhưng KHÔNG nằm trong lô đã lấy —
// lần chạy kế tiếp dùng "> watermark" sẽ bỏ lỡ VĨNH VIỄN dòng đó, không có
// overlap window nào bù trừ. Không đẩy watermark vượt quá "hiện tại trừ 1
// khoảng an toàn" — mọi giao dịch trong khoảng đó có đủ thời gian commit
// trước khi bị coi là "đã đồng bộ". Lần chạy sau tự quét lại đúng khoảng
// đệm đó — vô hại vì MERGE (lib/upsert.js) là upsert idempotent, chỉ tốn
// thêm chút thời gian truy vấn.
function applyWatermarkSafetyLag(rawMaxUpdatedAt) {
  const ceiling = new Date(Date.now() - WATERMARK_SAFETY_LAG_MS);
  return rawMaxUpdatedAt > ceiling ? ceiling : rawMaxUpdatedAt;
}

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
      INSERT INTO etl.SyncLog (SyncJobId, Status, RowsProcessed, ErrorMessage, StartedAt, FinishedAt)
      VALUES (@jobId, @status, @rowCount, @errorMessage, @startedAt, @finishedAt)
    `);
}

// Nạp TOÀN BỘ ánh xạ (etl.BranchCodeMap) cho ĐÚNG 1 loaiMaKhac vào bộ nhớ
// MỘT LẦN trước vòng lặp dòng — số dòng thực tế nhỏ (vài chục/vài trăm chi
// nhánh), tránh truy vấn DB LẶP LẠI theo từng dòng nguồn (có thể hàng nghìn
// dòng/lượt chạy). TrangThai='DaDong' bị loại — dòng ánh xạ ngừng áp dụng
// coi như KHÔNG có, entityCode gốc giữ nguyên (rơi vào nhánh unmappedCodes).
// Map<MaKhac, {maChuan, tenSieuThi}> — TenSieuThi (tuỳ chọn, admin gõ tay
// lúc nhập "Ánh xạ mã chi nhánh") giờ ĐƯỢC dùng thật (không chỉ hiển thị
// trong etl-admin): xem transformRow() bên dưới ghi vào
// dimensions.tenSieuThi — rp-server (compositeReportRunner.js) đọc lại field
// này để hiện TÊN thay vì MÃ ở cột "Siêu thị/Cửa hàng". Job nào MUỐN có tên
// hiển thị cần: (1) bật BranchCodeMapType cho đúng job đó (kể cả khi mã
// nguồn KHÔNG cần đổi — có thể khai dòng ánh xạ MaKhac=MaChuan=mã gốc, chỉ
// để gắn TenSieuThi), (2) nhập đủ cột TenSieuThi trong "Ánh xạ mã chi
// nhánh". Job chưa cấu hình vẫn chạy bình thường, chỉ không có tên (báo cáo
// tự rơi về hiện mã, xem formula cột "tenCuaHang" trong seedLdtdHcrcReports.js).
async function loadBranchCodeMap(loaiMaKhac) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('loaiMaKhac', sql.VarChar(50), loaiMaKhac).query(`
    SELECT MaKhac, MaChuan, TenSieuThi FROM etl.BranchCodeMap
    WHERE LoaiMaKhac = @loaiMaKhac AND (TrangThai IS NULL OR TrangThai <> 'DaDong')
  `);
  const map = new Map();
  for (const r of result.recordset) {
    map.set(String(r.MaKhac).trim(), {
      maChuan: String(r.MaChuan).trim(),
      tenSieuThi: r.TenSieuThi ? String(r.TenSieuThi).trim() : null
    });
  }
  return map;
}

async function runTableJob(job, lastSyncedAt) {
  const connection = await getConnection(job.DataSourceId);
  const { rows, ...meta } = await extractTable(connection, job, lastSyncedAt);
  const branchCodeMap = job.BranchCodeMapType ? await loadBranchCodeMap(job.BranchCodeMapType) : null;
  const unmappedCodes = branchCodeMap ? new Set() : null;
  const transformed = rows.map(r => transformRow(job, meta, r, branchCodeMap, unmappedCodes));
  if (unmappedCodes && unmappedCodes.size) {
    logWarn(`⚠️  [${job.Name}] ${unmappedCodes.size} mã "${job.BranchCodeMapType}" chưa có trong "Ánh xạ mã chi nhánh", giữ nguyên mã gốc: ${[...unmappedCodes].join(', ')}`);
  }
  const rawMaxUpdatedAt = rows.reduce((max, r) => {
    const v = r[`m_${meta.updatedCol}`];
    return v > max ? v : max;
  }, lastSyncedAt);
  return { transformed, maxUpdatedAt: applyWatermarkSafetyLag(rawMaxUpdatedAt), rawCount: rows.length };
}

async function runCustomJob(job, lastSyncedAt) {
  const connector = sourcesRegistry.find(s => s.key === job.CustomConnectorKey);
  if (!connector) throw new Error(`Không tìm thấy connector "${job.CustomConnectorKey}" trong etl/sources/`);
  const srcPool = await getPool(connector.envPrefix);
  const rawRows = await connector.extract(srcPool, lastSyncedAt);
  const transformed = rawRows.map(row => connector.transform(row));
  const rawMaxUpdatedAt = rawRows.reduce((max, r) => (r.UpdatedAt > max ? r.UpdatedAt : max), lastSyncedAt);
  return { transformed, maxUpdatedAt: applyWatermarkSafetyLag(rawMaxUpdatedAt), rawCount: rawRows.length };
}

// Khoá tính theo KHOÁ NGHIỆP VỤ (SourceSystem + TargetDomain), KHÔNG theo
// job.Id — 2 job KHÁC NHAU (vd job backfill + job hàng ngày, hoặc lỡ tạo 2
// job trùng cấu hình) trỏ CÙNG SourceSystem+Domain vẫn có thể ghi đè cùng
// khoá UNIQUE (SourceSystem,Domain,EntityCode,EventDate) trong
// dwh.ReportFacts nếu chạy chồng nhau — sp_getapplock theo job.Id trước đây
// coi 2 job là 2 resource riêng, không chặn được race này (MERGE không có
// HOLDLOCK, 2 transaction cùng đánh giá WHEN NOT MATCHED cho cùng khoá
// UNIQUE trước khi bên kia commit -> 1 bên lỗi vi phạm UNIQUE KEY, hoặc
// deadlock giữa DELETE dọn lịch sử của job này và MERGE của job kia). ds =
// job.DataSourceId (job Type='table') hoặc CustomConnectorKey (Type='custom')
// — PHẢI khớp đúng cách etl/lib/tableSyncEngine.js:transformRow() và
// etl/sources/*.js tự gán SourceSystem cho từng dòng.
function effectiveSourceSystem(job) {
  return job.Type === 'table' ? `ds${job.DataSourceId}` : job.CustomConnectorKey;
}

// Khoá chồng lấn CẤP CSDL (sp_getapplock) — khác runningJobs Set trong
// jobs/scheduler.js (chỉ chặn được chồng lấn TRONG CÙNG 1 tiến trình
// node), khoá này chặn được cả khi etl/index.js (entrypoint chạy tay riêng
// biệt, KHÔNG dùng chung tiến trình với server.js) chạy đúng job đang được
// server.js tự động chạy theo lịch, hoặc 2 lượt "node index.js" chạy tay
// chồng nhau — mọi tiến trình đều nối cùng 1 CSDL etl.SyncJobs (pool
// 'ADMIN'), sp_getapplock là khoá phối hợp qua CSDL, không phụ thuộc bộ nhớ
// tiến trình. LockTimeout=0 -> không chờ, job đang chạy dở thì bỏ qua ngay
// lập tức (giống hành vi runningJobs Set), không xếp hàng chờ.
async function runWithCrossProcessLock(job, fn) {
  const pool = await getPool('ADMIN');
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const request = new sql.Request(transaction);
  const result = await request
    .input('resource', sql.NVarChar(255), `etl_domain_${effectiveSourceSystem(job)}_${job.TargetDomain}`)
    .query(`
      DECLARE @res INT;
      EXEC @res = sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 0;
      SELECT @res AS LockResult;
    `);
  const lockResult = result.recordset[0].LockResult;
  if (lockResult < 0) {
    logWarn(`⏭  [${job.Name}] bỏ qua lượt chạy này — 1 tiến trình khác đang ghi CÙNG nguồn+domain "${effectiveSourceSystem(job)}/${job.TargetDomain}" (chính job này chạy ở tiến trình khác, HOẶC 1 job KHÁC trỏ cùng nguồn+domain — server.js theo lịch, nút "Chạy thử", hoặc etl/index.js chạy tay)`);
    await transaction.rollback();
    return;
  }
  try {
    await fn();
  } finally {
    await transaction.commit(); // giải phóng khoá sp_getapplock giữ bởi transaction này
  }
}

async function runJobObject(job) {
  return runWithCrossProcessLock(job, () => runJobObjectLocked(job));
}

// err.message RỖNG là có thật, không phải lỗi hiển thị/log cắt bớt — gặp
// thực tế khi driver mssql/tedious ném AggregateError (Node tự gộp nhiều
// lượt thử kết nối IPv4/IPv6 "Happy Eyeballs" khi TCP chập chờn):
// AggregateError.message MẶC ĐỊNH LÀ CHUỖI RỖNG nếu không truyền tham số
// message thứ 2 lúc tạo — lý do thật nằm trong mảng .errors[], không phải
// .message. Không xử lý riêng thì console.error/etl.SyncLog.ErrorMessage
// đều ghi rỗng, không ai đọc lại được lý do thật.
//
// GẶP THẬT THÊM: lỗi driver mssql/tedious (vd RequestError) nhiều khi
// .message CHỈ là nhãn chung chung, lý do THẬT nằm ở .precedingErrors[]
// (nhiều lỗi con cùng 1 batch SQL) hoặc .originalError (lỗi gốc bên dưới,
// vd lỗi hệ điều hành/socket) — đúng những trường xem được qua pm2 log khi
// Node in cả object lỗi, nhưng trước đây describeSyncError() không đọc tới
// nên trang "Log"/etl.SyncLog.ErrorMessage chỉ hiện gọn "RequestError
// (EREQUEST)" — không đủ để chẩn đoán mà không cần SSH xem pm2 log riêng.
// Luôn CỐ GẮNG bổ sung thêm phần "chi tiết" từ các trường này (nếu có và
// chưa trùng lặp với thông điệp chính) để trang "Nhật ký hệ thống" tự đủ
// thông tin, không cần đối chiếu ngược pm2 log nữa.
function describeSyncError(err) {
  if (!err) return String(err);
  let primary;
  if (err.message) {
    primary = err.message;
  } else if (Array.isArray(err.errors) && err.errors.length) {
    primary = err.errors.map(e => (e && e.message) || String(e)).join('; ');
  } else if (Array.isArray(err.precedingErrors) && err.precedingErrors.length) {
    primary = err.precedingErrors.map(e => (e && e.message) || String(e)).join('; ');
  } else if (err.code) {
    primary = `${err.name || 'Error'} (${err.code})`;
  } else {
    primary = String(err);
  }

  const extra = [];
  const addExtra = (m) => { if (m && !primary.includes(m) && !extra.includes(m)) extra.push(m); };
  if (err.originalError && err.originalError.message) addExtra(err.originalError.message);
  if (Array.isArray(err.precedingErrors)) {
    for (const e of err.precedingErrors) addExtra(e && e.message);
  }
  if (err.code && !primary.includes(err.code)) extra.push(`mã lỗi: ${err.code}`);

  return extra.length ? `${primary} — chi tiết: ${extra.join('; ')}` : primary;
}

async function runJobObjectLocked(job) {
  const startedAt = new Date();
  logInfo(`▶ [${job.Name}] Bắt đầu đồng bộ...`);
  try {
    const lastSyncedAt = await getLastSyncedAt(job.Id);
    const { transformed, maxUpdatedAt, rawCount } = job.Type === 'table'
      ? await runTableJob(job, lastSyncedAt)
      : await runCustomJob(job, lastSyncedAt);

    if (!rawCount) {
      logInfo(`  [${job.Name}] Không có dòng nào thay đổi kể từ ${lastSyncedAt.toISOString()}.`);
      await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: 0, startedAt, finishedAt: new Date() });
      return;
    }

    const dwhPool = await getPool('DWH');
    const { inserted, updated } = await upsertReportFacts(dwhPool, transformed, { keepHistory: !!job.KeepHistory });
    await setLastSyncedAt(job.Id, maxUpdatedAt);
    await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: transformed.length, startedAt, finishedAt: new Date() });
    logInfo(`✅ [${job.Name}] Xong — ${inserted} dòng mới, ${updated} dòng cập nhật.`);
  } catch (err) {
    const message = describeSyncError(err);
    logError(`⛔ [${job.Name}] Lỗi đồng bộ: ${message}`);
    await logRun({
      jobId: job.Id,
      status: 'FAILED',
      errorMessage: message,
      startedAt,
      finishedAt: new Date()
    }).catch(() => {});
    await alertSyncFailure({ key: job.Name, label: job.Name }, message).catch(() => {});
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
