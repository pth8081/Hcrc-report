// scripts/resyncDoanhThuChinhanhLive.js — CHẠY 1 LẦN sau bản vá 8.1 (VIEW
// V_HCRC_DOANHTHU_CHINHANH đổi công thức giá vốn/"Lãi gộp" từ COSTPRICE sang
// STK_INFO, CHỈ áp dụng cho job "Live" — xem VERSION.md 8.1 và
// "báo cáo doanh thu cuối ngày.md").
//
// TẠI SAO CẦN SCRIPT RIÊNG (khác resyncDoanhThuChinhanh.js đã có sẵn):
// job "Doanh thu chi nhánh - Live" ĐANG dùng chính cột WORK_DATE (ngày làm
// việc trong nguồn) làm UpdatedAtColumn (xem scripts/seedLdtdHcrcSync.js —
// `updatedAtColumn: job.dateColumn`), tức câu truy vấn đồng bộ là
// "WHERE WORK_DATE > mốc_đã_đồng_bộ" (etl/lib/tableSyncEngine.js dòng
// `WHERE m.${q(updatedCol)} > ...`). WORK_DATE của 1 dòng KHÔNG đổi theo thời
// gian — nên khi VIEW nguồn đổi CÔNG THỨC tính (không đổi WORK_DATE), những
// ngày ĐÃ đồng bộ trước đó (mốc đã vượt qua WORK_DATE của ngày đó) sẽ KHÔNG
// BAO GIỜ được kéo lại nữa dù job chạy lại bao nhiêu lần/đợi bao lâu (đây
// chính là nguyên nhân "Lãi gộp" trong báo cáo vẫn hiện số CŨ/sai sau khi đã
// sửa VIEW ở bản 8.1 — không phải lỗi ứng dụng, không phải do chưa deploy
// code mới, mà do cơ chế watermark của riêng job "Live" domain này).
//
// resyncDoanhThuChinhanh.js (dùng chung) xoá + reset CẢ job "Live" LẪN job
// "Lịch sử" (2 job cùng TargetDomain='doanhthu_chinhanh') — không phù hợp ở
// đây vì job "Lịch sử" KHÔNG đổi công thức (Script B trong "báo cáo doanh
// thu cuối ngày.md" vẫn cố ý giữ nguyên COSTPRICE, xem mục cảnh báo ngay sau
// Script B) và job đó đang chạy dở dang kéo lịch sử nhiều năm (theo lần
// kiểm tra gần nhất mới tới 2022-07-04, còn thiếu nhiều tháng) — reset job
// đó về epoch sẽ vô tình bắt nó kéo lại TOÀN BỘ từ đầu, mất thêm rất nhiều
// thời gian một cách không cần thiết. Script NÀY chỉ đụng tới job "Live":
// xoá đúng các dòng dwh.ReportFacts mà job "Live" đã ghi (phân biệt qua
// SourceSystem = "ds<DataSourceId của Live>", KHÁC SourceSystem của job
// "Lịch sử" vì 2 job trỏ 2 Nguồn dữ liệu khác nhau — xem UNIQUE key
// (SourceSystem, Domain, EntityCode, EventDate) ở dwh/schema.sql) rồi reset
// CHỈ mốc đồng bộ của job "Live" về epoch — job "Lịch sử" và tiến độ của nó
// giữ nguyên, không bị đụng tới.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDoanhThuChinhanhLive.js           (xem trước, không đổi gì)
//   node scripts/resyncDoanhThuChinhanhLive.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_chinhanh';
const LIVE_JOB_NAME = 'Doanh thu chi nhánh - Live (DSMART16)';
const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const dwhPool = await getPool('DWH');
  const adminPool = await getPool('ADMIN');

  const jobResult = await adminPool.request()
    .input('name', sql.NVarChar(200), LIVE_JOB_NAME)
    .query('SELECT Id, Name, DataSourceId, TargetDomain FROM etl.SyncJobs WHERE Name = @name');
  const job = jobResult.recordset[0];
  if (!job) {
    console.error(`⛔ Không tìm thấy job "${LIVE_JOB_NAME}" trong etl.SyncJobs — kiểm tra lại tên job (đã đổi tên?) hoặc chạy scripts/seedLdtdHcrcSync.js trước.`);
    process.exit(1);
    return;
  }
  if (job.TargetDomain !== DOMAIN) {
    console.error(`⛔ Job "${LIVE_JOB_NAME}" (Id ${job.Id}) có TargetDomain="${job.TargetDomain}", không phải "${DOMAIN}" như kỳ vọng — dừng lại, kiểm tra lại cấu hình.`);
    process.exit(1);
    return;
  }
  const sourceSystem = `ds${job.DataSourceId}`;

  const countResult = await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('sourceSystem', sql.VarChar(50), sourceSystem)
    .query('SELECT COUNT(*) AS SoLuong FROM dwh.ReportFacts WHERE Domain = @domain AND SourceSystem = @sourceSystem');
  const soLuong = countResult.recordset[0].SoLuong;

  console.log(`Job "${job.Name}" (Id ${job.Id}), SourceSystem="${sourceSystem}": ${soLuong} dòng dwh.ReportFacts sẽ bị xoá + kéo lại. Job "Lịch sử" (SourceSystem khác) KHÔNG bị đụng tới.`);

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
  console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (tối đa 15 phút tới, theo lịch */15 * * * *) sẽ tự kéo lại toàn bộ dữ liệu Live với công thức giá vốn mới.`);

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Log (chỉ mất vài phút vì job Live chỉ giữ dữ liệu gần đây, không phải nhiều năm như job Lịch sử).');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
