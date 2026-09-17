// routes/me.js — GET /api/me: thông tin người dùng hiện tại + cây menu ĐÃ LỌC
// theo quyền. Frontend dùng đúng danh sách này để vẽ sidebar VÀ để chặn route
// (RequireMenuAccess) — một nguồn sự thật duy nhất, không lệch giữa "menu
// hiển thị" và "menu được phép vào" (xem tài liệu kiến trúc, mục 06).
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { requireAuth, COOKIE_NAME } = require('../lib/auth');
const { getUserContext } = require('../lib/permissions');
const { revokeSessions } = require('../lib/sessionRevocation');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const context = await getUserContext(req.user.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });

    const pool = await getPool('RP');
    const result = await pool.request()
      .query('SELECT Id, Code, ParentId, Label, Path, SortOrder FROM app.MenuItems ORDER BY SortOrder');

    const allowed = context.isSystemRole
      ? result.recordset
      : result.recordset.filter(m => context.menuCodes.has(m.Code));

    // Cha có ít nhất 1 con được phép -> vẫn hiện cha (vd "Hệ thống" hiện
    // được nếu chỉ được vào đúng "Danh mục" bên trong).
    const allowedIds = new Set(allowed.map(m => m.Id));
    for (const m of allowed) {
      if (m.ParentId) allowedIds.add(m.ParentId);
    }
    const menuTree = result.recordset
      .filter(m => allowedIds.has(m.Id))
      .map(m => ({ code: m.Code, parentId: m.ParentId, label: m.Label, path: m.Path }));

    res.json({
      username: context.username,
      fullName: context.fullName,
      roles: context.roles,
      isSystemRole: context.isSystemRole,
      menu: menuTree
    });
  } catch (err) { next(err); }
});

// Tự đổi mật khẩu CỦA CHÍNH MÌNH (trang "Tài khoản của tôi") — KHÁC hẳn
// POST /system/users/:id/reset-password (Admin hệ thống đặt lại cho NGƯỜI
// KHÁC, không cần biết mật khẩu cũ). Route này bất kỳ ai đã đăng nhập cũng
// gọi được cho CHÍNH tài khoản mình (req.user.sub, không nhận :id) — bắt
// buộc đúng mật khẩu HIỆN TẠI mới cho đổi. CHỈ áp dụng AuthSource='local' —
// tài khoản 'hcrcWorkspace' không có mật khẩu local nào ở đây để đổi (mật
// khẩu của họ do HCRC Workspace quản lý, ngoài phạm vi hệ thống này).
// Đổi xong THU HỒI mọi phiên (kể cả phiên hiện tại) rồi xoá cookie — bắt
// đăng nhập lại bằng mật khẩu mới ngay.
router.post('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Thiếu mật khẩu hiện tại/mật khẩu mới' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });

    const pool = await getPool('RP');
    const result = await pool.request().input('id', sql.Int, req.user.sub)
      .query("SELECT PasswordHash, AuthSource FROM app.Users WHERE Id = @id");
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (row.AuthSource !== 'local' || !row.PasswordHash) {
      return res.status(400).json({ error: 'Tài khoản xác thực qua HCRC Workspace — đổi mật khẩu ở đó, không đổi được ở đây' });
    }
    if (!(await bcrypt.compare(currentPassword, row.PasswordHash))) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.request().input('id', sql.Int, req.user.sub).input('passwordHash', sql.NVarChar(200), passwordHash)
      .query('UPDATE app.Users SET PasswordHash = @passwordHash WHERE Id = @id');
    await revokeSessions(req.user.sub);
    res.clearCookie(COOKIE_NAME);
    await logAction(req, { module: 'Tài khoản', actionType: 'TU_DOI_MAT_KHAU', targetObject: String(req.user.sub), description: 'Tự đổi mật khẩu' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
