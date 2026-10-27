// lib/logSpaceMonitor.js — "Giám sát Log CSDL" (bản 10.5, theo yêu cầu
// người dùng, sau sự cố thật HCRC_DWH: transaction log phình to tới ~329GB
// — CSDL ở chế độ FULL recovery không có job sao lưu log — chiếm gần hết
// dung lượng ổ đĩa, làm MỌI job ETL ghi dwh.ReportFacts đồng loạt lỗi, mà
// KHÔNG AI BIẾT tới khi admin tình cờ phát hiện). Kiểm tra ĐỊNH KỲ dung
// lượng transaction log của:
//   1. CSDL LÕI hệ thống tự vận hành — DWH (HCRC_DWH) + ADMIN (HCRC_ETL)
//      LUÔN kiểm tra (đã có sẵn thông tin kết nối trong .env của etl, không
//      cần cấu hình thêm gì). RP (HCRC_RP)/API (HCRC_API) TUỲ CHỌN — CHỈ
//      kiểm tra nếu admin khai thêm RP_*/API_* trong .env (xem
//      .env.example) — để trống (mặc định) = bỏ qua hẳn, KHÔNG báo lỗi
//      (khác với "kiểm tra mà lỗi kết nối" — 2 trường hợp khác nhau).
//   2. MỌI etl.DataSources đang bật, CHỈ Engine='mssql' (nguồn MySQL không
//      có khái niệm transaction log kiểu SQL Server — bỏ qua hẳn, không
//      đánh dấu lỗi) — dùng lại thông tin kết nối đã lưu, không cấu hình
//      riêng.
// Dùng sys.dm_db_log_space_usage() — chỉ cần quyền VIEW DATABASE STATE
// trên ĐÚNG CSDL đó (không cần sysadmin/VIEW SERVER STATE toàn instance) —
// nguồn nào không đủ quyền/không kết nối được thì đánh dấu lỗi RÕ RÀNG cho
// đúng dòng đó, KHÔNG làm hỏng cả lượt kiểm tra (các nguồn khác vẫn chạy
// bình thường, giống nguyên tắc testConnectionsBatch() ở
// lib/dataSourcePool.js).
//
// VƯỢT NGƯỠNG (LOG_SPACE_ALERT_SIZE_MB VÀ/HOẶC LOG_SPACE_ALERT_PERCENT
// trong .env) -> gửi email cảnh báo, DÙNG LẠI kênh SMTP_HOST/ALERT_EMAIL_TO
// đã có sẵn (xem lib/mailer.js:alertLogSpaceHigh) — KHÔNG thêm cấu hình SMTP
// riêng. Chống gửi lặp lại MỖI 15 PHÚT khi vẫn còn vượt ngưỡng bằng
// LastAlertedAt + LOG_SPACE_ALERT_COOLDOWN_MINUTES (mặc định 360 = 6 tiếng)
// — còn vượt ngưỡng NHƯNG đã gửi email trong khung đó thì bỏ qua, không gửi
// lại; hết vượt ngưỡng rồi vượt lại (vd qua đêm) sẽ gửi email MỚI ngay (xem
// logic "dueForAlert" bên dưới — không reset LastAlertedAt khi hết vượt
// ngưỡng, chỉ reset ngầm vì lần kiểm tra kế tiếp isOver=false không cập
// nhật thêm cooldown mới).
const sql = require('mssql');
const { sql: adminSql, getPool } = require('../db');
const { decrypt } = require('./crypto');
const { alertLogSpaceHigh } = require('./mailer');

const DEFAULT_ALERT_SIZE_MB = 20000; // 20GB
const DEFAULT_ALERT_PERCENT = 90;
const DEFAULT_COOLDOWN_MINUTES = 360;

function alertSizeMb() {
  return parseInt(process.env.LOG_SPACE_ALERT_SIZE_MB || DEFAULT_ALERT_SIZE_MB, 10);
}
function alertPercent() {
  return parseInt(process.env.LOG_SPACE_ALERT_PERCENT || DEFAULT_ALERT_PERCENT, 10);
}
function cooldownMinutes() {
  return parseInt(process.env.LOG_SPACE_ALERT_COOLDOWN_MINUTES || DEFAULT_COOLDOWN_MINUTES, 10);
}

