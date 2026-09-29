// scripts/resyncDoanhThuChinhanh.js — CHẠY 1 LẦN sau bản vá 7.6 (VIEW
// V_HCRC_DOANHTHU_CHINHANH thêm điều kiện JOIN COSTPRICE.NODE_ID, xem
// VERSION.md/"báo cáo doanh thu cuối ngày.md"): sửa VIEW ở DSMART16 KHÔNG
// tự làm lại dữ liệu ĐÃ đồng bộ trước đó — dwh.ReportFacts là bảng CACHE,
// job đồng bộ chỉ kéo phần "MỚI từ watermark" (xem etl/lib/tableSyncEngine.js),
// không tự biết VIEW nguồn vừa đổi công thức để kéo lại NGÀY CŨ. Domain
// `doanhthu_chinhanh` vì vậy vẫn giữ nguyên số "Thực đạt" SAI (nhân dòng
// theo mã Điểm) cho tới khi xoá cache + đồng bộ lại từ đầu — CÙNG tình
// huống "sửa số liệu hồi tố" đã ghi ở "báo cáo doanh thu cuối ngày.md"
// mục b) "Watermark". Bản mẫu: scripts/resyncGiaodichChinhanh.js.
//
// Việc script làm (theo đúng thứ tự, dừng ngay nếu bước nào lỗi):
//   1. Đếm số dòng dwh.ReportFacts Domain='doanhthu_chinhanh' hiện có.
//   2. XOÁ TOÀN BỘ các dòng đó (cả job Live lẫn Lịch sử đều ghi chung 1
//      domain này, xem "báo cáo doanh thu cuối ngày.md" Bước 2.2).
//   3. Reset mốc đồng bộ (etl.SyncState.LastSyncedAt) của MỌI job có
//      TargetDomain='doanhthu_chinhanh' về epoch (1970-01-01) — để lượt
//      chạy kế tiếp của job đó tự kéo lại TOÀN BỘ dữ liệu từ VIEW đã sửa.
//
// Sau khi chạy: job "Doanh thu chi nhánh - Live" (thường 15 phút/lần) và
// "- Lịch sử" (thường chạy đêm) sẽ TỰ đồng bộ lại theo đúng lịch — không
// cần chạy tay, nhưng job "Lịch sử" kéo lại nhiều tháng/năm dữ liệu có thể
// mất VÀI GIỜ tuỳ khối lượng — theo dõi qua etl-admin → Log. Trong lúc
// đang đồng bộ lại, cột "Thực đạt"/"Lãi gộp"/"Cùng kỳ năm trước" của báo
// cáo LDTD/HCRC sẽ tạm trống hoặc thiếu — đây là BÌNH THƯỜNG, không phải
// lỗi mới.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDoanhThuChinhanh.js           (xem trước, không đổi gì)
//   node scripts/resyncDoanhThuChinhanh.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';
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
