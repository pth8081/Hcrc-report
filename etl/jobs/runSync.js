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
const { getConnection, invalidate: invalidateDataSource } = require('../lib/dataSourcePool');
const { extractTable, transformRow } = require('../lib/tableSyncEngine');
const { upsertReportFacts } = require('../lib/upsert');
const { alertSyncFailure } = require('../lib/mailer');
const { logInfo, logWarn, logError } = require('../lib/systemLog');
const sourcesRegistry = require('../sources');

const EPOCH = new Date('1970-01-01T00:00:00.000Z');
const WATERMARK_SAFETY_LAG_MS = 5000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lượt chạy ĐẦU TIÊN của 1 job (chưa có etl.SyncState, getLastSyncedAt() trả
// về EPOCH) — job "Lịch sử" kiểu này đọc VIEW gộp hàng chục triệu dòng không
// lọc ngày, cần giữ NGUYÊN requestTimeout dài (DATASOURCE_REQUEST_TIMEOUT_MS,
// mặc định 10 phút — xem dbAdapters/mssql.js). Dùng cùng đối tượng EPOCH làm
// "cột mốc" cho MỌI job Type='table', không cần biết trước job nào là job
// "Lịch sử"/job mới tạo.
function isFirstRun(lastSyncedAt) {
  return lastSyncedAt.getTime() === EPOCH.getTime();
}

// Bản 8.86 (theo yêu cầu người dùng, sau sự cố thật nhiều job "(TV)" báo lỗi
// "operation timed out for an unknown reason" dù trang "Trạng thái kết nối"
// báo CÁC NGUỒN ĐÓ vẫn kết nối được — hệ thống dùng VPN tới từng chi nhánh,
// thỉnh thoảng chập chờn VÀI GIÂY-VÀI PHÚT nhưng KHÔNG mất hẳn): trang
// "Trạng thái kết nối" (lib/connectionHealthChecker.js) chỉ mở+đóng ngay 1
// kết nối NGẮN để kiểm tra — thường vẫn qua được dù VPN đang chập chờn. Job
// đồng bộ THẬT thì giữ 1 kết nối gộp (pool) LÂU hơn nhiều để chạy cả câu
// truy vấn — trước bản này, MỌI job (kể cả job "(TV)" đọc vài dòng mới phát
// sinh mỗi vài phút) đều dùng CHUNG requestTimeout 10 PHÚT của job "Lịch sử"
// (hợp lý cho job đó, QUÁ DÀI cho job thường) — 1 lượt bị VPN làm treo giữa
// chừng phải chờ ĐỦ 10 phút mới báo lỗi, chiếm 1 connection trong pool suốt
// thời gian đó, và vì bản 8.59 CỐ Ý không thử lại lỗi xảy ra SAU KHI đã kết
// nối được (coi là lỗi dữ liệu/cấu hình, không phải lỗi mạng — đúng với lỗi
// thiếu cột/sai cú pháp, nhưng SAI với đúng kịch bản VPN chập chờn giữa
// chừng câu truy vấn), lượt đó coi như THẤT BẠI HẲN, phải chờ lượt cron kế
// tiếp (2-3 phút sau, xem CronExpression từng job) mới có cơ hội thử lại.
//
// Rút ngắn requestTimeout CHO JOB CHẠY ĐỊNH KỲ (không phải lần đầu) xuống
// mức đủ dùng cho 1 lô dữ liệu gia tăng nhỏ (EXTRACT_BATCH_SIZE dòng) — lượt
// bị treo thật sự giờ báo lỗi NHANH hơn nhiều (mặc định 90 giây thay vì 10
// phút), giải phóng connection sớm, và (xem extractBatch() ở runTableJob())
// được THỬ LẠI NGAY trong lúc job đang chạy thay vì phải chờ lượt cron kế
// tiếp — tổng thời gian tới khi có dữ liệu mới giảm đáng kể mà
// KHÔNG đổi gì cho job "Lịch sử" (vẫn đủ 10 phút như trước, qua
// isFirstRun() ở trên).
const INCREMENTAL_REQUEST_TIMEOUT_MS = parseInt(process.env.DATASOURCE_INCREMENTAL_REQUEST_TIMEOUT_MS || '90000', 10);

function requestTimeoutFor(lastSyncedAt) {
  return isFirstRun(lastSyncedAt) ? undefined : INCREMENTAL_REQUEST_TIMEOUT_MS; // undefined = dùng mặc định dài của adapter
}

// Nhận diện lỗi MẠNG TẠM THỜI (đáng thử lại) — KHÁC lỗi dữ liệu/cấu hình
// (thiếu cột, sai cú pháp SQL, tên bảng không tồn tại...), loại lỗi đó
// KHÔNG tự hết dù thử lại bao nhiêu lần, phải ném ngay như cũ (xem chú thích
// đầu CONNECT_RETRY_WINDOW_MS phía dưới — giữ nguyên nguyên tắc đã có từ bản
// 8.59, chỉ mở rộng DANH SÁCH NƠI ÁP DỤNG, không đổi nguyên tắc). Gồm:
// - Mã lỗi hệ điều hành/socket chuẩn (ETIMEOUT, ESOCKET, ECONNRESET,
//   ECONNREFUSED, EHOSTUNREACH, ENETUNREACH, EPIPE) — ném bởi tedious/net.
// - TimeoutError của `tarn` (pool kết nối dùng trong thư viện `mssql`) —
//   ném khi không xin được 1 connection rảnh trong pool kịp thời, thường vì
//   1 connection khác trong CÙNG pool đang "treo" do mạng chập chờn, không
//   phải vì nguồn đã từ chối kết nối rõ ràng (lỗi đó có message khác, cụ
//   thể, không rơi vào nhánh "unknown reason" này).
// - Vài chuỗi message quen thuộc khác không có err.code chuẩn (tedious đôi
//   khi chỉ có message, không có code) — xem describeSyncError() bên dưới
//   để hiểu vì sao .message có thể trống/không đủ, dùng describeSyncError()
//   khi cần GHI LOG đầy đủ, hàm NÀY chỉ cần đủ để PHÂN LOẠI, không cần đẹp.
const TRANSIENT_ERROR_CODES = new Set(['ETIMEOUT', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE']);
const TRANSIENT_MESSAGE_RE = /timed out|ECONNRESET|socket hang up|read ECONNRESET|connection is closed|no longer usable|EPIPE/i;

function isTransientNetworkError(err) {
  if (!err) return false;
  if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
  if (err.name === 'TimeoutError') return true; // tarn (pool) — xem chú thích ở trên
  const texts = [err.message, ...(Array.isArray(err.errors) ? err.errors.map(e => e && e.message) : []), ...(Array.isArray(err.precedingErrors) ? err.precedingErrors.map(e => e && e.message) : [])].filter(Boolean);
  return texts.some(t => TRANSIENT_MESSAGE_RE.test(t));
}

// Bản 8.59 (theo yêu cầu người dùng, sau sự cố thật mất kết nối vài chi
// nhánh — xem Log 04/10/2026): lỗi KẾT NỐI (không phải lỗi dữ liệu/cấu
// hình) tới nguồn — vd mạng chi nhánh chập chờn vài giây-vài phút — giờ
// được THỬ LẠI NGAY trong lúc job đang chạy, thay vì bỏ cuộc ngay rồi đợi
// NGUYÊN 1 chu kỳ cron (2-15 phút tuỳ job) mới thử lại. Thử lại CÀNG LÚC
// CÀNG THƯA (backoff 15s -> 30s -> 60s -> 120s, giữ 120s/lần sau đó) trong
// tối đa CONNECT_RETRY_WINDOW_MS (10 phút, người dùng xác nhận) — HẾT cửa
// sổ mà vẫn lỗi thì DỪNG HẲN, báo 1 lượt THẤT BẠI bình thường vào
// etl.SyncLog — lịch cron GỐC của job tự lo lượt kế tiếp (đúng yêu cầu
// "thời gian đã đặt áp dụng cho lần đồng bộ tiếp theo", không cần job này
// tự canh giờ tiếp theo). Trong lúc đang thử lại, job vẫn nằm trong
// `runningJobs` (jobs/scheduler.js) nên lượt cron kế tiếp của ĐÚNG job này
// tự động bị bỏ qua — không chồng lấn.
//
// QUAN TRỌNG — gọi TRƯỚC khi vào runWithCrossProcessLock(), KHÔNG phải bên
// trong: sp_getapplock giữ nguyên 1 transaction mở suốt thời gian chạy
// fn(), tức 1 kết nối từ pool 'ADMIN' (mặc định tối đa 5, xem db.js
// ADMIN_POOL_MAX) bị CHIẾM DỤNG suốt thời gian đó. Nếu retry nằm TRONG
// lúc giữ khoá, nhiều job cùng mất kết nối 1 lúc (đúng kịch bản thật đã
// xảy ra — nhiều chi nhánh cùng rớt mạng) sẽ giữ tới 10 PHÚT/job, dễ chiếm
// hết pool 'ADMIN' khiến các job/API khác (kể cả trang quản trị) không
// còn kết nối nào để dùng. Gọi TRƯỚC khi có khoá — mỗi lượt thử chỉ chiếm
// kết nối ĐÚNG lúc thử (thất bại ngay, không giữ), lúc "ngủ" chờ thử lại
// (15s/30s/60s/120s) KHÔNG giữ bất kỳ kết nối/khoá CSDL nào.
//
// CHỈ áp dụng cho bước LẤY KẾT NỐI (TCP/login tới nguồn) — đây là bước DUY
// NHẤT quan sát được lỗi mạng chi nhánh thật (log "Lỗi kết nối nguồn #N" ở
// lib/dataSourcePool.js). KHÔNG retry lỗi XẢY RA SAU KHI đã kết nối được
// (vd thiếu cột trong VIEW, lỗi cú pháp SQL) — loại lỗi này KHÔNG tự hết dù
// thử lại bao nhiêu lần, cần sửa tay ngay; thử lại chỉ phí thời gian và
// khiến admin tưởng nhầm "hệ thống đang tự xử lý" trong khi thực ra cần
// người can thiệp.
//
// KHÔNG tái dùng cho lib/connectionHealthChecker.js (bản 8.57, trang
// "Trạng thái kết nối") — trang đó CỐ Ý muốn biết NGAY nguồn nào mất kết
// nối tại đúng thời điểm kiểm tra, retry ở đó sẽ làm sai lệch kết quả hiện
// trên trang (che mất tình trạng mất kết nối thật trong vài phút đầu).
const CONNECT_RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 phút
const CONNECT_RETRY_DELAYS_MS = [15000, 30000, 60000, 120000]; // 15s,30s,60s,120s (giữ 120s/lần nếu còn thời gian)

// allowRetry=false — dùng cho đường "Chạy thử" tương tác (routes/admin/syncJobs.js
// POST /:id/run-now, admin BẤM NÚT VÀ ĐANG CHỜ ngay trên trình duyệt) — giữ
// đúng hành vi CŨ (thử 1 lần, báo lỗi ngay) thay vì bắt admin chờ tới 10
// phút mới thấy kết quả. CHỈ job chạy NỀN theo lịch cron (không ai chờ
// trực tiếp) mới dùng retry đầy đủ — xem runJobObject().
async function getConnectionWithRetry(job, allowRetry = true, requestTimeout) {
  const deadline = Date.now() + CONNECT_RETRY_WINDOW_MS;
  let attempt = 0;
  for (;;) {
    try {
      return await getConnection(job.DataSourceId, { requestTimeout });
    } catch (err) {
      attempt += 1;
      const remaining = allowRetry ? deadline - Date.now() : 0;
      if (remaining <= 0) {
        if (attempt === 1) throw err; // allowRetry=false (hoặc hết giờ ngay từ lần đầu, không thực tế) — ném NGUYÊN lỗi gốc, không bọc thêm chữ "đã thử lại"
        throw new Error(`Mất kết nối nguồn liên tục trong ${Math.round(CONNECT_RETRY_WINDOW_MS / 60000)} phút (đã thử lại ${attempt} lần) — ${err.message}`);
      }
      const delay = Math.min(CONNECT_RETRY_DELAYS_MS[Math.min(attempt - 1, CONNECT_RETRY_DELAYS_MS.length - 1)], remaining);
      logWarn(`⏳ [${job.Name}] Lỗi kết nối nguồn (lần ${attempt}): ${err.message} — thử lại sau ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
    }
  }
}

// Số dòng đọc/biến đổi/ghi mỗi LÔ cho job Type='table' (xem runTableJob) —
// job "Lịch sử" chạy lần đầu đọc VIEW gộp UNION ALL ~93 bảng/bảng lưu trữ
// hàng chục triệu dòng không lọc ngày (đã gặp thật, xem chú thích
// DEFAULT_REQUEST_TIMEOUT_MS ở lib/dbAdapters/mssql.js) — trước đây
// extractTable() tải TOÀN BỘ kết quả vào 1 mảng JS, rồi .map() ra 1 mảng
// TOÀN BỘ thứ 2 trước khi ghi dòng đầu tiên — 2 bản sao đầy đủ trong bộ nhớ
// cùng lúc, rủi ro Node hết bộ nhớ (OOM) thật với quy mô này. Từ nay đọc-
// biến đổi-ghi TỪNG LÔ ngay khi có, không giữ quá 1 lô trong bộ nhớ.
const EXTRACT_BATCH_SIZE = 5000;

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

// Đọc-biến đổi-ghi theo LÔ (xem EXTRACT_BATCH_SIZE) — TỰ ghi luôn vào
// dwh.ReportFacts qua upsertReportFacts() cho từng lô (khác runCustomJob:
// connector tuỳ biến ở etl/sources/ thường trả về lượng dòng vừa phải, chưa
// thấy rủi ro OOM tương tự nên giữ nguyên "gom hết rồi ghi 1 lần"). Watermark
// (LastSyncedAt) CHỈ ghi 1 LẦN ở cuối lượt chạy (runJobObjectLocked, không
// đổi) — lượt chạy bị crash giữa chừng thì lần chạy sau đọc lại TỪ ĐẦU với
// CÙNG lastSyncedAt cũ, ghi lại đúng những lô đã ghi rồi (MERGE idempotent,
// vô hại) — nhất quán với cách upsertReportFacts() vốn đã tự chia lô
// ROWS_PER_TRANSACTION và commit từng lô độc lập, KHÔNG chờ ghi xong mới
// đẩy watermark.
// Bản 8.86 — lỗi mạng tạm thời XẢY RA TRONG LÚC TRÍCH XUẤT (connection đã
// mở thành công nhưng VPN chập chờn GIỮA CHỪNG câu truy vấn, xem chú thích
// isTransientNetworkError() ở trên) giờ được thử lại NGAY, KHÔNG ném lỗi
// luôn như trước bản này. CHỈ 3 lần thử/5 giây — KHÔNG dùng cửa sổ 10 phút
// như getConnectionWithRetry(): hàm này chạy BÊN TRONG khoá sp_getapplock
// (runWithCrossProcessLock), giữ khoá lâu chiếm 1 connection pool 'ADMIN'
// suốt thời gian đó (đúng vấn đề bản 8.59 đã tránh — xem chú thích đầu
// CONNECT_RETRY_WINDOW_MS). Hết 3 lần thử nhanh mà vẫn lỗi mạng → ném ra
// NGOÀI khoá như bình thường (runJobObjectLocked ghi FAILED, gửi cảnh báo)
// — lượt cron KẾ TIẾP của chính job này (2-3 phút sau với job "(TV)") tự
// thử lại từ đầu qua getConnectionWithRetry() (đủ 10 phút, ngoài khoá) —
// vẫn đảm bảo "thử liên tục tới khi thành công" ở tầm job, chỉ không giữ
// khoá CSDL trong lúc chờ.
//
// invalidateDataSource() TRƯỚC khi lấy connection mới — tránh lấy lại ĐÚNG
// connection/pool đang "kẹt" (lỗi mạng giữa chừng 1 request không có nghĩa
// các request SAU trên CÙNG socket sẽ ổn trở lại ngay).
const EXTRACT_RETRY_ATTEMPTS = 3;
const EXTRACT_RETRY_DELAY_MS = 5000;

// connection — ĐÃ lấy sẵn TRƯỚC khi gọi hàm này (xem runJobObject(), lý do
// đầy đủ ở chú thích getConnectionWithRetry() phía trên: retry BƯỚC KẾT NỐI
// BAN ĐẦU phải xảy ra TRƯỚC khi giữ khoá sp_getapplock, không phải bên
// trong) — CÓ THỂ bị thay thế bằng connection MỚI giữa chừng nếu gặp lỗi
// mạng tạm thời lúc trích xuất (xem EXTRACT_RETRY_ATTEMPTS ở trên).
async function runTableJob(job, lastSyncedAt, dwhPool, connection) {
  let conn = connection;
  let offset = 0;
  let rawCount = 0;
  let rawMaxUpdatedAt = lastSyncedAt;
  let inserted = 0;
  let updated = 0;

  async function extractBatch(currentOffset) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await extractTable(conn, job, lastSyncedAt, { offset: currentOffset, limit: EXTRACT_BATCH_SIZE });
      } catch (err) {
        if (!isTransientNetworkError(err) || attempt >= EXTRACT_RETRY_ATTEMPTS) throw err;
        logWarn(`⏳ [${job.Name}] Lỗi mạng khi trích xuất lô dữ liệu (lần ${attempt}/${EXTRACT_RETRY_ATTEMPTS - 1}): ${describeSyncError(err)} — làm mới kết nối, thử lại sau ${Math.round(EXTRACT_RETRY_DELAY_MS / 1000)}s...`);
        await invalidateDataSource(job.DataSourceId);
        await sleep(EXTRACT_RETRY_DELAY_MS);
        conn = await getConnection(job.DataSourceId, { requestTimeout: requestTimeoutFor(lastSyncedAt) });
      }
    }
  }

  for (;;) {
    const { rows, ...meta } = await extractBatch(offset);
    if (!rows.length) break;

    rawCount += rows.length;
    for (const r of rows) {
      const v = r[`m_${meta.updatedCol}`];
      if (v > rawMaxUpdatedAt) rawMaxUpdatedAt = v;
    }

    const transformedBatch = rows.map(r => transformRow(job, meta, r));
    const batchResult = await upsertReportFacts(dwhPool, transformedBatch, { keepHistory: !!job.KeepHistory });
    inserted += batchResult.inserted;
    updated += batchResult.updated;

    if (rows.length < EXTRACT_BATCH_SIZE) break;
    offset += EXTRACT_BATCH_SIZE;
  }

  return { maxUpdatedAt: applyWatermarkSafetyLag(rawMaxUpdatedAt), rawCount, inserted, updated };
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

// Lấy kết nối nguồn (+ retry nếu lỗi mạng, xem getConnectionWithRetry() ở
// trên) TRƯỚC KHI vào khoá sp_getapplock — KHÔNG gộp vào runJobObjectLocked
// (lý do đầy đủ ở chú thích getConnectionWithRetry()): tránh giữ 1 kết nối
// pool 'ADMIN' suốt tối đa 10 phút retry mỗi job, dễ chiếm hết pool nếu
// nhiều chi nhánh cùng mất kết nối 1 lúc. Mất kết nối liên tục hết cả cửa
// sổ retry (10 phút) thì báo lỗi CUỐI ngay tại đây — giống hệt cách
// runJobObjectLocked() báo lỗi cho mọi lỗi khác, không cần giữ khoá nào để
// làm việc này.
async function runJobObject(job, { allowConnectRetry = true } = {}) {
  let connection;
  if (job.Type === 'table') {
    const startedAt = new Date();
    try {
      // requestTimeoutFor() cần lastSyncedAt để biết đây có phải lượt chạy
      // ĐẦU TIÊN hay không (xem chú thích đầy đủ ở requestTimeoutFor() phía
      // trên) — đọc TRƯỚC khi mở kết nối, không đợi vào runJobObjectLocked()
      // (vốn cũng tự đọc lại giá trị này — 1 truy vấn rẻ, KHÔNG đáng để
      // luồn tham số qua nhiều lớp hàm chỉ để tránh đọc 2 lần).
      const lastSyncedAt = await getLastSyncedAt(job.Id);
      connection = await getConnectionWithRetry(job, allowConnectRetry, requestTimeoutFor(lastSyncedAt));
    } catch (err) {
      const message = describeSyncError(err);
      logError(`⛔ [${job.Name}] Lỗi đồng bộ: ${message}`);
      await logRun({ jobId: job.Id, status: 'FAILED', errorMessage: message, startedAt, finishedAt: new Date() }).catch(() => {});
      await alertSyncFailure({ key: job.Name, label: job.Name }, message).catch(() => {});
      return;
    }
  }
  return runWithCrossProcessLock(job, () => runJobObjectLocked(job, connection));
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

// connection — ĐÃ lấy sẵn (+ retry nếu cần) TRƯỚC KHI vào khoá
// sp_getapplock, chỉ dùng cho job.Type==='table' (xem runJobObject()).
async function runJobObjectLocked(job, connection) {
  const startedAt = new Date();
  logInfo(`▶ [${job.Name}] Bắt đầu đồng bộ...`);
  try {
    const lastSyncedAt = await getLastSyncedAt(job.Id);
    const dwhPool = await getPool('DWH');

    let maxUpdatedAt, rawCount, inserted = 0, updated = 0;
    if (job.Type === 'table') {
      ({ maxUpdatedAt, rawCount, inserted, updated } = await runTableJob(job, lastSyncedAt, dwhPool, connection));
    } else {
      const custom = await runCustomJob(job, lastSyncedAt);
      maxUpdatedAt = custom.maxUpdatedAt;
      rawCount = custom.rawCount;
      if (rawCount) {
        ({ inserted, updated } = await upsertReportFacts(dwhPool, custom.transformed, { keepHistory: !!job.KeepHistory }));
      }
    }

    if (!rawCount) {
      logInfo(`  [${job.Name}] Không có dòng nào thay đổi kể từ ${lastSyncedAt.toISOString()}.`);
      await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: 0, startedAt, finishedAt: new Date() });
      return;
    }

    await setLastSyncedAt(job.Id, maxUpdatedAt);
    await logRun({ jobId: job.Id, status: 'SUCCESS', rowCount: rawCount, startedAt, finishedAt: new Date() });
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