// RP/API TUỲ CHỌN (xem chú thích đầu file) — danh sách CỐ ĐỊNH, không đọc
// từ CSDL, vì đây là CSDL LÕI khai cứng trong code (giống db.js:getPool()
// dùng prefix), không phải "Nguồn dữ liệu" admin tự khai qua giao diện.
const CORE_CONNECTIONS = [
  { key: 'core:DWH', prefix: 'DWH', label: 'HCRC_DWH (Data Warehouse)' },
  { key: 'core:ADMIN', prefix: 'ADMIN', label: 'HCRC_ETL (Quản trị ETL)' },
  { key: 'core:RP', prefix: 'RP', label: 'HCRC_RP (Report Server)' },
  { key: 'core:API', prefix: 'API', label: 'HCRC_API (API Server)' }
];

const LOG_SPACE_QUERY = `
  SELECT
    CAST(total_log_size_in_bytes / 1024.0 / 1024 AS DECIMAL(18,1)) AS TotalLogSizeMB,
    CAST(used_log_space_in_percent AS DECIMAL(5,1)) AS UsedLogPercent
  FROM sys.dm_db_log_space_usage();
`;

// SỬA LỖI THẬT bản 10.16 (báo cáo người dùng — "Trạng thái kết nối" đồng
// loạt báo lỗi "Parameters supplied for object 'sys.dm_db_log_space_usage'
// which is not a function", KỂ CẢ 2 CSDL LÕI của chính hệ thống HCRC_DWH/
// HCRC_ETL — không riêng gì vài máy chủ chi nhánh DSMART16, nên KHÔNG PHẢI
// lỗi của 1 vài nguồn cụ thể). Nguyên nhân: `sys.dm_db_log_space_usage()`
// CHỈ hoạt động đúng khi CSDL có COMPATIBILITY LEVEL >= 130 (SQL Server
// 2016) — đã xác nhận với người dùng: engine SQL Server THẬT đang dùng là
// bản 2019 (ĐỦ MỚI, không phải lỗi do bản engine cũ như suy đoán ban đầu),
// nhưng compatibility level là cấu hình RIÊNG theo TỪNG CSDL, không tự
// nâng theo bản engine — rất hay gặp khi CSDL được restore/migrate từ hệ
// thống cũ sang máy chủ mới mà không đổi lại mức này. CSDL nào vẫn giữ
// compatibility level CŨ (< 130) thì object này không được nhận diện
// đúng là hàm dù engine thật sự hỗ trợ — khớp đúng lý do lỗi xảy ra ĐỒNG
// LOẠT ở MỌI kết nối bất kể lõi hay chi nhánh (khả năng cao TOÀN BỘ các
// CSDL đó đều đang giữ compatibility level cũ).
//
// Khắc phục: thử DMF hiện đại TRƯỚC (giữ nguyên lợi ích chỉ cần quyền VIEW
// DATABASE STATE cho CSDL nào ĐÃ nâng compatibility level, không cần đổi
// gì) — lỗi đúng dấu hiệu "không hỗ trợ" thì TỰ ĐỘNG CHUYỂN sang `DBCC
// SQLPERF(LOGSPACE)` (lệnh LEGACY, hoạt động trên MỌI phiên bản/
// compatibility level SQL Server, không bị giới hạn này) — trả về TOÀN
// BỘ CSDL trên server đó nên phải tự lọc đúng tên CSDL đang kiểm tra ở
// tầng JS. Đánh đổi: `DBCC SQLPERF` thường cần quyền VIEW SERVER STATE
// (cấp instance, RỘNG hơn VIEW DATABASE STATE mà DMF cần) — máy chủ nào
// vẫn lỗi SAU KHI đã thử cả 2 cách thường là do THIẾU quyền này, lỗi trả
// về lúc đó sẽ rõ ràng (không còn là câu lỗi khó hiểu "not a function"
// nữa), admin tự biết cần cấp thêm quyền gì cho đúng nguồn đó.
function isLogSpaceDmfUnsupportedError(err) {
  const msg = String((err && err.message) || '');
  return /is not a function/i.test(msg) || /Invalid object name 'sys\.dm_db_log_space_usage'/i.test(msg);
}

