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

// `daysAgoUTC(n)` (bản 9.83) — mốc ngày lùi `n` ngày trước hôm nay, dùng
// làm `sinceDate` cho loadLatestDimensionsForDomain() ở các domain tồn
// kho lớn (xem chú thích đầy đủ ở hàm đó) — 35 ngày đủ dư so với chu kỳ
// đồng bộ HẰNG NGÀY thật (an toàn qua cả những đợt mất đồng bộ vài ngày
// liên tục như sự cố mạng/ETL kẹt đã gặp), không phải con số nghiệp vụ
// cố định, chỉ cần ĐỦ RỘNG để luôn chứa dòng GẦN NHẤT của mọi thực thể
// còn hoạt động.
function daysAgoUTC(n) {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
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

// SỬA LỖI (bản 9.44, phát hiện qua báo cáo người dùng — "Top bán chạy đang
// tồn kho = 0" trả 500 khi lọc "Tất cả" chi nhánh) — SQL Server CHỈ nhận
// tối đa 2100 tham số/câu lệnh. 4 hàm bên dưới gắn 1 tham số RIÊNG cho MỖI
// EntityCode trong mảng `entityCodes` (buildEntityCodeParams, phòng SQL
// injection — KHÔNG nội suy chuỗi trực tiếp) — mảng đó từ bản 9.43 không
// còn bị cắt Top N TRƯỚC khi gọi các hàm này nữa (xem
// lib/topSellingZeroStockRunner.js — tính tồn kho cho MỌI thực thể có bán
// trong kỳ TRƯỚC khi xếp hạng), nên 1 chuỗi siêu thị thật (hàng chục chi
// nhánh × hàng nghìn SKU) dễ vượt 2100 EntityCode/lượt, SQL Server từ chối
// cả câu lệnh (lỗi "The incoming request has too many parameters") ->
// 500. CHIA NHỎ `entityCodes` thành nhiều lượt query (CHUNK_SIZE an toàn,
// chừa chỗ cho 1-2 tham số khác như domain/ngày mốc), chạy song song rồi
// GỘP kết quả lại — hành vi trả về (Map EntityCode -> giá trị) giữ NGUYÊN,
// nơi gọi không cần đổi gì.
const ENTITY_CODE_CHUNK_SIZE = 1900;
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Chạy `runChunk(chunk)` (trả về 1 Map hoặc mảng cặp [key,value]) cho từng
// lô EntityCode, GỘP tất cả Map kết quả lại thành 1 Map duy nhất — dùng
// chung cho cả 4 hàm loadLatestMeasure*/loadSumOnDate bên dưới.
async function mapOverEntityCodeChunks(entityCodes, runChunk) {
  const chunks = chunkArray(entityCodes, ENTITY_CODE_CHUNK_SIZE);
  const chunkResults = await Promise.all(chunks.map(runChunk));
  const merged = new Map();
  for (const m of chunkResults) for (const [k, v] of m) merged.set(k, v);
  return merged;
}

// Dòng GẦN NHẤT TRƯỚC 1 ngày mốc (dùng cho tồn kho "hôm qua") — KHÔNG lấy
// dòng của chính ngày mốc hay sau đó, để luôn là số liệu ĐÃ CHỐT SỔ, không
// lẫn số liệu đang cập nhật dở trong ngày.
async function loadLatestMeasureBefore(pool, domain, entityCodes, measureKey, beforeDate) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  return mapOverEntityCodeChunks(entityCodes, async (chunk) => {
    const request = pool.request();
    request.input('domain', sql.VarChar(50), domain);
    request.input('beforeDate', sql.Date, beforeDate);
    const codeParams = buildEntityCodeParams(request, chunk);
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
    return result.recordset.map(r => [r.EntityCode, r.Value]);
  });
}

// Dòng GẦN NHẤT bất kỳ ngày nào (dùng cho "Chờ nhập"/"Chờ giao" — số lượng
// đang treo TẠI THỜI ĐIỂM chạy báo cáo, VIEW nguồn tự tính lại mỗi lần đồng
// bộ) — khác loadLatestMeasureBefore ở chỗ không giới hạn "trước 1 ngày
// mốc", lấy đúng số liệu MỚI NHẤT đã đồng bộ.
async function loadLatestMeasure(pool, domain, entityCodes, measureKey) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  return mapOverEntityCodeChunks(entityCodes, async (chunk) => {
    const request = pool.request();
    request.input('domain', sql.VarChar(50), domain);
    const codeParams = buildEntityCodeParams(request, chunk);
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
    return result.recordset.map(r => [r.EntityCode, r.Value]);
  });
}

// Như loadLatestMeasure() nhưng trả THÊM EventDate của đúng dòng đó (dùng
// cho "Ngày đặt" đi kèm "SL đang đặt" — xem lib/coreZeroStockRunner.js) —
// {value, eventDate} thay vì chỉ value.
async function loadLatestMeasureWithDate(pool, domain, entityCodes, measureKey) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  return mapOverEntityCodeChunks(entityCodes, async (chunk) => {
    const request = pool.request();
    request.input('domain', sql.VarChar(50), domain);
    const codeParams = buildEntityCodeParams(request, chunk);
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
    return result.recordset.map(r => [r.EntityCode, { value: r.Value, eventDate: r.EventDate }]);
  });
}

