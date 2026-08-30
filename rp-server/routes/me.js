// routes/me.js — GET /api/me: thông tin người dùng hiện tại + cây menu ĐÃ LỌC
// theo quyền. Frontend dùng đúng danh sách này để vẽ sidebar VÀ để chặn route
// (RequireMenuAccess) — một nguồn sự thật duy nhất, không lệch giữa "menu
// hiển thị" và "menu được phép vào" (xem tài liệu kiến trúc, mục 06).
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth } = require('../lib/auth');
const { getUserContext } = require('../lib/permissions');

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

module.exports = router;
