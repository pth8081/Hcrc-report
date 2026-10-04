// routes/admin/schemaMonitor.js — Trang "Giám sát cấu trúc CSDL" (bản 8.57,
// theo yêu cầu người dùng): xem trạng thái cấu trúc (tên + kiểu dữ liệu
// cột) của MỌI bảng nguồn mà các job đồng bộ đang bật phụ thuộc vào — job
// nền (etl/server.js, 6h sáng mỗi ngày, xem lib/schemaMonitor.js) đã kiểm
// tra sẵn + gửi email nếu lệch, trang chỉ đọc lại. Nút "Kiểm tra tất cả
// ngay" (POST /check-now) ép chạy lại NGAY — dùng ĐÚNG hàm runSchemaCheck()
// y hệt job nền.
const express = require('express');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess } = require('../../lib/adminPermissions');
const { runSchemaCheck, getStatusList } = require('../../lib/schemaMonitor');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('schema-monitor'));

router.get('/', async (req, res, next) => {
  try {
    res.json(await getStatusList());
  } catch (err) { next(err); }
});

router.post('/check-now', async (req, res, next) => {
  try {
    const { changedTables } = await runSchemaCheck();
    const rows = await getStatusList();
    await logAction(req, {
      module: 'Giám sát cấu trúc CSDL', actionType: 'KIEM_TRA_LAI',
      description: changedTables.length
        ? `Kiểm tra lại thủ công — phát hiện ${changedTables.length} bảng thay đổi cấu trúc`
        : 'Kiểm tra lại thủ công — mọi bảng đều khớp cấu trúc đã lưu'
    });
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
