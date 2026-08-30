// routes/menuItems.js — Danh sách đầy đủ cây menu (KHÔNG lọc theo quyền — trái
// với routes/me.js) — dùng để vẽ checkbox trên trang gán quyền (routes/roles.js).
const express = require('express');
const { getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-permissions'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request()
      .query('SELECT Id, Code, ParentId, Label, Path, SortOrder FROM app.MenuItems ORDER BY SortOrder');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

module.exports = router;
