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
const { sql } = require('../db');

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
      // sử) dù EventDate giờ đã nằm trong khoá UNIQUE.
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

module.exports = { upsertReportFacts };
