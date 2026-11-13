// lib/barcodeLookup.js — Dịch mã vạch (BẤT KỲ mã vạch nào đã đăng ký, KHÔNG
// chỉ mã mặc định) sang mã hàng (SKU_CODE), đọc domain `mavach_mahang` đã
// đồng bộ sẵn trong dwh.ReportFacts (job "Mã vạch theo SKU - Live
// (DSMART16)", xem etl/scripts/seedMaVachSync.js) — bản 10.75, SỬA LỖI
// THẬT: trước đây API "Giá bán" tra `maVach` trực tiếp trên domain
// `giaban_zone_sku` (vốn chỉ mang ĐÚNG 1 mã vạch MẶC ĐỊNH mỗi SKU từ
// `SKU_DEF.BARCODE`), bỏ sót mọi mã vạch PHỤ đăng ký trong `dbo.BARCODE`
// (1 SKU có thể có 2-3 mã vạch thật, xem "api-gia-ban-cho-doi-tac.md").
//
// bản 10.76 — thêm `loadAltBarcodesBySku()` (chiều NGƯỢC: mã hàng -> TOÀN
// BỘ mã vạch), dùng cho API "Tồn kho" (lib/barcodeLookup.js trước đó chỉ có
// chiều mã vạch -> mã hàng, phục vụ API "Giá bán") — SỬA LỖI THẬT TƯƠNG TỰ
// bản 10.75: màn "Ghi Nhận" (HCRC Workspace) đối chiếu mã vạch quét dựa trên
// dữ liệu API "Tồn kho", mà API này trước đây cũng chỉ trả 1 mã vạch MẶC
// ĐỊNH (cột `maVach`) — quét đúng mã vạch PHỤ bị báo sai "không khớp". Gộp
// chung 1 lượt đọc `mavach_mahang` cho CẢ 2 chiều (tránh truy vấn lại 2
// lần) — xem api-server/routes/v1/reports.js (definition.attachAltBarcodes).
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, lookup: Map<MaVach, MaHangHienThi>, bySku: Map<MaHangHienThi, string[]> }

async function loadBarcodeData() {
  if (cache && cache.expiresAt > Date.now()) return cache;

  const pool = await getPool('DWH');
  const result = await pool.request().query(`
    SELECT JSON_VALUE(Dimensions, '$.MaVach') AS MaVach, JSON_VALUE(Dimensions, '$.MaHangHienThi') AS MaHangHienThi
    FROM dwh.ReportFacts
    WHERE Domain = 'mavach_mahang'
  `);
  const lookup = new Map();
  const bySku = new Map();
  for (const r of result.recordset) {
    if (!r.MaVach || !r.MaHangHienThi) continue;
    lookup.set(r.MaVach, r.MaHangHienThi);
    if (!bySku.has(r.MaHangHienThi)) bySku.set(r.MaHangHienThi, []);
    bySku.get(r.MaHangHienThi).push(r.MaVach);
  }
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, lookup, bySku };
  return cache;
}

async function loadBarcodeLookup() {
  return (await loadBarcodeData()).lookup;
}

async function loadAltBarcodesBySku() {
  return (await loadBarcodeData()).bySku;
}

module.exports = { loadBarcodeLookup, loadAltBarcodesBySku };
