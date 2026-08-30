// scripts/seedAdmin.js — Tạo tài khoản quản trị ĐẦU TIÊN cho api-admin/.
// Cách dùng:
//   node scripts/seedAdmin.js <username> <password> "<Họ tên>" [admin|viewer]
// role mặc định "admin" nếu không truyền.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');

async function main() {
  const [username, password, fullName, role = 'admin'] = process.argv.slice(2);
  if (!username || !password || !fullName) {
    console.error('Cách dùng: node scripts/seedAdmin.js <username> <password> "<Họ tên>" [admin|viewer]');
    process.exit(1);
  }
  if (!['admin', 'viewer'].includes(role)) {
    console.error('Role phải là "admin" hoặc "viewer".');
    process.exit(1);
  }

  const pool = await getPool('ADMIN');

  const existing = await pool.request().input('username', sql.NVarChar(50), username)
    .query('SELECT Id FROM admin.AdminUsers WHERE Username = @username');
  if (existing.recordset.length) {
    console.error(`⛔ Username "${username}" đã tồn tại.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .input('passwordHash', sql.NVarChar(200), passwordHash)
    .input('fullName', sql.NVarChar(200), fullName)
    .input('role', sql.VarChar(20), role)
    .query(`
      INSERT INTO admin.AdminUsers (Username, PasswordHash, FullName, Role)
      OUTPUT INSERTED.Id
      VALUES (@username, @passwordHash, @fullName, @role)
    `);

  console.log(`✅ Đã tạo tài khoản quản trị "${username}" (Id ${result.recordset[0].Id}), vai trò ${role}.`);
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
