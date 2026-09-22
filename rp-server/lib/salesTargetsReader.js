// lib/salesTargetsReader.js — Đọc dwh.SalesTargets (nhập qua etl-admin, xem
// etl/lib/salesTargetsImport.js) cho SourceType='composite'
// (lib/compositeReportRunner.js). rp-server CHỈ ĐỌC bảng này (không ghi —
// xem dwh/grants.sql, tài khoản DWH_USER của rp-server chỉ SELECT), qua
// CÙNG pool "DWH" dùng cho dwh.ReportFacts (SELECT ON SCHEMA::dwh tự áp cho
// mọi bảng trong schema, kể cả bảng tạo sau).
const { sql } = require('../db');

// Trả về [{ entityCode, periodMonth, ...targets phẳng }] cho ĐÚNG 1 khoảng
// [fromPeriod, toPeriod] (khoảng ngày báo cáo được yêu cầu — có thể là 1
// NGÀY DUY NHẤT khi fromPeriod === toPeriod, xem
// compositeReportRunner.js:resolveRequestedRange — dùng CHUNG 1 hàm cho cả
// 2 trường hợp thay vì viết 2 bản riêng). CỘNG DỒN chỉ tiêu của mọi ngày/
// tháng trong khoảng, theo TỪNG entityCode — quyết định nghiệp vụ đã chốt
// với người dùng: chọn khoảng nhiều ngày thì "Chỉ tiêu" = tổng chỉ tiêu
// TỪNG NGÀY trong khoảng đó (không quy đổi/chia tỷ lệ).
async function runSalesTargetsBlockRange(pool, domain, fromPeriod, toPeriod) {
  const result = await pool.request()
    .input('domain', sql.VarChar(50), domain)
    .input('fromPeriod', sql.Date, fromPeriod)
    .input('toPeriod', sql.Date, toPeriod)
    .query(`
      SELECT EntityCode, PeriodMonth, TargetsJson
      FROM dwh.SalesTargets
      WHERE Domain = @domain AND PeriodMonth BETWEEN @fromPeriod AND @toPeriod
    `);
  const rows = result.recordset.map(r => ({
    entityCode: r.EntityCode,
    ...JSON.parse(r.TargetsJson)
  }));
  return aggregateTargetRowsByEntity(rows);
}

// Gộp nhiều dòng chỉ tiêu (1 dòng/kỳ, có thể nhiều kỳ trong khoảng) thành
// ĐÚNG 1 dòng/entityCode — bắt buộc phải gộp về 1 dòng vì
// compositeReportRunner.js coi 1 khối trả >1 dòng cho cùng entityCode là
// LỖI CẤU HÌNH (loại hẳn thực thể đó, xem cảnh báo "ambiguousEntityCodes").
//
// TrangThai='DaDong' đánh dấu THEO TỪNG KỲ (siêu thị có thể đóng cửa 1
// tháng/1 ngày cụ thể rồi vẫn có thể đã từng mở trước đó trong cùng khoảng
// đã chọn) — CHỈ loại các field số của NHỮNG KỲ ĐÃ ĐÓNG khỏi tổng (coi như
// không đóng góp, không phải "toàn bộ khoảng phải chưa từng đóng"), và CHỈ
// gắn TrangThai='DaDong' cho dòng gộp khi TẤT CẢ kỳ trong khoảng đều đóng
// (khớp đúng hành vi cũ khi khoảng chỉ có 1 kỳ duy nhất — xem
// compositeReportRunner.js phần loại thực thể "DaDong" ở BẤT KỲ khối
// target nào).
function aggregateTargetRowsByEntity(rows) {
  const byEntity = new Map();
  for (const row of rows) {
    if (!row.entityCode) continue;
    if (!byEntity.has(row.entityCode)) byEntity.set(row.entityCode, []);
    byEntity.get(row.entityCode).push(row);
  }
  const out = [];
  for (const [entityCode, periodRows] of byEntity) {
    const openPeriods = periodRows.filter(r => r.TrangThai !== 'DaDong');
    const allClosed = periodRows.length > 0 && openPeriods.length === 0;
    const summed = { entityCode, periodMonth: null };
    const keys = new Set();
    for (const r of openPeriods) {
      for (const k of Object.keys(r)) {
        if (k !== 'entityCode' && k !== 'periodMonth' && k !== 'TrangThai') keys.add(k);
      }
    }
    for (const k of keys) {
      summed[k] = openPeriods.reduce((sum, r) => sum + (typeof r[k] === 'number' ? r[k] : 0), 0);
    }
    if (allClosed) summed.TrangThai = 'DaDong';
    out.push(summed);
  }
  return out;
}

module.exports = { runSalesTargetsBlockRange };
