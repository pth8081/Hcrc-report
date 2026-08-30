// lib/auditLog.js — Ghi một dòng vào admin.AuditLog (module "Nhật ký thao
// tác" trên api-admin/) — khác api.RequestLog (log GỌI API của đối tác
// ngoài, xem lib/requestLogger.js). Lỗi khi ghi log KHÔNG được làm hỏng
// request gốc — luôn nuốt lỗi, chỉ log ra console để không biến một thao
// tác nghiệp vụ thành công thành lỗi 500 chỉ vì ghi nhật ký thất bại. Cùng
// khuôn với rp-server/lib/auditLog.js, chỉ khác đọc req.admin (JWT payload
// api-admin — xem lib/adminAuth.js) thay vì req.user.
const { sql, getPool } = require('../db');

async function logAction(req, { module, actionType, targetObject = null, description, status = 'SUCCESS' }) {
  try {
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('userId', sql.Int, req.admin?.sub || null)
      .input('username', sql.NVarChar(50), req.admin?.username || 'unknown')
      .input('module', sql.VarChar(50), module)
      .input('actionType', sql.VarChar(100), actionType)
      .input('targetObject', sql.NVarChar(200), targetObject)
      .input('description', sql.NVarChar(sql.MAX), description)
      .input('ipAddress', sql.VarChar(100), req.ip || null)
      .input('status', sql.VarChar(20), status)
      .query(`
        INSERT INTO admin.AuditLog (UserId, Username, Module, ActionType, TargetObject, Description, IpAddress, Status)
        VALUES (@userId, @username, @module, @actionType, @targetObject, @description, @ipAddress, @status)
      `);
  } catch (err) {
    console.error('⚠️  Ghi audit log thất bại:', err.message);
  }
}

module.exports = { logAction };
