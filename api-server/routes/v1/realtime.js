// routes/v1/realtime.js — Tra cứu realtime từ CSDL OLTP (KHÔNG qua Data
// Warehouse) — tồn kho, điểm thẻ thành viên, voucher. Nguyên tắc riêng cho
// nhóm endpoint này (đã thống nhất trong tài liệu kiến trúc): đọc qua view
// riêng (schema api_rt trên chính CSDL OLTP), tra đúng 1 khoá — KHÔNG có bộ
// lọc động, KHÔNG cache (hoặc cache rất ngắn nếu sau này cần).
//
// Nguồn kết nối cho từng endpoint đọc từ api.RealtimeEndpoints/api.DataSources
// (cấu hình qua trang quản trị "Nguồn dữ liệu", KHÔNG còn OLTP_* tĩnh trong
// .env như trước — xem lib/dataSourcePool.js). CHƯA CÓ tên view/cột thật —
// các route dưới đây là khung, đánh dấu TODO ở đúng chỗ cần thay khi có
// schema OLTP thật.
//
// GET /:endpoint/list — DANH SÁCH phân trang (khác 3 route tra cứu 1 khoá ở
// dưới) — dùng khi bên gọi cần cả bảng, không phải tra 1 mã cụ thể (ví dụ:
// rp-server hiển thị "Báo cáo tồn kho realtime" — xem
// app.ReportCatalog.SourceType='apiRealtime'). Trả {columns, rows} cùng
// khuôn dạng với GET /v1/reports/:reportId/run để bên gọi xử lý thống nhất.
// ĐĂNG KÝ TRƯỚC 3 route tra 1 khoá bên dưới — nếu không, "/inventory/list"
// sẽ bị "/inventory/:sku" nuốt mất (khớp trước, coi "list" là giá trị sku).
const express = require('express');
const { sql } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { getPoolForEndpoint } = require('../../lib/dataSourcePool');

const router = express.Router();
router.use(requireApiKey('realtime'));

async function listQuery(req, res, next, { endpoint, columns, orderBy, buildQuery }) {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(parseInt(req.query.pageSize || '200', 10), 1000);
    const pool = await getPoolForEndpoint(endpoint);
    const result = await pool.request()
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('pageSize', sql.Int, pageSize)
      .query(buildQuery(orderBy));
    res.json({ page, pageSize, columns, rows: result.recordset });
  } catch (err) { next(err); }
}

router.get('/inventory/list', (req, res, next) => listQuery(req, res, next, {
  endpoint: 'inventory',
  columns: ['MaSKU', 'SoLuongTon', 'CapNhatLuc'],
  orderBy: 'MaSKU',
  // TODO: đổi "api_rt.TonKho" + tên cột cho đúng view thật khi có schema OLTP
  buildQuery: (orderBy) => `
    SELECT MaSKU, SoLuongTon, CapNhatLuc FROM api_rt.TonKho
    ORDER BY ${orderBy} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `
}));

router.get('/loyalty/list', (req, res, next) => listQuery(req, res, next, {
  endpoint: 'loyalty',
  columns: ['MaThe', 'DiemHienTai', 'CapNhatLuc'],
  orderBy: 'MaThe',
  // TODO: đổi "api_rt.DiemThe" + tên cột cho đúng view thật khi có schema OLTP
  buildQuery: (orderBy) => `
    SELECT MaThe, DiemHienTai, CapNhatLuc FROM api_rt.DiemThe
    ORDER BY ${orderBy} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `
}));

router.get('/vouchers/list', (req, res, next) => listQuery(req, res, next, {
  endpoint: 'vouchers',
  columns: ['MaVoucher', 'TrangThai', 'GiaTri', 'HanSuDung'],
  orderBy: 'MaVoucher',
  // TODO: đổi "api_rt.Voucher" + tên cột cho đúng view thật khi có schema OLTP
  buildQuery: (orderBy) => `
    SELECT MaVoucher, TrangThai, GiaTri, HanSuDung FROM api_rt.Voucher
    ORDER BY ${orderBy} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `
}));

router.get('/inventory/:sku', async (req, res, next) => {
  try {
    const pool = await getPoolForEndpoint('inventory');
    const result = await pool.request()
      .input('sku', sql.NVarChar(50), req.params.sku)
      // TODO: đổi "api_rt.TonKho" + tên cột cho đúng view thật khi có schema OLTP
      .query('SELECT MaSKU, SoLuongTon, CapNhatLuc FROM api_rt.TonKho WHERE MaSKU = @sku');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy SKU' });
    res.json(result.recordset[0]);
  } catch (err) { next(err); }
});

router.get('/loyalty/:memberCode', async (req, res, next) => {
  try {
    const pool = await getPoolForEndpoint('loyalty');
    const result = await pool.request()
      .input('memberCode', sql.NVarChar(50), req.params.memberCode)
      // TODO: đổi "api_rt.DiemThe" + tên cột cho đúng view thật khi có schema OLTP
      .query('SELECT MaThe, DiemHienTai, CapNhatLuc FROM api_rt.DiemThe WHERE MaThe = @memberCode');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy mã thẻ' });
    res.json(result.recordset[0]);
  } catch (err) { next(err); }
});

router.get('/vouchers/:code', async (req, res, next) => {
  try {
    const pool = await getPoolForEndpoint('vouchers');
    const result = await pool.request()
      .input('code', sql.NVarChar(50), req.params.code)
      // TODO: đổi "api_rt.Voucher" + tên cột cho đúng view thật khi có schema OLTP
      .query('SELECT MaVoucher, TrangThai, GiaTri, HanSuDung FROM api_rt.Voucher WHERE MaVoucher = @code');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy voucher' });
    res.json(result.recordset[0]);
  } catch (err) { next(err); }
});

module.exports = router;
