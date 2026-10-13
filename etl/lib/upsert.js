// lib/upsert.js — Ghi một lô dòng đã transform vào dwh.ReportFacts bằng
// MERGE, khớp theo khoá nghiệp vụ (SourceSystem, Domain, EntityCode,
// EventDate — EventDate NẰM TRONG khoá, xem dwh/schema.sql). Nạp dữ liệu
// qua bảng tạm #Staging bằng câu INSERT...VALUES viết trực tiếp (nhiều
// dòng/câu, chia lô — xem buildStagingInsertBatches bên dưới) trước khi
// MERGE — nhanh hơn nhiều so với upsert từng dòng khi một lượt đồng bộ có
// hàng nghìn dòng. Toàn bộ chạy trong 1 transaction: lỗi giữa chừng thì
// rollback, không có dòng nào được ghi nửa vời.
//
// LƯU Ý QUAN TRỌNG — TẠI SAO GỘP MỌI CÂU LỆNH LIÊN QUAN #Staging VÀO CÙNG
// 1 BATCH/1 LƯỢT .query(): đã gặp lỗi thật "Invalid object name '#Staging'."
// LẶP LẠI NHIỀU LẦN dù đã bỏ hẳn request.bulk()/sql.Table (nghi ngờ ban đầu)
// và thay bằng .query() thuần — kể cả vậy, việc tạo bảng tạm ở MỘT
// new sql.Request(tx) rồi INSERT/SELECT/DELETE/MERGE ở CÁC new sql.Request(tx)
// KHÁC (dù cùng 1 Transaction) vẫn có lúc không thấy được #Staging — không
// loại trừ hết khả năng thư viện mssql không giữ đúng 1 kết nối vật lý cho
// MỌI Request tạo rời rạc trên cùng Transaction trong một số trường hợp.
// Cách né triệt để: GỘP TẠO BẢNG + NẠP DỮ LIỆU + (SELECT dò lịch sử hoặc
// MERGE) vào CÙNG MỘT chuỗi SQL, gửi qua ĐÚNG MỘT lượt .query() — CHỈ CÒN
// TỐI ĐA 2 lượt gọi .query() cho toàn bộ hàm (thay vì 5+ trước đây), nên dù
// nguyên nhân thật là gì, #Staging luôn được tạo/đọc/ghi trong CÙNG một
// round-trip/batch, không có khoảng hở nào giữa các Request rời rạc để lộ
// ra vấn đề (nếu có) nữa. Đây là nguyên nhân khiến dwh.ReportFacts CHƯA
// TỪNG có dòng nào ghi thành công kể từ khi triển khai — lỗi bị ẩn sau
// thông điệp chung chung trước khi describeSyncError() (bản 6.63/6.66) lộ
// được thông điệp thật. KHÔNG dùng .input() cho các câu lệnh này (cùng lý
// do đã né ở bản 6.63 cho #StagingTargets — xem lib/salesTargetsImport.js)
// — mọi giá trị đều escape thủ công thành literal T-SQL.
//
// CHIA LÔ THEO TRANSACTION (ROWS_PER_TRANSACTION, xem bên dưới) — gộp batch
// ở trên (bản 6.68) chỉ đúng cho lượng dòng VỪA PHẢI (job "Live" ~600 dòng
// chạy ổn): job "Lịch sử" backfill nhiều tháng/năm dữ liệu (có thể hàng
// chục nghìn dòng) vẫn gặp LẠI đúng lỗi "Invalid object name '#Staging'."
// khi nhồi TOÀN BỘ vào 1 câu .query() — nhiều khả năng chạm một giới hạn
// nào đó (kích thước/số câu lệnh trong 1 batch) mà batch nhỏ không chạm
// tới. Thay vì cố tìm đúng ngưỡng, chia rows thành nhiều LÔ nhỏ
// (ROWS_PER_TRANSACTION dòng/lô), mỗi lô chạy TRỌN VẸN 1 chu trình
// transaction độc lập (đúng pattern đã CHỨNG MINH ổn định ở quy mô nhỏ),
// cộng dồn kết quả. Đánh đổi: bước "dọn dòng cũ" (stale wipe, xem dưới)
// chỉ thấy được dữ liệu của ĐÚNG lô đang xử lý — 1 thực thể có dữ liệu trải
// trên NHIỀU lô có thể bị dọn "nhầm" ở lô này rồi được lô sau ghi lại đúng
// ngay sau đó (tự sửa trong cùng 1 lượt chạy job, không lộ ra ngoài); lưới
// an toàn shouldBlockHistoryWipe() cũng chỉ đánh giá theo từng lô — chấp
// nhận được vì chia lô chỉ kích hoạt với dữ liệu backfill bất thường lớn,
// không phải job hàng ngày thông thường.
const ROWS_PER_TRANSACTION = 2000;
//
// keepHistory (etl.SyncJobs.KeepHistory, xem etl-db/schema.sql) — TẮT mặc
// định: TRƯỚC khi MERGE, dọn các dòng CŨ của đúng thực thể này nhưng KHÁC
// EventDate với dòng mới sắp ghi — giữ đúng "1 dòng/thực thể" như thiết kế
// gốc (trước khi EventDate vào khoá UNIQUE), chỉ chuyển việc đảm bảo đó từ
// tầng CSDL sang tầng ứng dụng. BẬT (true): bỏ qua bước dọn — mỗi
// EventDate khác nhau tự nhiên thành 1 dòng riêng, ngày cũ không bị ngày
// mới ghi đè (đồng bộ nhiều lần TRONG CÙNG 1 ngày vẫn update đúng dòng của
// ngày đó, do EventDate đó không đổi giữa các lần chạy).
//
// LƯỚI AN TOÀN chống quên tích "Giữ lịch sử" (shouldBlockHistoryWipe, xem
// bên dưới): domain lịch sử nhiều ngày (vd đối chiếu doanh thu — mỗi ngày 1
// dòng/chi nhánh trong THỜI GIAN DÀI) mà lỡ tạo job với KeepHistory=false
// thì lượt đồng bộ tăng dần (chỉ mang về đúng 1 ngày mới) sẽ khiến bước dọn
// ở trên XOÁ SẠCH mọi ngày cũ đã backfill trước đó — im lặng mất dữ liệu.
// Trước khi DELETE, đo khoảng cách ngày (span) của các dòng SẮP bị xoá —
// span lớn bất thường (> STALE_HISTORY_SPAN_DAYS ngày) là dấu hiệu rõ ràng
// của lỗi cấu hình này (đồng bộ "chốt số mới nhất" bình thường chỉ dọn đúng
// 1-2 ngày gần nhau, vd hôm qua -> hôm nay). Gặp trường hợp đó thì CHẶN
// CỨNG — không xoá, không MERGE, ném lỗi để lượt chạy hiện LỖI rõ ràng trên
// Dashboard/Log, admin vào bật lại "Giữ lịch sử" rồi chạy lại — dữ liệu cũ
// không đụng gì trong lúc chờ sửa. Vì cần ĐỌC kết quả đo (Cnt/MinDate/
// MaxDate) ở tầng JS TRƯỚC KHI quyết định có DELETE hay không, bước này bắt
// buộc phải là 1 round-trip riêng — không gộp được vào batch tạo bảng/nạp
// dữ liệu (không có gì để gộp SỚM hơn) lẫn batch DELETE+MERGE (phụ thuộc
// kết quả của chính SELECT này).
const { sql } = require('../db');

