// scripts/resyncDoanhThuChinhanhHistory.js — CHẠY 1 LẦN sau bản vá 8.12 (VIEW
// V_HCRC_DOANHTHU_CHINHANH ở CSDL DSMART16_EOM đổi công thức Lãi gộp từ
// COSTPRICE sang SURPLUS/TRANS_CODE — xem VERSION.md 8.12 và
// "báo cáo doanh thu cuối ngày.md" mục "Script B").
//
// KHÁC 2 script "...Live.js" đã có (bản 8.5/8.10): script NÀY đụng tới job
// "Lịch sử" — trước đây job này CỐ Ý KHÔNG bị đụng tới vì Script B chưa đổi
// công thức (vẫn dùng COSTPRICE sai, đã biết trước, chấp nhận tạm thời).
// Bản 8.12 đã đổi ĐÚNG công thức Script B (giống Script A) nên dữ liệu job
// "Lịch sử" đã đồng bộ trước đó GIỜ mang giá trị Lãi gộp SAI (theo công thức
// cũ), cần resync để kéo lại đúng.
//
// LƯU Ý VỀ THỜI GIAN: khác job Live (dữ liệu gần đây, vài phút), job "Lịch
// sử" giữ ~93 tháng dữ liệu — reset xong có thể mất VÀI GIỜ để kéo lại hết,
// nên chạy vào giờ thấp điểm và theo dõi qua etl-admin → Log.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDoanhThuChinhanhHistory.js           (xem trước, không đổi gì)
//   node scripts/resyncDoanhThuChinhanhHistory.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';
const HISTORY_JOB_NAME = 'Doanh thu chi nhánh - Lịch sử (DSMART16_EOM)';
const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const dwhPool = await getPool('DWH');
  const adminPool = await getPool('ADMIN');

  const jobResult = await adminPool.request()
    .input('name', sql.NVarChar(200), HISTORY_JOB_NAME)
    .query('SELECT Id, Name, DataSourceId, TargetDomain FROM etl.SyncJobs WHERE Name = @name');
  const job = jobResult.recordset[0];
  if (!job) {
    console.error(`⛔ Không tìm thấy job "${HISTORY_JOB_NAME}" trong etl.SyncJobs — kiểm tra lại tên job (đã đổi tên?) hoặc chạy scripts/seedLdtdHcrcSync.js trước.`);
    process.exit(1);
    return;
  }
  if (job.TargetDomain !== DOMAIN) {
    console.error(`⛔ Job "${HISTORY_JOB_NAME}" (Id ${job.Id}) có TargetDomain="${job.TargetDomain}", không phải "${DOMAIN}" như kỳ vọng — dừng lại, kiểm tra lại cấu hình.`);
    process.exit(1);
    return;
  }
  const sourceSystem = `ds${job.DataSourceId}`;

  const countResult = await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('sourceSystem', sql.VarChar(50), sourceSystem)
    .query('SELECT COUNT(*) AS SoLuong FROM dwh.ReportFacts WHERE Domain = @domain AND SourceSystem = @sourceSystem');
  const soLuong = countResult.recordset[0].SoLuong;

  console.log(`Job "${job.Name}" (Id ${job.Id}), SourceSystem="${sourceSystem}": ${soLuong} dòng dwh.ReportFacts sẽ bị xoá + kéo lại TOÀN BỘ (~93 tháng). Job "Live" (SourceSystem khác) KHÔNG bị đụng tới.`);

  if (!confirmed) {
    console.log('\n(Chưa làm gì cả — đây là xem trước. Truyền --confirm để thực sự xoá + reset đồng bộ lại.)');
    process.exit(0);
  }

  await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('sourceSystem', sql.VarChar(50), sourceSystem)
    .query('DELETE FROM dwh.ReportFacts WHERE Domain = @domain AND SourceSystem = @sourceSystem');
  console.log(`✅ Đã xoá ${soLuong} dòng (SourceSystem="${sourceSystem}").`);

  await adminPool.request()
    .input('id', sql.Int, job.Id)
    .input('ts', sql.DateTime2, EPOCH)
    .query(`
      MERGE etl.SyncState AS target
      USING (SELECT @id AS SyncJobId) AS src ON target.SyncJobId = src.SyncJobId
      WHEN MATCHED THEN UPDATE SET LastSyncedAt = @ts
      WHEN NOT MATCHED THEN INSERT (SyncJobId, LastSyncedAt) VALUES (@id, @ts);
    `);
  console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — job sẽ tự kéo lại TOÀN BỘ dữ liệu Lịch sử với công thức SURPLUS/TRANS_CODE mới.`);

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Log — có thể mất VÀI GIỜ (job Lịch sử giữ ~93 tháng dữ liệu, khác job Live chỉ vài phút).');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
