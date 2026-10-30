// lib/diemStkMapping.js — Đọc etl.DiemStkMapping (CSDL ETL, pool RIÊNG
// "ETL_DIEM_STK", CHỈ ĐỌC) để dịch mã kho (STK_ID) sang mã Điểm + Tên siêu
// thị CHUẨN — bản 10.46, theo yêu cầu người dùng (API "Tồn kho" cho đối
// tác PHẢI trả tên siêu thị chuẩn, không phải tên kho gốc DSMART/mã kho
// trần).
//
// Bản RÚT GỌN của rp-server/lib/diemStkMapping.js — api-server CHỈ cần
// dịch theo CHIỀU STK_ID -> {maDiem, tenSieuThi} (buildStkIdLookup()),
// KHÔNG cần buildBuIdLookup()/remapRowsToDiem() (chỉ dùng cho báo cáo
// composite nội bộ, api-server không có khái niệm đó). KHÔNG dùng chung
// qua thư mục "shared/" — mỗi server tự chứa đủ code khi copy riêng lên
// máy chủ triển khai (xem tài liệu kiến trúc, mục 08).
//
// Kết nối ĐỘC LẬP HẲN với rp-server (pool riêng, .env riêng — xem
// .env.example mục "Ánh xạ Điểm - STK_ID") — api-server KHÔNG đi vòng qua
// rp-server để dịch tên, tránh 2 hệ thống phụ thuộc lẫn nhau.
//
// LỖI KẾT NỐI (.env chưa cấu hình ETL_DIEM_STK_*, hoặc CSDL tạm không tới
// được) KHÔNG NÉM RA NGOÀI — trả về Map RỖNG kèm cảnh báo console, để 1
// báo cáo cần dịch tên chỉ mất đúng phần tên siêu thị (rơi về
// "(chưa khai tên)"), không lỗi 500 cả báo cáo — cùng nguyên tắc đã áp
// dụng bên rp-server.
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, mapping: Map<maDiem, {maStkMoi:[], tenSieuThi}> }

function parseStkList(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

async function loadDiemStkMapping() {
  if (cache && cache.expiresAt > Date.now()) return cache.mapping;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    const result = await pool.request().query('SELECT MaDiem, MaStkMoi, TenSieuThi FROM etl.DiemStkMapping WHERE IsActive = 1');
    const mapping = new Map();
    for (const r of result.recordset) {
      mapping.set(r.MaDiem, {
        maStkMoi: parseStkList(r.MaStkMoi),
        tenSieuThi: r.TenSieuThi || null
      });
    }
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, mapping };
    return mapping;
  } catch (err) {
    console.warn(`⚠️  [diemStkMapping] Không đọc được etl.DiemStkMapping (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo cần dịch tên siêu thị sẽ tạm KHÔNG có tên cho tới khi đọc lại được: ${err.message}`);
    return new Map();
  }
}

// Dựng Map<STK_ID thô, {maDiem, tenSieuThi}> — CHỈ dùng MaStkMoi (mã kho
// HIỆN TẠI) — mirror đúng rp-server/lib/diemStkMapping.js:buildStkIdLookup().
function buildStkIdLookup(diemMapping) {
  const lookup = new Map();
  for (const [maDiem, info] of diemMapping) {
    for (const stk of info.maStkMoi) lookup.set(stk, { maDiem, tenSieuThi: info.tenSieuThi });
  }
  return lookup;
}

module.exports = { loadDiemStkMapping, buildStkIdLookup };