const STALE_HISTORY_SPAN_DAYS = 3;

// SQL Server giới hạn tối đa 1000 dòng/câu INSERT...VALUES — chia lô an
// toàn dưới ngưỡng đó.
const STAGING_INSERT_BATCH_SIZE = 500;

// Escape thủ công cho literal T-SQL (KHÔNG dùng .input() — xem lý do ở
// đầu file). Chỉ cần nhân đôi dấu nháy đơn, T-SQL không coi backslash là
// ký tự đặc biệt trong chuỗi.
function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined ? 'NULL' : sqlNStr(value);
}
function sqlDateLiteral(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `'${d.toISOString().slice(0, 10)}'`; // YYYY-MM-DD — không mơ hồ với kiểu DATE bất kể DATEFORMAT/LANGUAGE
}

// Build 1 hoặc nhiều câu INSERT INTO #Staging (...) VALUES (...), (...)
// — mỗi câu ≤ STAGING_INSERT_BATCH_SIZE dòng.
function buildStagingInsertBatches(rows) {
  const batches = [];
  for (let i = 0; i < rows.length; i += STAGING_INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + STAGING_INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${sqlNStr(r.sourceSystem)}, ${sqlNStr(r.domain)}, ${sqlNStrOrNull(r.entityCode ?? null)}, ${sqlDateLiteral(r.eventDate)}, ${sqlNStr(JSON.stringify(r.dimensions || {}))}, ${r.measures ? sqlNStr(JSON.stringify(r.measures)) : 'NULL'})`).join(',\n');
    batches.push(`INSERT INTO #Staging (SourceSystem, Domain, EntityCode, EventDate, Dimensions, Measures) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_SQL = `
IF OBJECT_ID('tempdb..#Staging') IS NOT NULL DROP TABLE #Staging;
CREATE TABLE #Staging (
  SourceSystem  VARCHAR(50)   NOT NULL,
  Domain        VARCHAR(50)   NOT NULL,
  EntityCode    NVARCHAR(100) NULL,
  EventDate     DATE          NOT NULL,
  Dimensions    NVARCHAR(MAX) NOT NULL,
  Measures      NVARCHAR(MAX) NULL
);`;

// "target.EntityCode = src.EntityCode OR (... IS NULL AND ... IS NULL)" —
// KHÔNG được viết gọn "target.EntityCode = src.EntityCode" (ANSI NULL: NULL
// = NULL luôn UNKNOWN, không khớp). Domain không gắn 1 thực thể cụ thể
// (EntityCode NULL, xem dwh/schema.sql) khớp ON kiểu ANSI sẽ LUÔN rơi vào
// WHEN NOT MATCHED -> INSERT — nhưng UNIQUE constraint
// UX_ReportFacts_Source_Domain_Entity_Date lại coi 2 NULL là TRÙNG NHAU
// (ngữ nghĩa NULL của SQL Server cho unique index, khác ANSI). Lệch pha 2
// ngữ nghĩa này khiến lần đồng bộ THỨ 2 của 1 dòng EntityCode NULL cùng
// EventDate (dữ liệu nguồn đổi, UpdatedAtColumn tăng) vẫn cố INSERT thay vì
// UPDATE, vi phạm UNIQUE KEY, rollback NGUYÊN CẢ LÔ — job lỗi lặp lại vô
// thời hạn. Viết tường minh vế OR để khớp ĐÚNG ngữ nghĩa UNIQUE constraint,
// không dựa vào ANSI NULL mặc định của ON clause.
const MERGE_SQL = `
MERGE dwh.ReportFacts AS target
USING #Staging AS src
  ON  target.SourceSystem = src.SourceSystem
  AND target.Domain = src.Domain
  AND (target.EntityCode = src.EntityCode OR (target.EntityCode IS NULL AND src.EntityCode IS NULL))
  AND target.EventDate = src.EventDate
