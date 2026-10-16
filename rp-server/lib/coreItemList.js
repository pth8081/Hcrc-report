// lib/coreItemList.js — Đọc etl.CoreItemList (CSDL HCRC_ETL, dùng lại CHUNG
// pool "ETL_DIEM_STK" với lib/diemStkMapping.js — CHỈ ĐỌC, cùng login
// etl_diem_stk_reader đã được cấp thêm quyền SELECT bảng này, xem
// etl-db/grants.sql) — danh sách mặt hàng "Core" (BẮT BUỘC luôn phải có
// hàng) do admin tự khai/upload, dùng cho lib/coreZeroStockRunner.js.
//
// SỬA bản 9.46 (theo yêu cầu người dùng, kèm file mẫu THẬT đang dùng —
// "Core thg 08.2024 Loại bỏ SKU ko hiệu quả") — TRƯỚC ĐÂY danh sách Core
// áp dụng CHUNG cho MỌI kho cùng LoaiDiem (MART/MINIMART), không phân biệt
// từng kho. File mẫu thật của người dùng có "Mã kho" RIÊNG từng dòng — 1
// mã hàng có thể là Core ở kho NÀY nhưng KHÔNG PHẢI Core ở kho KHÁC cùng
// loại điểm. Đổi khoá tra từ LoaiDiem -> MaKho (giữ LoaiDiem chỉ để LỌC
// đúng sheet/loại điểm khi tải báo cáo, xem loadCoreItemListByKho()).
// MaKho khớp ĐÚNG Dimensions.MaChiNhanh (STK_ID) đã đồng bộ ở domain
// bán hàng/tồn kho — so khớp TRỰC TIẾP, KHÔNG qua "Ánh xạ Điểm - STK_ID"
// (khác lib/diemStkMapping.js — ở đây đã có sẵn đúng mã kho thật theo
// từng dòng trong file người dùng tự xuất ra, không cần suy luận).
//
// Cache TTL ngắn (60s, cùng quy ước lib/diemStkMapping.js/lib/permissions.js)
// — bảng này ít đổi (chỉ đổi khi admin upload lại), tránh mỗi lượt chạy báo
// cáo Core stock=0 đều round-trip CSDL riêng.
//
// LỖI KẾT NỐI KHÔNG NÉM RA NGOÀI — trả về Map RỖNG kèm cảnh báo, cùng lý do
// đã áp dụng ở lib/diemStkMapping.js: 1 nguồn dữ liệu phụ không được chặn
// đứng cả báo cáo (rơi về "không có mã Core nào" — báo cáo trả rows rỗng
// thay vì lỗi 500). SỬA bản 9.49 (theo báo cáo người dùng — trang "Danh
// sách hàng Core" (etl-admin, đọc qua pool "ADMIN") hiện ĐÚNG 26234 dòng
// MART, nhưng báo cáo "Core stock = 0" (rp-server, đọc qua pool RIÊNG
// "ETL_DIEM_STK" — login etl_diem_stk_reader khác hẳn, xem đầu file) lại
// báo "Chưa có danh sách hàng Core" — 2 pool trỏ CÙNG 1 bảng etl.CoreItemList
// nhưng CÓ THỂ khác server/database nếu .env cấu hình lệch (xem
// ETL_DIEM_STK_SERVER/ETL_DIEM_STK_DATABASE trong .env.example), hoặc lỗi
// kết nối/quyền TRƯỚC ĐÂY chỉ console.warn (không ai xem được trừ khi SSH
// vào server) khiến không phân biệt được "thật sự rỗng" với "đọc lỗi,
// Map rỗng giả"). Đổi sang logWarn (lib/systemLog.js — ghi CẢ console LẪN
// app.SystemLog, xem được qua rp-user Hệ thống → Log) + lưu lại lỗi gần
// nhất để lib/coreZeroStockRunner.js phân biệt rõ 2 trường hợp trong
// warning trả về cho người xem báo cáo, KHÔNG còn gộp chung 1 thông báo
// "chưa upload" gây hiểu nhầm khi thực chất là lỗi kết nối.
const { getPool } = require('../db');
const { logWarn } = require('./systemLog');

const CACHE_TTL_MS = 60 * 1000;
// { expiresAt, byLoaiDiem: Map<loaiDiem, Map<maKho, Map<maHang, ref>>> }
// ref = {mh, maDiem, tenHang, dvt, maNganh, tenNganh, maNCC, tenNCC, luongGiaoHang}
let cache = null;
let lastLoadError = null; // Error gần nhất, null nếu lần đọc gần nhất thành công

async function loadCoreItemList() {
  if (cache && cache.expiresAt > Date.now()) return cache.byLoaiDiem;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    const result = await pool.request().query(`
      SELECT LoaiDiem, MaKho, MaDiem, MaHang, MH, TenHang, Dvt, MaNganh, TenNganh, MaNCC, TenNCC, LuongGiaoHang
      FROM etl.CoreItemList
    `);
    const byLoaiDiem = new Map();
    for (const r of result.recordset) {
      if (!byLoaiDiem.has(r.LoaiDiem)) byLoaiDiem.set(r.LoaiDiem, new Map());
      const byKho = byLoaiDiem.get(r.LoaiDiem);
      if (!byKho.has(r.MaKho)) byKho.set(r.MaKho, new Map());
      byKho.get(r.MaKho).set(r.MaHang, {
        mh: r.MH || null,
        maDiem: r.MaDiem || null,
        tenHang: r.TenHang || null,
        dvt: r.Dvt || null,
        maNganh: r.MaNganh || null,
        tenNganh: r.TenNganh || null,
        maNCC: r.MaNCC || null,
        tenNCC: r.TenNCC || null,
        luongGiaoHang: r.LuongGiaoHang || null
      });
    }
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, byLoaiDiem };
    lastLoadError = null;
    return byLoaiDiem;
  } catch (err) {
    lastLoadError = err;
    logWarn(`⚠️ [coreItemList] Không đọc được etl.CoreItemList (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo Core stock=0 sẽ tạm trả về RỖNG cho tới khi kết nối lại được: ${err.message}`);
    return new Map();
  }
}

// Bản đầy đủ (Map<maKho, Map<maHang, ref>>) của 1 LoaiDiem cụ thể — dùng
// để vừa LỌC vừa LÀM GIÀU mỗi dòng kết quả trong lib/coreZeroStockRunner.js
// (so khớp ĐÚNG kho + mã hàng, hiển thị thêm Đvt/Mã ngành/Tên ngành/NCC/
// Luồng giao hàng). LoaiDiem chưa từng upload (không có trong bảng) -> Map
// rỗng, không phải lỗi.
async function loadCoreItemListByKho(loaiDiem) {
  const byLoaiDiem = await loadCoreItemList();
  return byLoaiDiem.get(loaiDiem) || new Map();
}

// Lỗi kết nối/đọc gần nhất (null nếu lần đọc gần nhất OK) — dùng ở
// lib/coreZeroStockRunner.js để phân biệt "Map rỗng vì CHƯA UPLOAD" với
// "Map rỗng vì ĐỌC LỖI" (2 nguyên nhân rất khác nhau, trước đây báo cáo
// hiện CÙNG 1 thông báo gây hiểu nhầm).
function getLastLoadError() {
  return lastLoadError;
}

module.exports = { loadCoreItemList, loadCoreItemListByKho, getLastLoadError };
