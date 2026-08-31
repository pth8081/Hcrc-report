// lib/upsert.js — Ghi một lô dòng đã transform vào dwh.ReportFacts bằng
// MERGE, khớp theo khoá nghiệp vụ (SourceSystem, Domain, EntityCode,
// EventDate — EventDate NẰM TRONG khoá, xem dwh/schema.sql). Nạp dữ liệu
// qua bảng tạm #Staging bằng bulk insert trước khi MERGE — nhanh hơn nhiều
// so với upsert từng dòng khi một lượt đồng bộ có hàng nghìn dòng. Toàn bộ
// chạy trong 1 transaction: lỗi giữa chừng thì rollback, không có dòng nào
// được ghi nửa vời.
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
// không đụng gì trong lúc chờ sửa.
const { sql } = require('../db');

const STALE_HISTORY_SPAN_DAYS = 3;

// Hàm THUẦN (không đụng CSDL) — tách riêng để test được không cần SQL Server
// thật. { count, minDate, maxDate } là kết quả đo trước của TẬP DÒNG SẮP bị
// DELETE (cùng predicate với câu DELETE thật ở dưới).
function shouldBlockHistoryWipe({ count, minDate, maxDate }) {
  if (!count) return false;
  if (!minDate || !maxDate) return false;
  const spanDays = Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000);
  return spanDays > STALE_HISTORY_SPAN_DAYS;
}

async function upsertReportFacts(pool, rows, { keepHistory = false } = {}) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`
      IF OBJECT_ID('tempdb..#Staging') IS NOT NULL DROP TABLE #Staging;
      CREATE TABLE #Staging (
        SourceSystem  VARCHAR(50)   NOT NULL,
        Domain        VARCHAR(50)   NOT NULL,
        EntityCode    NVARCHAR(100) NULL,
        EventDate     DATE          NOT NULL,
        Dimensions    NVARCHAR(MAX) NOT NULL,
        Measures      NVARCHAR(MAX) NULL
      );
    `);

    const table = new sql.Table('#Staging');
    table.create = false;
    table.columns.add('SourceSystem', sql.VarChar(50), { nullable: false });
    table.columns.add('Domain', sql.VarChar(50), { nullable: false });
    table.columns.add('EntityCode', sql.NVarChar(100), { nullable: true });
    table.columns.add('EventDate', sql.Date, { nullable: false });
    table.columns.add('Dimensions', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('Measures', sql.NVarChar(sql.MAX), { nullable: true });
    for (const r of rows) {
      table.rows.add(
        r.sourceSystem,
        r.domain,
        r.entityCode ?? null,
        r.eventDate,
        JSON.stringify(r.dimensions || {}),
        r.measures ? JSON.stringify(r.measures) : null
      );
    }
    await new sql.Request(tx).bulk(table);

    if (!keepHistory) {
      // Dọn dòng CŨ của đúng thực thể này nhưng KHÁC EventDate với bất kỳ
      // dòng nào trong lô mới — giữ đúng "1 dòng/thực thể" (không giữ lịch
      // sử) dù EventDate giờ đã nằm trong khoá UNIQUE. TRƯỚC KHI xoá thật,
      // đo span của tập dòng sắp bị xoá (cùng predicate WHERE/NOT EXISTS) —
      // xem shouldBlockHistoryWipe() ở đầu file.
      const staleCheck = await new sql.Request(tx).query(`
        SELECT COUNT(*) AS Cnt, MIN(EventDate) AS MinDate, MAX(EventDate) AS MaxDate
        FROM dwh.ReportFacts
        WHERE EXISTS (
          SELECT 1 FROM #Staging s
          WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
            AND s.Domain = dwh.ReportFacts.Domain
            AND s.EntityCode = dwh.ReportFacts.EntityCode
        )
        AND NOT EXISTS (
          SELECT 1 FROM #Staging s
          WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
            AND s.Domain = dwh.ReportFacts.Domain
            AND s.EntityCode = dwh.ReportFacts.EntityCode
            AND s.EventDate = dwh.ReportFacts.EventDate
        );
      `);
      const { Cnt, MinDate, MaxDate } = staleCheck.recordset[0];
      if (shouldBlockHistoryWipe({ count: Cnt, minDate: MinDate, maxDate: MaxDate })) {
        throw Object.assign(
          new Error(
            `Chặn đồng bộ: sắp xoá ${Cnt} dòng dữ liệu trải dài hơn ${STALE_HISTORY_SPAN_DAYS} ngày (từ ${new Date(MinDate).toLocaleDateString('vi-VN')} đến ${new Date(MaxDate).toLocaleDateString('vi-VN')}) trong khi job đang TẮT "Giữ lịch sử" — có vẻ domain này cần giữ lịch sử nhiều ngày. Vào "Đồng bộ" bật "Giữ lịch sử theo ngày" cho job này rồi chạy lại; KHÔNG dòng nào bị xoá do lượt chạy này bị chặn.`
          ),
          { isHistoryGuard: true }
        );
      }

      await new sql.Request(tx).query(`
        DELETE FROM dwh.ReportFacts
        WHERE EXISTS (
          SELECT 1 FROM #Staging s
          WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
            AND s.Domain = dwh.ReportFacts.Domain
            AND s.EntityCode = dwh.ReportFacts.EntityCode
        )
        AND NOT EXISTS (
          SELECT 1 FROM #Staging s
          WHERE s.SourceSystem = dwh.ReportFacts.SourceSystem
            AND s.Domain = dwh.ReportFacts.Domain
            AND s.EntityCode = dwh.ReportFacts.EntityCode
            AND s.EventDate = dwh.ReportFacts.EventDate
        );
      `);
    }

    const mergeResult = await new sql.Request(tx).query(`
      MERGE dwh.ReportFacts AS target
      USING #Staging AS src
        ON  target.SourceSystem = src.SourceSystem
        AND target.Domain = src.Domain
        AND target.EntityCode = src.EntityCode
        AND target.EventDate = src.EventDate
      WHEN MATCHED THEN
        UPDATE SET
          Dimensions = src.Dimensions,
          Measures = src.Measures,
          SyncedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (SourceSystem, Domain, EntityCode, EventDate, Dimensions, Measures, SyncedAt)
        VALUES (src.SourceSystem, src.Domain, src.EntityCode, src.EventDate, src.Dimensions, src.Measures, SYSUTCDATETIME())
      OUTPUT $action AS Action;
    `);

    await tx.commit();
    const actions = mergeResult.recordset.map(r => r.Action);
    return {
      inserted: actions.filter(a => a === 'INSERT').length,
      updated: actions.filter(a => a === 'UPDATE').length
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

module.exports = { upsertReportFacts, shouldBlockHistoryWipe, STALE_HISTORY_SPAN_DAYS };
