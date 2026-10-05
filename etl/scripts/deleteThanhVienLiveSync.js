// scripts/deleteThanhVienLiveSync.js — Xoá HÀNG LOẠT 34 "Nguồn dữ liệu" +
// toàn bộ Sync Job Live tham chiếu (danh sách siêu thị "Thành viên", y hệt
// `scripts/seedThanhVienLiveSync.js`) — bản 8.82, theo yêu cầu người dùng:
// đồng bộ Live không về đúng dù đã cấu hình, muốn xoá sạch để tạo lại bằng
// `seedThanhVienLiveSync.js` (idempotent, chạy lại an toàn) nhằm loại trừ
// khả năng dữ liệu cũ/cấu hình lỗi còn sót lại.
//
// CHỈ xoá ĐÚNG 34 Nguồn dữ liệu tên "DSMART16 - <tên siêu thị>" khớp danh
// sách STORES bên dưới (COPY NGUYÊN VĂN từ seedThanhVienLiveSync.js — PHẢI
// giữ đúng y hệt, không tự sửa riêng 1 trong 2 file) + MỌI Sync Job đang
// tham chiếu đúng các Nguồn đó (dò theo DataSourceId thật trong CSDL, không
// chỉ theo tên job — bắt được cả trường hợp admin đã lỡ đổi tên job trên
// giao diện). KHÔNG đụng tới Nguồn dữ liệu/Sync Job nào khác (vd job
// "Doanh thu chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)" của
// seedThanhVienHistorySync.js — dùng 1 Nguồn RIÊNG, trung tâm, không phải
// 1-trong-34, không bị xoá bởi script này).
//
// MẶC ĐỊNH CHỈ XEM TRƯỚC (dry-run) — liệt kê đúng những gì SẼ xoá, KHÔNG
// xoá gì cả. Thêm `--confirm` để xoá thật:
//   node scripts/deleteThanhVienLiveSync.js            # xem trước
//   node scripts/deleteThanhVienLiveSync.js --confirm  # xoá thật
//
// Sau khi xoá xong, chạy lại scripts/seedThanhVienLiveSync.js để tạo mới
// hoàn toàn 34 Nguồn + Sync Job (không còn dữ liệu/cấu hình cũ chen vào).
require('dotenv').config();
const { sql, getPool } = require('../db');
const { invalidate } = require('../lib/dataSourcePool');
const { rescheduleJob } = require('../jobs/scheduler');

// === COPY NGUYÊN VĂN từ scripts/seedThanhVienLiveSync.js — PHẢI khớp đúng
// y hệt danh sách STORES bên đó (chỉ cần tên siêu thị để dựng đúng tên
// Nguồn dữ liệu, không cần server/IP vì KHÔNG tạo gì ở đây) ===
const STORES = [
  { name: 'BRGMart 120 Hàng Trống' },
  { name: 'BRGMart Nguyễn Văn Cừ' },
  { name: 'BRGMart Hải Dương' },
  { name: 'BRGMart Phố Nối' },
  { name: 'BRGMart Hải Phòng' },
  { name: 'BRGMart C12 Thanh Xuân' },
  { name: 'BRGMart 13 Thành Công' },
  { name: 'HaproFood 135 Lương Định Của' },
  { name: 'HaproFood G3 Vĩnh Phúc' },
  { name: 'BRGMart 5 Hàm Tử Quan' },
  { name: 'HaproFood 198 Lò Đúc' },
  { name: 'HaproFood N4C Trung Hoà' },
  { name: 'HaproFood Chợ Bưởi' },
  { name: 'HaproFood 160-162 Ngõ Thái Thịnh I' },
  { name: 'BRGMart Moonlight' },
  { name: 'HaproFood 83 Nguyễn An Ninh' },
  { name: 'BRGMart 63 Hàng Trống' },
  { name: 'HaproFood 105 Lê Duẩn' },
  { name: 'BRGMart Mạo Khê' },
  { name: 'HaproFood 362 Ngọc Lâm' },
  { name: 'HaproFood Ecohome3' },
  { name: 'BRGMart N16 Sài đồng' },
  { name: 'BRGMart Intracom Đông Anh' },
  { name: 'HaproFood 9-11 Thổ Quan' },
  { name: 'HaproFood 9 Lê Quý Đôn' },
  { name: 'HaproFood 24 Trần Nhật Duật' },
  { name: 'BRGMart L4 Sài Đồng' },
  { name: 'BRGMart 53D Hàng Bài' },
  { name: 'BrgMart Đồ Sơn Hải Phòng' },
  { name: 'BRGMart 8 Phạm Ngọc Thạch' },
  { name: 'BRGMart 1 Lý Nam Đế' },
  { name: 'BRGMart 275 Nguyễn Trãi' },
  { name: 'HaproFood 96 Tô Ngọc Vân' },
  { name: 'HaproFood 98 Tô Ngọc Vân' }
];
// ============================================================================

