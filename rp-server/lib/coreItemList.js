// lib/coreItemList.js — Đọc etl.CoreItemList (CSDL HCRC_ETL, dùng lại CHUNG
// pool "ETL_DIEM_STK" với lib/diemStkMapping.js — CHỈ ĐỌC, cùng login
// etl_diem_stk_reader đã được cấp thêm quyền SELECT bảng này, xem
// etl-db/grants.sql) — danh sách mặt hàng "Core" (BẮT BUỘC luôn phải có
// hàng) do admin tự khai/upload theo LoaiDiem ('MART'/'MINIMART'), dùng cho
// lib/coreZeroStockRunner.js. Khác lib/diemStkMapping.js ở chỗ khoá tra là
// MaHang (SKU_CODE), không phải mã Điểm.
//
// Cache TTL ngắn (60s, cùng quy ước lib/diemStkMapping.js/lib/permissions.js)
// — bảng này ít đổi (chỉ đổi khi admin upload lại), tránh mỗi lượt chạy báo
// cáo Core stock=0 đều round-trip CSDL riêng.
//
// LỖI KẾT NỐI KHÔNG NÉM RA NGOÀI — trả về Map RỖNG kèm cảnh báo console,
// cùng lý do đã áp dụng ở lib/diemStkMapping.js: 1 nguồn dữ liệu phụ không
// được chặn đứng cả báo cáo (rơi về "không có mã Core nào" — báo cáo trả
// rows rỗng thay vì lỗi 500).
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, byLoaiDiem: Map<loaiDiem, Map<maHang, {mh, tenHang, dvt, maNganh, tenNganh}>> }

async function loadCoreItemList() {
  if (cache && cache.expiresAt > Date.now()) return cache.byLoaiDiem;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    const result = await pool.request().query('SELECT LoaiDiem, MaHang, MH, TenHang, Dvt, MaNganh, TenNganh FROM etl.CoreItemList');
    const byLoaiDiem = new Map();
    for (const r of result.recordset) {
      if (!byLoaiDiem.has(r.LoaiDiem)) byLoaiDiem.set(r.LoaiDiem, new Map());
      byLoaiDiem.get(r.LoaiDiem).set(r.MaHang, {
        mh: r.MH || null,
        tenHang: r.TenHang || null,
        dvt: r.Dvt || null,
        maNganh: r.MaNganh || null,
        tenNganh: r.TenNganh || null
      });
    }
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, byLoaiDiem };
    return byLoaiDiem;
  } catch (err) {
    console.warn(`⚠️  [coreItemList] Không đọc được etl.CoreItemList (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo Core stock=0 sẽ tạm trả về RỖNG cho tới khi kết nối lại được: ${err.message}`);
    return new Map();
  }
}

// Tập hợp MaHang thuộc diện Core của 1 LoaiDiem cụ thể — dùng để LỌC danh
// sách (kho, mã hàng) ứng viên trong lib/coreZeroStockRunner.js. LoaiDiem
// chưa từng upload (không có trong bảng) -> Set rỗng, không phải lỗi.
async function loadCoreMaHangSet(loaiDiem) {
  const byLoaiDiem = await loadCoreItemList();
  const forLoaiDiem = byLoaiDiem.get(loaiDiem);
  return forLoaiDiem ? new Set(forLoaiDiem.keys()) : new Set();
}

// Bản đầy đủ (kèm mh/tenHang/dvt/maNganh/tenNganh) của 1 LoaiDiem cụ thể —
// dùng để LÀM GIÀU mỗi dòng kết quả trong lib/coreZeroStockRunner.js (hiển
// thị thêm Đvt/Mã ngành/Tên ngành, khớp đúng khuôn cột file mẫu
// "Stock_Core_....xlsx" của khách hàng) — khác loadCoreMaHangSet() chỉ trả
// về Set để LỌC, không mang theo dữ liệu tham khảo.
async function loadCoreItemListMap(loaiDiem) {
  const byLoaiDiem = await loadCoreItemList();
  return byLoaiDiem.get(loaiDiem) || new Map();
}

module.exports = { loadCoreItemList, loadCoreMaHangSet, loadCoreItemListMap };
