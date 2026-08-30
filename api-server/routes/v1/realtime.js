// routes/v1/realtime.js — Tra cứu realtime từ CSDL OLTP (KHÔNG qua Data
// Warehouse) — tồn kho, điểm thẻ thành viên, voucher. Nguyên tắc riêng cho
// nhóm endpoint này (đã thống nhất trong tài liệu kiến trúc): đọc qua view
// riêng (schema api_rt trên chính CSDL OLTP), pool kết nối tách biệt
// (getPool('OLTP') trong db.js), tra đúng 1 khoá — KHÔNG có bộ lọc động,
// KHÔNG cache (hoặc cache rất ngắn nếu sau này cần).
//
// CHƯA CÓ tên view/cột thật — 3 route dưới đây là khung, đánh dấu TODO ở đúng
// chỗ cần thay khi có schema OLTP thật.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');

const router = express.Router();
router.use(requireApiKey('realtime'));

router.get('/inventory/:sku', async (req, res, next) => {
  try {
    const pool = await getPool('OLTP');
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
    const pool = await getPool('OLTP');
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
    const pool = await getPool('OLTP');
    const result = await pool.request()
      .input('code', sql.NVarChar(50), req.params.code)
      // TODO: đổi "api_rt.Voucher" + tên cột cho đúng view thật khi có schema OLTP
      .query('SELECT MaVoucher, TrangThai, GiaTri, HanSuDung FROM api_rt.Voucher WHERE MaVoucher = @code');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy voucher' });
    res.json(result.recordset[0]);
  } catch (err) { next(err); }
});

module.exports = router;