// Dòng ĐÚNG 1 ngày cụ thể (dùng cho "Số lượng bán hôm nay"/"Đã nhập hôm
// nay" — LUÔN đúng nghĩa "hôm nay", không lùi ngày nếu chưa có dữ liệu).
// Domain có nhiều dòng cùng ngày (vd nhiều chứng từ) thì SUM lại.
async function loadSumOnDate(pool, domain, entityCodes, measureKey, onDate) {
  assertSafeFieldKey(measureKey);
  if (!entityCodes.length) return new Map();
  return mapOverEntityCodeChunks(entityCodes, async (chunk) => {
    const request = pool.request();
    request.input('domain', sql.VarChar(50), domain);
    request.input('onDate', sql.Date, onDate);
    const codeParams = buildEntityCodeParams(request, chunk);
    const result = await request.query(`
      SELECT EntityCode, SUM(CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4))) AS Value
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')}) AND EventDate = @onDate
      GROUP BY EntityCode
    `);
    return result.recordset.map(r => [r.EntityCode, r.Value]);
  });
}

// QUÉT TOÀN BỘ domain (KHÔNG lọc theo entityCodes — dùng khi CHƯA biết
// trước danh sách entity nào cần, vd tra "chain" (Mart/Minimart) của MỌI
// kho, hoặc liệt kê MỌI (kho, mã hàng) đang có dữ liệu để đối chiếu với 1
// danh sách ngoài như etl.CoreItemList) — lấy dòng GẦN NHẤT của MỖI entity,
// trả về NGUYÊN dimensionKeys yêu cầu dạng object. Có thể trả nhiều dòng
// (không giới hạn topN) — chấp nhận được vì lib/topSellingZeroStockRunner.js
// cũng đã quét nguyên domain kiểu tương tự cho bước xếp hạng.
//
// `sinceDate` (TUỲ CHỌN, bản 9.83, theo sự cố thật người dùng gặp
// 20/10/2026 — báo cáo "Core stock = 0" Timeout rồi hết connection pool,
// chẩn đoán bằng SELECT Domain, COUNT(*) FROM dwh.ReportFacts GROUP BY
// Domain: domain `tonkho_sku`/`tonkho_chitiet_sku` có 5-11 TRIỆU dòng —
// domain này giữ lịch sử MỖI NGÀY (KeepHistory, khác domain doanh thu TV
// chỉ 1 dòng/thực thể "cập nhật tại chỗ") — ROW_NUMBER() OVER (PARTITION
// BY EntityCode ORDER BY EventDate DESC) phải quét/sắp xếp TOÀN BỘ hàng
// triệu dòng đó MỖI LẦN chạy báo cáo dù chỉ cần đúng 1 dòng GẦN NHẤT/thực
// thể — giữ connection CSDL rất lâu, vài báo cáo chạy cùng lúc là cạn hết
// connection pool. CÓ TRUYỀN sinceDate → chỉ quét dữ liệu TỪ ngày đó trở
// đi (đồng bộ tồn kho hằng ngày nên dòng GẦN NHẤT/thực thể LUÔN nằm trong
// vài ngày gần đây — không mất dữ liệu đúng, chỉ bớt quét hàng chục/trăm
// lần dữ liệu CŨ không cần) — nơi gọi (coreZeroStockRunner.js/
// stockThresholdRunner.js/stockAlertRunner.js) truyền sinceDate cho lệnh
// gọi quét `stockDomain` (domain lớn); KHÔNG truyền (giữ unbounded, hành
// vi CŨ) cho lệnh gọi quét `chainDomain` (domain nhỏ hơn hẳn, không nằm
// trong danh sách domain lớn ở trên, chưa có bằng chứng cần bound).
async function loadLatestDimensionsForDomain(pool, domain, dimensionKeys, sinceDate = null) {
  dimensionKeys.forEach(assertSafeFieldKey);
  const selectCols = dimensionKeys.map(k => `JSON_VALUE(Dimensions, '$.${k}') AS [${k}]`).join(', ');
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  let dateFilter = '';
  if (sinceDate) {
    request.input('sinceDate', sql.Date, sinceDate);
    dateFilter = 'AND EventDate >= @sinceDate';
  }
  const result = await request.query(`
    SELECT EntityCode, EventDate, ${selectCols} FROM (
      SELECT EntityCode, EventDate, Dimensions,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain ${dateFilter}
    ) latest WHERE rn = 1
  `);
  // TRIM EntityCode VÀ từng giá trị Dimensions (bản 9.58, theo báo cáo
  // người dùng — báo cáo Core stock=0 báo "KHÔNG khớp" dù SQL tay xác nhận
  // ĐÚNG mã kho có thật trong domain) — nguồn DSMART dùng cột CHAR độ dài cố
  // định cho mã kho/mã chi nhánh, tự động đệm khoảng trắng cuối chuỗi; SSMS
  // hiển thị y hệt mã sạch (vd "12061") nên mắt nhìn không phát hiện được,
  // nhưng so sánh chuỗi JS (Set.has(), ===) coi "12061" và "12061 " là 2 giá
  // trị KHÁC NHAU. Áp dụng CHUNG ở đây (thay vì sửa riêng từng nơi gọi) vì
  // MỌI domain đọc qua hàm này đều có rủi ro y hệt, không riêng tonkho_sku.
  const out = new Map();
  for (const row of result.recordset) {
    const dimensions = {};
    for (const k of dimensionKeys) {
      const v = row[k];
      dimensions[k] = typeof v === 'string' ? v.trim() : v;
    }
    const entityCode = typeof row.EntityCode === 'string' ? row.EntityCode.trim() : row.EntityCode;
    out.set(entityCode, { eventDate: row.EventDate, dimensions });
  }
  return out;
}

module.exports = {
  todayUTC, daysAgoUTC, assertSafeFieldKey, buildEntityCodeParams,
  loadLatestMeasureBefore, loadLatestMeasure, loadLatestMeasureWithDate, loadSumOnDate,
  loadLatestDimensionsForDomain
};
