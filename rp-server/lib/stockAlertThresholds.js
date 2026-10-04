// lib/stockAlertThresholds.js — Đọc etl.StockAlertThresholds (CSDL
// HCRC_ETL, dùng lại CHUNG pool "ETL_DIEM_STK" với lib/diemStkMapping.js/
// lib/coreItemList.js — CHỈ ĐỌC) — ngưỡng cảnh báo tồn kho do admin tự
// khai/upload theo ĐÚNG cặp (MaHang, MaDiem), dùng cho
// lib/stockAlertRunner.js. Khác lib/coreItemList.js ở chỗ mỗi dòng có
// NGƯỠNG RIÊNG (NguongCanhBao) thay vì chỉ là danh sách mã hàng.
//
// Cache TTL ngắn (60s, cùng quy ước các lib tra cứu phụ khác) — bảng này ít
// đổi (chỉ đổi khi admin upload lại).
//
// LỖI KẾT NỐI KHÔNG NÉM RA NGOÀI — trả về mảng RỖNG kèm cảnh báo console,
// cùng lý do đã áp dụng ở lib/diemStkMapping.js/lib/coreItemList.js.
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, rows: [{maHang, maDiem, nguongCanhBao, tenHang, nhaCungCap}] }

async function loadStockAlertThresholds() {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    const result = await pool.request().query('SELECT MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap FROM etl.StockAlertThresholds');
    const rows = result.recordset.map(r => ({
      maHang: r.MaHang,
      maDiem: r.MaDiem,
      nguongCanhBao: Number(r.NguongCanhBao),
      tenHang: r.TenHang || null,
      nhaCungCap: r.NhaCungCap || null
    }));
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, rows };
    return rows;
  } catch (err) {
    console.warn(`⚠️  [stockAlertThresholds] Không đọc được etl.StockAlertThresholds (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo Cảnh báo hàng tồn sẽ tạm trả về RỖNG cho tới khi kết nối lại được: ${err.message}`);
    return [];
  }
}

module.exports = { loadStockAlertThresholds };
