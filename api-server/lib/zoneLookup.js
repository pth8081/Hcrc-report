// lib/zoneLookup.js — Dịch mã kho (STK_ID) sang vùng giá (ZONE_CODE), đọc
// domain `vung_gia_stk` đã đồng bộ sẵn trong dwh.ReportFacts (job "Vùng giá
// theo siêu thị - Live (DSMART16)", xem etl/scripts/seedVungGiaSync.js) —
// bản 10.71+, theo yêu cầu người dùng: API "Giá bán" KHÔNG được chạm
// DSMART16 trực tiếp mỗi lần đối tác gọi (xem
// "api-gia-ban-cho-doi-tac.md"), nên tra qua bản sao đã đồng bộ ở ĐÂY
// (dwh.ReportFacts, pool DWH đã có sẵn), KHÔNG mở thêm kết nối nào tới
// DSMART16.
//
// EntityCode của domain này ĐÃ được .trim() sẵn lúc đồng bộ (xem
// etl/lib/tableSyncEngine.js:transformRow()) — không cần RTRIM ở đây.
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, lookup: Map<STK_ID, ZoneCode> }

async function loadZoneLookup() {
  if (cache && cache.expiresAt > Date.now()) return cache.lookup;

  const pool = await getPool('DWH');
  const result = await pool.request().query(`
    SELECT EntityCode, JSON_VALUE(Dimensions, '$.ZONE_CODE') AS ZoneCode
    FROM dwh.ReportFacts
    WHERE Domain = 'vung_gia_stk'
  `);
  const lookup = new Map();
  for (const r of result.recordset) {
    if (r.EntityCode && r.ZoneCode) lookup.set(r.EntityCode, r.ZoneCode.trim());
  }
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, lookup };
  return lookup;
}

module.exports = { loadZoneLookup };
