// scripts/seedThanhVienReportPermissions.js — Gán quyền xem 2 báo cáo
// "Thành viên" (bc-doanh-thu-hcrc-thanh-vien/bc-doanh-thu-ldtd-thanh-vien)
// GIỐNG HỆT quyền hiện có của 2 báo cáo gốc tương ứng
// (bc-doanh-thu-hcrc/bc-doanh-thu-ldtd) — copy nguyên vẹn danh sách vai trò
// từ app.RoleReportAccess, không cần vào giao diện Hệ thống → Phân quyền
// bấm tay lại. An toàn chạy lại nhiều lần (bỏ qua vai trò đã có quyền).
//
// KHÔNG cần gán thêm app.RoleMenuAccess (quyền theo MENU) — cả 4 báo cáo
// dùng CHUNG 1 MenuItemId (xem scripts/seedLdtdHcrcReports.js), vai trò đã
// thấy menu "Báo cáo kinh doanh" qua 2 báo cáo gốc thì đã đủ điều kiện đó
// cho 2 báo cáo mới — RoleReportAccess mới là lớp quyết định "báo cáo nào
// cụ thể được XEM" (xem rp-server/lib/permissions.js).
//
// LƯU Ý: quyền có hiệu lực trong CSDL ngay sau khi script chạy xong, nhưng
// mỗi user đang đăng nhập vẫn đọc theo cache quyền TRONG BỘ NHỚ của chính
// tiến trình rp-server đang chạy (TTL 60 giây — xem lib/permissions.js) —
// script chạy độc lập (process Node riêng) KHÔNG với vào được bộ nhớ đó để
// xoá cache ngay, nên đổi sẽ thấy hiệu lực trong tối đa 60 giây, không cần
// khởi động lại rp-server.
//
// Cách dùng:
//   node scripts/seedThanhVienReportPermissions.js
require('dotenv').config();
const { sql, getPool } = require('../db');

const PAIRS = [
  { from: 'bc-doanh-thu-hcrc', to: 'bc-doanh-thu-hcrc-thanh-vien' },
  { from: 'bc-doanh-thu-ldtd', to: 'bc-doanh-thu-ldtd-thanh-vien' }
];

async function copyAccess(pool, fromReportId, toReportId) {
  const fromResult = await pool.request().input('reportId', sql.VarChar(80), fromReportId)
    .query('SELECT RoleId FROM app.RoleReportAccess WHERE ReportId = @reportId');
  const fromRoleIds = fromResult.recordset.map(r => r.RoleId);
  if (!fromRoleIds.length) {
    console.log(`(Báo cáo "${fromReportId}" hiện CHƯA có vai trò nào được gán quyền — không có gì để copy sang "${toReportId}".)`);
    return { copied: 0, alreadyHad: 0, total: 0 };
  }

  const existingResult = await pool.request().input('reportId', sql.VarChar(80), toReportId)
    .query('SELECT RoleId FROM app.RoleReportAccess WHERE ReportId = @reportId');
  const existingRoleIds = new Set(existingResult.recordset.map(r => r.RoleId));

  let copied = 0;
  for (const roleId of fromRoleIds) {
    if (existingRoleIds.has(roleId)) continue;
    await pool.request()
      .input('roleId', sql.Int, roleId)
      .input('reportId', sql.VarChar(80), toReportId)
      .query('INSERT INTO app.RoleReportAccess (RoleId, ReportId) VALUES (@roleId, @reportId)');
    copied++;
  }
  return { copied, alreadyHad: fromRoleIds.length - copied, total: fromRoleIds.length };
}

async function main() {
  const pool = await getPool('RP');

  for (const { from, to } of PAIRS) {
    const result = await copyAccess(pool, from, to);
    if (result.total > 0) {
      console.log(`✅ "${to}": ${result.copied} vai trò mới được gán quyền (${result.alreadyHad} vai trò đã có sẵn từ trước, ${result.total} vai trò đang xem "${from}").`);
    }
  }

  console.log('');
  console.log('✅ Xong — quyền xem 2 báo cáo "Thành viên" đã khớp với 2 báo cáo gốc.');
  console.log('   Hiệu lực trong tối đa 60 giây (cache quyền, xem chú thích đầu file), không cần khởi động lại rp-server.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
