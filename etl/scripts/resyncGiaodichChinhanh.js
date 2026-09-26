// scripts/resyncGiaodichChinhanh.js — CHẠY 1 LẦN sau bản gỡ tính năng "Ánh
// xạ mã chi nhánh" (etl.BranchCodeMap, xem VERSION.md): trước bản này, mọi
// dòng domain `giaodich_chinhanh` trong dwh.ReportFacts được ghi với
// EntityCode ĐÃ BỊ DỊCH qua BranchCodeMap (1 mã STK_ID cố định, sai cho dữ
// liệu quá khứ nếu mã kho từng đổi) — code mới (etl/lib/tableSyncEngine.js)
// từ nay ghi EntityCode = BU_ID gốc, KHÔNG dịch mã. 2 kiểu dữ liệu này
// KHÔNG tương thích nhau (khác EntityCode cho cùng 1 chi nhánh/ngày) — cần
// xoá sạch dữ liệu cũ rồi cho job tự đồng bộ lại từ đầu để về đúng BU_ID.
//
// Việc script làm (theo đúng thứ tự, dừng ngay nếu bước nào lỗi):
//   1. Đếm số dòng dwh.ReportFacts Domain='giaodich_chinhanh' hiện có.
//   2. XOÁ TOÀN BỘ các dòng đó.
//   3. Reset mốc đồng bộ (etl.SyncState.LastSyncedAt) của MỌI job có
//      TargetDomain='giaodich_chinhanh' về epoch (1970-01-01) — để lượt
//      chạy kế tiếp của job đó tự kéo lại TOÀN BỘ dữ liệu từ nguồn (không
//      chỉ phần "mới từ watermark"), lần này với entityCode = BU_ID gốc.
//
// Sau khi chạy: job "Live" (thường 15 phút/lần) và job "Lịch sử" (thường
// chạy đêm) sẽ TỰ đồng bộ lại theo đúng lịch — không cần chạy tay, nhưng
// job "Lịch sử" kéo lại nhiều tháng/năm dữ liệu có thể mất VÀI GIỜ tuỳ khối
// lượng — theo dõi qua etl-admin → Log. Trong lúc đang đồng bộ lại, cột
// "Giao dịch - Thực đạt"/"Cùng kỳ năm trước" của báo cáo LDTD/HCRC sẽ tạm
// trống hoặc thiếu — đây là BÌNH THƯỜNG, không phải lỗi mới.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncGiaodichChinhanh.js           (xem trước, không đổi gì)
//   node scripts/resyncGiaodichChinhanh.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'giaodich_chinhanh';
const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const dwhPool = await getPool('DWH');
  const adminPool = await getPool('ADMIN');

  const countResult = await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .query('SELECT COUNT(*) AS SoLuong FROM dwh.ReportFacts WHERE Domain = @domain');
  const soLuong = countResult.recordset[0].SoLuong;

  const jobsResult = await adminPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .query("SELECT Id, Name FROM etl.SyncJobs WHERE TargetDomain = @domain");
  const jobs = jobsResult.recordset;

  console.log(`Domain "${DOMAIN}": ${soLuong} dòng trong dwh.ReportFacts, ${jobs.length} job đồng bộ liên quan (${jobs.map(j => j.Name).join(', ') || '(không có)'}).`);

  if (!confirmed) {
    console.log('\n(Chưa làm gì cả — đây là xem trước. Truyền --confirm để thực sự xoá + reset đồng bộ lại.)');
    process.exit(0);
  }

  if (!jobs.length) {
    console.error(`⛔ Không tìm thấy job đồng bộ nào trỏ domain "${DOMAIN}" — dừng lại, không xoá dữ liệu nếu không có job nào tự đồng bộ lại được.`);
    process.exit(1);
  }

  await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .query('DELETE FROM dwh.ReportFacts WHERE Domain = @domain');
  console.log(`✅ Đã xoá ${soLuong} dòng domain "${DOMAIN}".`);

  for (const job of jobs) {
    await adminPool.request()
      .input('id', sql.Int, job.Id)
      .input('ts', sql.DateTime2, EPOCH)
      .query(`
        MERGE etl.SyncState AS target
        USING (SELECT @id AS SyncJobId) AS src ON target.SyncJobId = src.SyncJobId
        WHEN MATCHED THEN UPDATE SET LastSyncedAt = @ts
        WHEN NOT MATCHED THEN INSERT (SyncJobId, LastSyncedAt) VALUES (@id, @ts);
      `);
    console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (theo lịch, tối đa vài phút tới) sẽ tự kéo lại toàn bộ dữ liệu.`);
  }

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Log.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
