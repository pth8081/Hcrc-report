// lib/reportFactsHelpers.js — Hàm dùng CHUNG để đọc dwh.ReportFacts theo
// EntityCode (Measures/Dimensions lưu dạng JSON, xem etl-db/schema.sql) —
// tách ra từ lib/topSellingZeroStockRunner.js để lib/coreZeroStockRunner.js
// dùng lại NGUYÊN VẸN, không sao chép lại logic (2 báo cáo "tồn kho = 0"
// khác nhau ở cách CHỌN thực thể — tự xếp hạng vs danh sách Core cố định —
// nhưng CÙNG công thức đọc measures/dimensions bên dưới).
const { sql } = require('../db');

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Whitelist ký tự cho measureKey/dimensionKey trước khi nội suy vào
// JSON_VALUE(...) — phòng thủ chiều sâu THUẦN TUÝ: mọi lời gọi hiện tại đều
// truyền literal cứng, KHÔNG có input người dùng nào chạm tới tham số này
// hôm nay — nhưng nếu 1 lần sửa sau này lỡ truyền thẳng 1 giá trị lấy từ
// definition/filterValues vào đây, assertion này chặn injection thay vì im
// lặng cho qua.
const FIELD_KEY_RE = /^[a-zA-Z0-9_]+$/;
function assertSafeFieldKey(key) {
  if (!FIELD_KEY_RE.test(key)) {
    throw new Error(`Tên field không hợp lệ: "${key}"`);
  }
}

function buildEntityCodeParams(request, entityCodes, prefix = 'code') {
  return entityCodes.map((code, i) => {
    const p = `${prefix}${i}`;
    request.input(p, sql.NVarChar(200), String(code));
    return `@${p}`;
  });
}

// Dòng GẦN NHẤT TRƯỚC 1 ngày mốc (dùng cho tồn kho "hôm qua") — KHÔNG lấy
// dòng của chính ngày mốc hay sau đó, để luôn là số liệu ĐÃ CHỐT SỔ, không
// lẫn số liệu đang cập nhật dở trong ngày.
async function loadLatestMeasureBefore(pool, domain, entityCodes, measureKey, beforeDate) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  request.input('beforeDate', sql.Date, beforeDate);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, Value FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4)) AS Value,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')}) AND EventDate < @beforeDate
    ) latest WHERE rn = 1
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

// Dòng GẦN NHẤT bất kỳ ngày nào (dùng cho "Chờ nhập"/"Chờ giao" — số lượng
// đang treo TẠI THỜI ĐIỂM chạy báo cáo, VIEW nguồn tự tính lại mỗi lần đồng
// bộ) — khác loadLatestMeasureBefore ở chỗ không giới hạn "trước 1 ngày
// mốc", lấy đúng số liệu MỚI NHẤT đã đồng bộ.
async function loadLatestMeasure(pool, domain, entityCodes, measureKey) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, Value FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4)) AS Value,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')})
    ) latest WHERE rn = 1
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

// Như loadLatestMeasure() nhưng trả THÊM EventDate của đúng dòng đó (dùng
// cho "Ngày đặt" đi kèm "SL đang đặt" — xem lib/coreZeroStockRunner.js) —
// {value, eventDate} thay vì chỉ value.
async function loadLatestMeasureWithDate(pool, domain, entityCodes, measureKey) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, Value, EventDate FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4)) AS Value,
        EventDate,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')})
    ) latest WHERE rn = 1
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, { value: r.Value, eventDate: r.EventDate }]));
}

// Dòng ĐÚNG 1 ngày cụ thể (dùng cho "Số lượng bán hôm nay"/"Đã nhập hôm
// nay" — LUÔN đúng nghĩa "hôm nay", không lùi ngày nếu chưa có dữ liệu).
// Domain có nhiều dòng cùng ngày (vd nhiều chứng từ) thì SUM lại.
async function loadSumOnDate(pool, domain, entityCodes, measureKey, onDate) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  request.input('onDate', sql.Date, onDate);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, SUM(CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4))) AS Value
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')}) AND EventDate = @onDate
    GROUP BY EntityCode
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

// QUÉT TOÀN BỘ domain (KHÔNG lọc theo entityCodes — dùng khi CHƯA biết
// trước danh sách entity nào cần, vd tra "chain" (Mart/Minimart) của MỌI
// kho, hoặc liệt kê MỌI (kho, mã hàng) đang có dữ liệu để đối chiếu với 1
// danh sách ngoài như etl.CoreItemList) — lấy dòng GẦN NHẤT của MỖI entity,
// trả về NGUYÊN dimensionKeys yêu cầu dạng object. Có thể trả nhiều dòng
// (không giới hạn topN) — chấp nhận được vì lib/topSellingZeroStockRunner.js
// cũng đã quét nguyên domain kiểu tương tự cho bước xếp hạng.
async function loadLatestDimensionsForDomain(pool, domain, dimensionKeys) {
  dimensionKeys.forEach(assertSafeFieldKey);
  const selectCols = dimensionKeys.map(k => `JSON_VALUE(Dimensions, '$.${k}') AS [${k}]`).join(', ');
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  const result = await request.query(`
    SELECT EntityCode, EventDate, ${selectCols} FROM (
      SELECT EntityCode, EventDate, Dimensions,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain
    ) latest WHERE rn = 1
  `);
  const out = new Map();
  for (const row of result.recordset) {
    const dimensions = {};
    for (const k of dimensionKeys) dimensions[k] = row[k];
    out.set(row.EntityCode, { eventDate: row.EventDate, dimensions });
  }
  return out;
}

module.exports = {
  todayUTC, assertSafeFieldKey, buildEntityCodeParams,
  loadLatestMeasureBefore, loadLatestMeasure, loadLatestMeasureWithDate, loadSumOnDate,
  loadLatestDimensionsForDomain
};
