// lib/salesTargetsReader.js — Đọc dwh.SalesTargets (nhập qua etl-admin, xem
// etl/lib/salesTargetsImport.js) cho SourceType='composite'
// (lib/compositeReportRunner.js). rp-server CHỈ ĐỌC bảng này (không ghi —
// xem dwh/grants.sql, tài khoản DWH_USER của rp-server chỉ SELECT), qua
// CÙNG pool "DWH" dùng cho dwh.ReportFacts (SELECT ON SCHEMA::dwh tự áp cho
// mọi bảng trong schema, kể cả bảng tạo sau).
const { sql } = require('../db');

// Trả về [{ entityCode, periodMonth, ...targets phẳng }] — TargetsJson được
// dàn phẳng thẳng vào object (không lồng thêm 1 cấp) để công thức viết
// ngắn (vd "target.ChiTieuDoanhThu" thay vì "target.targets.ChiTieuDoanhThu").
async function runSalesTargetsBlock(pool, domain, periodMonth) {
  const result = await pool.request()
    .input('domain', sql.VarChar(50), domain)
    .input('periodMonth', sql.Date, periodMonth)
    .query(`
      SELECT EntityCode, PeriodMonth, TargetsJson
      FROM dwh.SalesTargets
      WHERE Domain = @domain AND PeriodMonth = @periodMonth
    `);
  return result.recordset.map(r => ({
    entityCode: r.EntityCode,
    periodMonth: r.PeriodMonth,
    ...JSON.parse(r.TargetsJson)
  }));
}

module.exports = { runSalesTargetsBlock };