WHEN MATCHED THEN
  UPDATE SET
    Dimensions = src.Dimensions,
    Measures = src.Measures,
    SyncedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT (SourceSystem, Domain, EntityCode, EventDate, Dimensions, Measures, SyncedAt)
  VALUES (src.SourceSystem, src.Domain, src.EntityCode, src.EventDate, src.Dimensions, src.Measures, SYSUTCDATETIME())
OUTPUT $action AS Action;`;

const STALE_CHECK_SQL = `
SELECT COUNT(*) AS Cnt, MIN(EventDate) AS MinDate, MAX(EventDate) AS MaxDate
FROM dwh.ReportFacts
WHERE EXISTS (
  SELECT 1 FROM #Staging s
  WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
    AND s.Domain = dwh.ReportFacts.Domain
    AND (s.EntityCode = dwh.ReportFacts.EntityCode OR (s.EntityCode IS NULL AND dwh.ReportFacts.EntityCode IS NULL))
)
AND NOT EXISTS (
  SELECT 1 FROM #Staging s
  WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
    AND s.Domain = dwh.ReportFacts.Domain
    AND (s.EntityCode = dwh.ReportFacts.EntityCode OR (s.EntityCode IS NULL AND dwh.ReportFacts.EntityCode IS NULL))
    AND s.EventDate = dwh.ReportFacts.EventDate
);`;

const DELETE_STALE_SQL = `
DELETE FROM dwh.ReportFacts
WHERE EXISTS (
  SELECT 1 FROM #Staging s
  WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
    AND s.Domain = dwh.ReportFacts.Domain
    AND (s.EntityCode = dwh.ReportFacts.EntityCode OR (s.EntityCode IS NULL AND dwh.ReportFacts.EntityCode IS NULL))
)
AND NOT EXISTS (
  SELECT 1 FROM #Staging s
  WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
    AND s.Domain = dwh.ReportFacts.Domain
    AND (s.EntityCode = dwh.ReportFacts.EntityCode OR (s.EntityCode IS NULL AND dwh.ReportFacts.EntityCode IS NULL))
    AND s.EventDate = dwh.ReportFacts.EventDate
);`;

// Hàm THUẦN (không đụng CSDL) — tách riêng để test được không cần SQL Server
// thật. { count, minDate, maxDate } là kết quả đo trước của TẬP DÒNG SẮP bị
// DELETE (cùng predicate với DELETE_STALE_SQL ở trên).
function shouldBlockHistoryWipe({ count, minDate, maxDate }) {
  if (!count) return false;
  if (!minDate || !maxDate) return false;
  const spanDays = Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000);
  return spanDays > STALE_HISTORY_SPAN_DAYS;
}

// Loại trùng khoá nghiệp vụ TRƯỚC khi ghi (bản 9.26, SỬA LỖI THẬT — báo cáo
// người dùng: job "Đơn đặt hàng - nhập hàng - Lịch sử (DSMART16_EOM)" lỗi
// lặp lại mãi "Violation of UNIQUE KEY constraint
// UX_ReportFacts_Source_Domain_Entity_Date... Cannot insert duplicate
// key"). NGUYÊN NHÂN: nếu #Staging (nguồn đưa vào MERGE_SQL) chứa 2+ dòng
// CÙNG 1 khoá (SourceSystem, Domain, EntityCode, EventDate) — có thể do
// nguồn THẬT có dữ liệu trùng (vd cùng 1 giao dịch lọt vào cả bảng tháng
// VÀ bảng STRANS_EOM do ranh giới lưu trữ chồng lấn), hoặc do phân trang
// OFFSET không có tiêu chí sắp xếp DUY NHẤT (ORDER BY chỉ theo EventDate,
// nhiều dòng cùng ngày không đảm bảo thứ tự ổn định giữa các lượt SELECT
// riêng biệt — xem chú thích OFFSET ở etl/lib/tableSyncEngine.js) khiến 1
// dòng vô tình bị lấy 2 lần rơi vào CÙNG 1 lô — thì nhánh "WHEN NOT
// MATCHED THEN INSERT" cố ghi dòng THỨ HAI trong khi dòng THỨ NHẤT (cùng
// lô, cùng 1 câu MERGE, chưa kịp "thấy" nhau qua index) đã chiếm đúng
// khoá đó, vi phạm UNIQUE KEY, ROLLBACK NGUYÊN CẢ LÔ — khác lỗi mạng tạm
// thời, lỗi này KHÔNG tự hết dù thử lại bao nhiêu lần (cùng dữ liệu nguồn
// trùng y hệt mỗi lần quét lại). Giữ dòng CUỐI CÙNG gặp phải cho mỗi khoá
// trùng (Map ghi đè tự nhiên theo thứ tự duyệt) — hợp lý vì trùng khoá
// nghĩa là CÙNG 1 thực thể/ngày, bản nào trong lô cũng đại diện đúng giá
// trị hiện tại, không cần phân biệt "đúng hơn".
function dedupeByBusinessKey(rows) {
  const map = new Map();
  for (const r of rows) {
    const entityKey = r.entityCode === null || r.entityCode === undefined ? '\u0000' : String(r.entityCode);
    const dateKey = (r.eventDate instanceof Date ? r.eventDate : new Date(r.eventDate)).toISOString().slice(0, 10);
    map.set(`${r.sourceSystem}|${r.domain}|${entityKey}|${dateKey}`, r);
  }
  return [...map.values()];
}

// Bản 9.29 — SỬA LỖI THẬT TIẾP: dedupeByBusinessKey() (bản 9.26) chỉ loại
// trùng trong ĐÚNG 1 lô (rows truyền vào 1 lượt gọi upsertReportFacts()) —
// job "Lịch sử" (DSMART16_EOM) VẪN lỗi lặp lại "Violation of UNIQUE KEY
// constraint" (xác nhận qua log thật, 2 lượt chạy khác nhau, 2 khoá khác
// nhau). Đã TRA TẬN NGUỒN (theo yêu cầu người dùng, kiểm chứng không đoán):
// bảng nguồn STRANS_202105 (và khả năng cao MỌI bảng STRANS_YYYYMM khác)
// tự nó CÓ SẴN 2 dòng THẬT cùng (TRANS_NUM, IDX) — vd TRANS_NUM
// 004001332105000357 IDX=2 có 2 dòng, QTY/AMOUNT KHÁC NHAU (3.000/51000 vs
// 8.000/56000) — nhiều khả năng là 1 giao dịch bị SỬA/ĐIỀU CHỈNH ở nguồn
// ghi thêm dòng mới thay vì UPDATE dòng cũ. VIEW lịch sử UNION ALL ~93
// bảng không lọc trùng này. 2 dòng trùng khoá nghiệp vụ đó CÓ THỂ rơi vào 2
// LÔ KHÁC NHAU (OFFSET/FETCH không có tiêu chí sắp xếp phụ ổn định giữa
// các lượt SELECT riêng biệt — xem chú thích ở tableSyncEngine.js) nên
// dedupeByBusinessKey() của ĐÚNG lô đó không thấy được dòng kia.
//
// SỬA TẬN GỐC (không cần biết trước nguồn có bao nhiêu dòng trùng/ở đâu):
// khi MERGE báo lỗi trùng khoá UNIQUE (2627/2601), THAY VÌ coi là lỗi fatal
// làm rollback nguyên lô rồi ném ra ngoài (job FAILED, không tiến thêm) —
// CHIA ĐÔI lô, thử lại TỪNG NỬA RIÊNG trong giao dịch riêng. Nếu 2 dòng
// trùng khoá rơi vào 2 NỬA KHÁC NHAU, mỗi nửa tự MERGE thành công độc lập
// (nửa xử lý trước INSERT, nửa xử lý sau thấy khoá đã có nên UPDATE, không
// còn 2 dòng trùng khoá cùng 1 câu MERGE nữa) — tự đệ quy chia tiếp nếu 2
// dòng trùng khoá tình cờ vẫn rơi cùng 1 nửa, hội tụ dần tới quy mô nhỏ.
function isDuplicateKeyError(err) {
  return err && (err.number === 2627 || err.number === 2601);
}

async function upsertReportFacts(pool, rows, { keepHistory = false } = {}) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  const deduped = dedupeByBusinessKey(rows);

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < deduped.length; i += ROWS_PER_TRANSACTION) {
    const chunk = deduped.slice(i, i + ROWS_PER_TRANSACTION);
    const result = await upsertReportFactsChunk(pool, chunk, { keepHistory });
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

// 1 lô ≤ ROWS_PER_TRANSACTION dòng, chạy TRỌN VẸN trong 1 transaction độc
// lập — xem giải thích chia lô ở đầu file.
async function upsertReportFactsChunk(pool, rows, { keepHistory = false, retriedSingleRow = false } = {}) {
  const setupSql = [CREATE_STAGING_SQL, ...buildStagingInsertBatches(rows)].join('\n');

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    let mergeResult;
    if (keepHistory) {
      // 1 round-trip DUY NHẤT: tạo bảng tạm + nạp dữ liệu + MERGE, tất cả
      // trong CÙNG 1 batch/1 lượt .query() — xem giải thích ở đầu file.
      mergeResult = await new sql.Request(tx).query([setupSql, MERGE_SQL].join('\n'));
    } else {
      // Round-trip 1: tạo bảng tạm + nạp dữ liệu + đo span lịch sử sắp xoá
      // (SELECT cuối cùng của batch quyết định .recordset trả về — xem
      // buildInsertBatches, các câu CREATE TABLE/INSERT không tạo recordset).
      const setupResult = await new sql.Request(tx).query([setupSql, STALE_CHECK_SQL].join('\n'));
      const { Cnt, MinDate, MaxDate } = setupResult.recordset[0];
      if (shouldBlockHistoryWipe({ count: Cnt, minDate: MinDate, maxDate: MaxDate })) {
        throw Object.assign(
          new Error(
            `Chặn đồng bộ: sắp xoá ${Cnt} dòng dữ liệu trải dài hơn ${STALE_HISTORY_SPAN_DAYS} ngày (từ ${new Date(MinDate).toLocaleDateString('vi-VN')} đến ${new Date(MaxDate).toLocaleDateString('vi-VN')}) trong khi job đang TẮT "Giữ lịch sử" — có vẻ domain này cần giữ lịch sử nhiều ngày. Vào "Đồng bộ" bật "Giữ lịch sử theo ngày" cho job này rồi chạy lại; KHÔNG dòng nào bị xoá do lượt chạy này bị chặn.`
          ),
          { isHistoryGuard: true }
        );
      }

      // Round-trip 2: dọn dòng cũ + MERGE, gộp chung 1 batch.
      mergeResult = await new sql.Request(tx).query([DELETE_STALE_SQL, MERGE_SQL].join('\n'));
    }

    await tx.commit();
    const actions = mergeResult.recordset.map(r => r.Action);
    return {
      inserted: actions.filter(a => a === 'INSERT').length,
      updated: actions.filter(a => a === 'UPDATE').length
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    // Chia đôi + thử lại riêng từng nửa khi lỗi trùng khoá UNIQUE — xem chú
    // thích đầy đủ ở isDuplicateKeyError() phía trên.
    if (isDuplicateKeyError(err) && rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      const first = await upsertReportFactsChunk(pool, rows.slice(0, mid), { keepHistory });
      const second = await upsertReportFactsChunk(pool, rows.slice(mid), { keepHistory });
      return { inserted: first.inserted + second.inserted, updated: first.updated + second.updated };
    }
    // Chia tới đúng 1 dòng mà VẪN lỗi trùng khoá — không phải do rows
    // truyền vào lần này tự trùng nhau nữa (chỉ còn 1 dòng), mà khoá đó ĐÃ
    // CÓ SẴN trong target ngay lúc câu MERGE này chạy, dù ON clause lẽ ra
    // phải thấy để UPDATE thay vì INSERT — dấu hiệu rõ nhất của 1 lượt GHI
    // KHÁC (job này chạy chồng lên chính nó do bấm "Chạy thử" khi đang có
    // lượt cron/lượt khác xử lý cùng khoá, hiếm nhưng có thể xảy ra) vừa
    // commit ĐÚNG khoá này ở giữa chừng. Thử lại ĐÚNG 1 LẦN (không đệ quy
    // vô hạn — retriedSingleRow chặn) — lượt thử lại chạy SAU khi lượt kia
    // đã commit xong, MERGE lúc đó tự thấy khoá đã có, chuyển đúng sang
    // UPDATE, không còn xung đột.
    if (isDuplicateKeyError(err) && rows.length === 1 && !retriedSingleRow) {
      return upsertReportFactsChunk(pool, rows, { keepHistory, retriedSingleRow: true });
    }
    throw err;
  }
}

module.exports = { upsertReportFacts, shouldBlockHistoryWipe, STALE_HISTORY_SPAN_DAYS, buildStagingInsertBatches, ROWS_PER_TRANSACTION, dedupeByBusinessKey, isDuplicateKeyError };
