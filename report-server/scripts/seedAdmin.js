// scripts/seedAdmin.js — Tạo tài khoản quản trị ĐẦU TIÊN, gán vai trò "admin"
// (đã được app/schema.sql seed sẵn). Không có giao diện nào tạo được tài
// khoản đầu tiên — trang "Phân quyền" bản thân nó cũng cần đăng nhập trước.
//
// Cách dùng:
//   node scripts/seedAdmin.js <username> <password> "<Họ tên>"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');

async function main() {
  const [username, password, fullName] = process.argv.slice(2);
  if (!username || !password || !fullName) {
    console.error('Cách dùng: node scripts/seedAdmin.js <username> <password> "<Họ tên>"');
    process.exit(1);
  }

  const pool = await getPool('RP');

  const role = await pool.request().query("SELECT Id FROM app.Roles WHERE Code = 'admin'");
  if (!role.recordset.length) {
    console.error('⛔ Chưa có vai trò "admin" — chạy app/schema.sql trước.');
    process.exit(1);
  }
  const adminRoleId = role.recordset[0].Id;

  const existing = await pool.request().input('username', sql.NVarChar(50), username)
    .query('SELECT Id FROM app.Users WHERE Username = @username');
  if (existing.recordset.length) {
    console.error(`⛔ Username "${username}" đã tồn tại.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .input('passwordHash', sql.NVarChar(200), passwordHash)
    .input('fullName', sql.NVarChar(200), fullName)
    .query(`
      INSERT INTO app.Users (Username, PasswordHash, FullName)
      OUTPUT INSERTED.Id
      VALUES (@username, @passwordHash, @fullName)
    `);
  const userId = result.recordset[0].Id;

  await pool.request()
    .input('userId', sql.Int, userId)
    .input('roleId', sql.Int, adminRoleId)
    .query('INSERT INTO app.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)');

  console.log(`✅ Đã tạo tài khoản quản trị "${username}" (Id ${userId}), vai trò admin.`);
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
