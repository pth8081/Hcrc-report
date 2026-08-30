// lib/upsert.js — Ghi một lô dòng đã transform vào dwh.ReportFacts bằng
// MERGE, khớp theo khoá nghiệp vụ (SourceSystem, Domain, EntityCode).
// Nạp dữ liệu qua bảng tạm #Staging bằng bulk insert trước khi MERGE — nhanh
// hơn nhiều so với upsert từng dòng khi một lượt đồng bộ có hàng nghìn dòng.
// Toàn bộ chạy trong 1 transaction: lỗi giữa chừng thì rollback, không có dòng
// nào được ghi nửa vời.
const { sql } = require('../db');

async function upsertReportFacts(pool, rows) {
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

    const mergeResult = await new sql.Request(tx).query(`
      MERGE dwh.ReportFacts AS target
      USING #Staging AS src
        ON  target.SourceSystem = src.SourceSystem
        AND target.Domain = src.Domain
        AND target.EntityCode = src.EntityCode
      WHEN MATCHED THEN
        UPDATE SET
          EventDate = src.EventDate,
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
