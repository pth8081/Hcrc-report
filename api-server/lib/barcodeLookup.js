// lib/barcodeLookup.js — Dịch mã vạch (BẤT KỲ mã vạch nào đã đăng ký, KHÔNG
// chỉ mã mặc định) sang mã hàng (SKU_CODE), đọc domain `mavach_mahang` đã
// đồng bộ sẵn trong dwh.ReportFacts (job "Mã vạch theo SKU - Live
// (DSMART16)", xem etl/scripts/seedMaVachSync.js) — bản 10.75, SỬA LỖI
// THẬT: trước đây API "Giá bán" tra `maVach` trực tiếp trên domain
// `giaban_zone_sku` (vốn chỉ mang ĐÚNG 1 mã vạch MẶC ĐỊNH mỗi SKU từ
// `SKU_DEF.BARCODE`), bỏ sót mọi mã vạch PHỤ đăng ký trong `dbo.BARCODE`
// (1 SKU có thể có 2-3 mã vạch thật, xem "api-gia-ban-cho-doi-tac.md").
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, lookup: Map<MaVach, MaHangHienThi> }

async function loadBarcodeLookup() {
  if (cache && cache.expiresAt > Date.now()) return cache.lookup;

  const pool = await getPool('DWH');
  const result = await pool.request().query(`
    SELECT JSON_VALUE(Dimensions, '$.MaVach') AS MaVach, JSON_VALUE(Dimensions, '$.MaHangHienThi') AS MaHangHienThi
    FROM dwh.ReportFacts
    WHERE Domain = 'mavach_mahang'
  `);
  const lookup = new Map();
  for (const r of result.recordset) {
    if (r.MaVach && r.MaHangHienThi) lookup.set(r.MaVach, r.MaHangHienThi);
  }
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, lookup };
  return lookup;
}

module.exports = { loadBarcodeLookup };
