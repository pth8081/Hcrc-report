// routes/categories.js — Trang "Danh mục": CRUD app.Categories, một bảng
// dùng chung cho nhiều danh mục nhỏ (Phòng ban, Đơn vị tính...), phân biệt
// bằng CategoryType.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-categories'));

router.get('/types', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DISTINCT CategoryType FROM app.Categories ORDER BY CategoryType');
    res.json(result.recordset.map(r => r.CategoryType));
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const request = pool.request();
    let query = 'SELECT Id, CategoryType, Code, Name, ParentId, SortOrder, IsActive FROM app.Categories';
    if (req.query.type) {
      request.input('type', sql.VarChar(50), req.query.type);
      query += ' WHERE CategoryType = @type';
    }
    query += ' ORDER BY CategoryType, SortOrder';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { categoryType, code, name, parentId = null, sortOrder = 0 } = req.body || {};
    if (!categoryType || !code || !name) return res.status(400).json({ error: 'Thiếu categoryType/code/name' });
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('categoryType', sql.VarChar(50), categoryType)
      .input('code', sql.VarChar(50), code)
      .input('name', sql.NVarChar(200), name)
      .input('parentId', sql.Int, parentId)
      .input('sortOrder', sql.Int, sortOrder)
      .query(`
        INSERT INTO app.Categories (CategoryType, Code, Name, ParentId, SortOrder)
        OUTPUT INSERTED.Id
        VALUES (@categoryType, @code, @name, @parentId, @sortOrder)
      `);
    await logAction(req, { module: 'Danh mục', actionType: 'TAO_DANH_MUC', targetObject: `${categoryType}/${code}`, description: `Tạo danh mục "${name}"` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Mã danh mục đã tồn tại trong loại này' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, sortOrder, isActive } = req.body || {};
    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .input('sortOrder', sql.Int, sortOrder ?? 0)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE app.Categories SET Name = @name, SortOrder = @sortOrder, IsActive = @isActive WHERE Id = @id');
    await logAction(req, { module: 'Danh mục', actionType: 'SUA_DANH_MUC', targetObject: req.params.id, description: `Cập nhật danh mục #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.Categories WHERE Id = @id');
    await logAction(req, { module: 'Danh mục', actionType: 'XOA_DANH_MUC', targetObject: req.params.id, description: `Xoá danh mục #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