function dataSourceName(store) {
  return `DSMART16 - ${store.name}`;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const pool = await getPool('ADMIN');

  const plan = []; // { dataSourceId, dataSourceName, jobs: [{id, name}] }
  let notFound = 0;

  for (const store of STORES) {
    const name = dataSourceName(store);
    const srcResult = await pool.request().input('name', sql.NVarChar(200), name)
      .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
    if (!srcResult.recordset.length) {
      notFound++;
      continue;
    }
    const dataSourceId = srcResult.recordset[0].Id;
    const jobsResult = await pool.request().input('id', sql.Int, dataSourceId)
      .query('SELECT Id, Name FROM etl.SyncJobs WHERE DataSourceId = @id');
    plan.push({ dataSourceId, dataSourceName: name, jobs: jobsResult.recordset });
  }

  const totalJobs = plan.reduce((sum, p) => sum + p.jobs.length, 0);
  console.log(`Tìm thấy ${plan.length}/${STORES.length} Nguồn dữ liệu "Thành viên" (${notFound} không tồn tại — bỏ qua, có thể đã xoá trước đó), tổng ${totalJobs} Sync Job tham chiếu.\n`);

  for (const p of plan) {
    console.log(`- [#${p.dataSourceId}] ${p.dataSourceName} — ${p.jobs.length} job: ${p.jobs.map((j) => j.Name).join(', ') || '(không có)'}`);
  }

  if (!plan.length) {
    console.log('\nKhông có gì để xoá.');
    process.exit(0);
  }

  if (!confirm) {
    console.log(`\n⚠️  ĐANG XEM TRƯỚC (dry-run) — CHƯA xoá gì cả. Chạy lại kèm --confirm để xoá thật:`);
    console.log('   node scripts/deleteThanhVienLiveSync.js --confirm');
    process.exit(0);
  }

  console.log(`\n🗑️  Đang xoá THẬT (--confirm đã bật)...\n`);
  let deletedJobs = 0, deletedSources = 0;
  for (const p of plan) {
    for (const job of p.jobs) {
      await pool.request().input('jid', sql.Int, job.Id).query('DELETE FROM etl.SyncJobs WHERE Id = @jid');
      await rescheduleJob(job.Id); // gỡ khỏi lịch cron ngay, không chờ chu kỳ nạp lại 60s
      deletedJobs++;
      console.log(`  ✅ Xoá job "${job.Name}" (#${job.Id}).`);
    }
    await pool.request().input('id', sql.Int, p.dataSourceId).query('DELETE FROM etl.DataSources WHERE Id = @id');
    await invalidate(p.dataSourceId); // đóng pool kết nối cũ nếu đang mở (có timeout 5s, bản 8.76 — không treo)
    deletedSources++;
    console.log(`✅ Xoá Nguồn dữ liệu "${p.dataSourceName}" (#${p.dataSourceId}).`);
  }

  console.log(`\n✅ Xong — đã xoá ${deletedSources} Nguồn dữ liệu, ${deletedJobs} Sync Job.`);
  console.log('Chạy lại: node scripts/seedThanhVienLiveSync.js để tạo mới hoàn toàn.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
