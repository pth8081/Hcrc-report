// routes/admin/users.js — api-admin/ TRƯỚC ĐÂY không có route nào quản lý
// admin.AdminUsers (tạo/sửa tài khoản vẫn qua scripts/seedAdmin.js, DBA tự
// chạy tay — quy mô nhỏ, không cần CRUD đầy đủ như etl-admin/rp-user). File
// này CHỈ thêm đúng 2 việc cần cho tính năng 2FA bắt buộc: xem danh sách để
// biết còn admin nào khác không, và "Đặt lại 2FA" giúp admin khác bị mất
// thiết bị — KHÔNG thêm tạo/sửa/xoá tài khoản (vẫn giữ nguyên qua seedAdmin.js).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Username, FullName, Role, IsActive, TwoFactorEnabled, CreatedAt, LastLoginAt FROM admin.AdminUsers ORDER BY Username
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// "Đặt lại 2FA" — 1 admin gỡ 2FA giúp admin KHÁC bị mất thiết bị/cần khôi
// phục (xem lib/twoFactor.js). Xoá sạch secret + mã khôi phục cũ — lần đăng
// nhập kế tiếp của tài khoản đó bị bắt đăng ký 2FA lại từ đầu trước khi vào
// được gì khác (2FA vẫn BẮT BUỘC, không phải "tắt hẳn"). Thao tác NHẠY CẢM
// (bỏ lớp bảo vệ thứ 2 của người khác) — LUÔN ghi audit log rõ ai gỡ cho ai.
router.post('/:id/reset-2fa', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const targetResult = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT Username, Role FROM admin.AdminUsers WHERE Id = @id');
    const target = targetResult.recordset[0];
    if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (target.Role !== 'admin') return res.status(400).json({ error: '2FA chỉ áp dụng cho vai trò admin' });

    await pool.request().input('id', sql.Int, req.params.id)
      .query('UPDATE admin.AdminUsers SET TwoFactorEnabled = 0, TwoFactorSecretEncrypted = NULL, TwoFactorEnrolledAt = NULL WHERE Id = @id');
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM admin.AdminTwoFactorRecoveryCodes WHERE AdminUserId = @id');

    await logAction(req, {
      module: 'Phân quyền', actionType: 'DAT_LAI_2FA', targetObject: req.params.id,
      description: `Đặt lại 2FA cho tài khoản "${target.Username}" (#${req.params.id}) — lần đăng nhập kế tiếp phải đăng ký lại`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
