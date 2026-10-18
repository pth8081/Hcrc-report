// lib/nsoStores.js — Đọc etl.NsoStores (CSDL HCRC_ETL, dùng lại CHUNG pool
// "ETL_DIEM_STK" với lib/diemStkMapping.js/coreItemList.js — CHỈ ĐỌC, cùng
// login etl_diem_stk_reader đã được cấp thêm quyền SELECT bảng này, xem
// etl-db/grants.sql) — danh sách mã Điểm đang ở trạng thái NSO ("New Store
// Opening", mới mở) do admin tự khai/upload qua etl-admin trang "Siêu thị
// NSO" (bản 9.63, theo yêu cầu người dùng). Dùng cho
// lib/nganhHangBrgRunner.js tách khối "LFL" (mã Điểm KHÔNG có trong danh
// sách này — ổn định) khỏi khối "NSO" (mã Điểm CÓ trong danh sách).
//
// Cache TTL ngắn (60s, cùng quy ước lib/diemStkMapping.js/lib/coreItemList.js)
// — bảng này ít đổi, tránh mỗi lượt chạy báo cáo đều round-trip CSDL riêng.
//
// LỖI KẾT NỐI KHÔNG NÉM RA NGOÀI — trả về Set RỖNG kèm cảnh báo (coi như
// KHÔNG mã Điểm nào là NSO, mọi siêu thị rơi về khối LFL) — cùng nguyên
// tắc đã áp dụng cho diemStkMapping.js/coreItemList.js: 1 nguồn dữ liệu phụ
// không được chặn đứng cả báo cáo.
const { getPool } = require('../db');
const { logWarn } = require('./systemLog');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, maDiems: Set<string> }

async function loadNsoMaDiemSet() {
  if (cache && cache.expiresAt > Date.now()) return cache.maDiems;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    // IsActive = 0 (đã "Khoá" ở etl-admin) -> BỎ QUA, coi như KHÔNG CÓ
    // trong danh sách NSO (rơi về LFL) — cùng hành vi IsActive của
    // etl.DiemStkMapping.
    const result = await pool.request().query('SELECT MaDiem FROM etl.NsoStores WHERE IsActive = 1');
    const maDiems = new Set(result.recordset.map(r => r.MaDiem));
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, maDiems };
    return maDiems;
  } catch (err) {
    logWarn(`⚠️ [nsoStores] Không đọc được etl.NsoStores (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo sẽ tạm coi MỌI siêu thị là LFL cho tới khi kết nối lại được: ${err.message}`);
    return new Set();
  }
}

module.exports = { loadNsoMaDiemSet };