async function runLogSpaceQueryLegacyFallback(pool, databaseName) {
  const result = await pool.request().query('SET NOCOUNT ON; DBCC SQLPERF(LOGSPACE) WITH NO_INFOMSGS;');
  const row = (result.recordset || []).find((r) => r['Database Name'] === databaseName);
  if (!row) {
    throw new Error(`DBCC SQLPERF(LOGSPACE) không trả về dòng nào cho CSDL "${databaseName}" (kiểm tra lại tên CSDL hoặc quyền VIEW SERVER STATE).`);
  }
  return { totalLogSizeMb: Number(row['Log Size (MB)']), usedLogPercent: Number(row['Log Space Used (%)']) };
}

async function runLogSpaceQuery(poolConfig) {
  const pool = new sql.ConnectionPool(poolConfig);
  try {
    await pool.connect();
    try {
      const result = await pool.request().query(LOG_SPACE_QUERY);
      const row = result.recordset[0] || {};
      return { ok: true, totalLogSizeMb: row.TotalLogSizeMB, usedLogPercent: row.UsedLogPercent };
    } catch (dmfErr) {
      if (!isLogSpaceDmfUnsupportedError(dmfErr)) throw dmfErr;
      const legacy = await runLogSpaceQueryLegacyFallback(pool, poolConfig.database);
      return { ok: true, totalLogSizeMb: legacy.totalLogSizeMb, usedLogPercent: legacy.usedLogPercent };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await pool.close().catch(() => {});
  }
}

// Trả null nếu CHƯA cấu hình (prefix RP/API để trống) — phân biệt RÕ với
// "đã cấu hình nhưng lỗi kết nối" (object {ok:false,...}), để checkAllLogSpace()
// bỏ qua hẳn thay vì ghi 1 dòng "lỗi" gây hiểu nhầm.
async function checkCoreConnection(prefix) {
  const server = process.env[`${prefix}_SERVER`];
  const database = process.env[`${prefix}_DATABASE`];
  if (!server || !database) return null;
  return runLogSpaceQuery({
    server,
    port: parseInt(process.env[`${prefix}_PORT`] || '1433', 10),
    database,
    user: process.env[`${prefix}_USER`],
    password: process.env[`${prefix}_PASSWORD`],
    options: {
      encrypt: process.env[`${prefix}_ENCRYPT`] !== 'false',
      trustServerCertificate: process.env[`${prefix}_TRUST_CERT`] === 'true',
      enableArithAbort: true
    },
    connectionTimeout: 10000,
    requestTimeout: 15000
  });
}

async function checkDataSource(ds) {
  return runLogSpaceQuery({
    server: ds.Server,
    port: ds.Port,
    database: ds.DatabaseName,
    user: ds.Username,
    password: decrypt(ds.PasswordEncrypted),
    options: {
      encrypt: !!ds.Encrypt,
      trustServerCertificate: !!ds.TrustServerCert,
      enableArithAbort: true
    },
    connectionTimeout: 10000,
    requestTimeout: 15000
  });
}

async function checkAllLogSpace() {
  const adminPool = await getPool('ADMIN');

  // 1. CSDL lõi — tuần tự đủ nhanh (tối đa 4 kết nối), không cần song song.
  const coreItems = [];
  for (const c of CORE_CONNECTIONS) {
    const result = await checkCoreConnection(c.prefix);
    if (result === null) continue; // chưa cấu hình (RP/API tuỳ chọn) -> bỏ qua hẳn
    coreItems.push({ key: c.key, label: c.label, result });
  }

  // 2. etl.DataSources — CHỈ Engine='mssql', song song có giới hạn (giống
  // testConnectionsBatch() ở lib/dataSourcePool.js, tránh mở quá nhiều kết
  // nối cùng lúc nếu có hàng chục nguồn).
  const sources = (await adminPool.request().query(`
    SELECT Id, Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert
    FROM etl.DataSources WHERE IsActive = 1 AND Engine = 'mssql'
  `)).recordset;

  const dsResults = new Array(sources.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= sources.length) return;
      dsResults[i] = await checkDataSource(sources[i]);
    }
  }
  const concurrency = Math.min(5, sources.length);
  await Promise.all(Array.from({ length: concurrency }, worker));

  const dsItems = sources.map((s, i) => ({ key: `ds:${s.Id}`, label: s.Name, result: dsResults[i] }));
  const allItems = [...coreItems, ...dsItems];

  // 3. Đọc LastAlertedAt hiện có 1 LẦN DUY NHẤT (thay vì mỗi item 1 SELECT
  // riêng) — đủ dùng cho mọi item bên dưới.
  const existingRows = (await adminPool.request()
    .query('SELECT ConnectionKey, LastAlertedAt FROM etl.LogSpaceStatus')).recordset;
  const lastAlertedMap = new Map(existingRows.map(r => [r.ConnectionKey, r.LastAlertedAt]));

  const sizeThreshold = alertSizeMb();
  const percentThreshold = alertPercent();
  const cooldownMs = cooldownMinutes() * 60000;
  const overThreshold = [];

  for (const item of allItems) {
    const { key, label, result } = item;
    const isOk = result.ok;
    const totalLogSizeMb = isOk ? result.totalLogSizeMb : null;
    const usedLogPercent = isOk ? result.usedLogPercent : null;
    const isOver = isOk && (totalLogSizeMb > sizeThreshold || usedLogPercent > percentThreshold);

    let lastAlertedAt = lastAlertedMap.get(key) || null;
    if (isOver) {
      const dueForAlert = !lastAlertedAt || (Date.now() - new Date(lastAlertedAt).getTime() > cooldownMs);
      if (dueForAlert) {
        overThreshold.push({ label, totalLogSizeMb, usedLogPercent });
        lastAlertedAt = new Date();
      }
    }

    await adminPool.request()
      .input('key', adminSql.NVarChar(100), key)
      .input('label', adminSql.NVarChar(200), label)
      .input('isOk', adminSql.Bit, isOk ? 1 : 0)
      .input('errorMessage', adminSql.NVarChar(500), isOk ? null : String(result.error || '').slice(0, 500))
      .input('totalLogSizeMb', adminSql.Decimal(18, 1), totalLogSizeMb)
      .input('usedLogPercent', adminSql.Decimal(5, 1), usedLogPercent)
      .input('isOverThreshold', adminSql.Bit, isOver ? 1 : 0)
      .input('lastAlertedAt', adminSql.DateTime2, lastAlertedAt)
      .query(`
        MERGE etl.LogSpaceStatus AS target
        USING (SELECT @key AS ConnectionKey) AS src ON target.ConnectionKey = src.ConnectionKey
        WHEN MATCHED THEN UPDATE SET
          DisplayName = @label, IsOk = @isOk, ErrorMessage = @errorMessage,
          TotalLogSizeMB = @totalLogSizeMb, UsedLogPercent = @usedLogPercent,
          IsOverThreshold = @isOverThreshold, LastCheckedAt = SYSUTCDATETIME(), LastAlertedAt = @lastAlertedAt
        WHEN NOT MATCHED THEN INSERT (ConnectionKey, DisplayName, IsOk, ErrorMessage, TotalLogSizeMB, UsedLogPercent, IsOverThreshold, LastCheckedAt, LastAlertedAt)
          VALUES (@key, @label, @isOk, @errorMessage, @totalLogSizeMb, @usedLogPercent, @isOverThreshold, SYSUTCDATETIME(), @lastAlertedAt);
      `);
  }

  if (overThreshold.length) {
    await alertLogSpaceHigh(overThreshold, { sizeThresholdMb: sizeThreshold, percentThreshold }).catch(() => {});
  }

  return allItems.length;
}

module.exports = { checkAllLogSpace };
