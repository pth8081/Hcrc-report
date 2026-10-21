// scripts/resyncDoanhThuNganhHangLive.js — CHẠY 1 LẦN sau bản 9.68 (VIEW
// V_HCRC_DOANHTHU_NGANHHANG thêm 5 cột DoanhThuBanLe/DoanhThuBanBuon/
// LaiGopBanLe/LaiGopBanBuon/GiaTriHongHuy), CHỈ áp dụng cho job "Live" —
// xem VERSION.md 9.68 và "báo cáo doanh thu-nhập hàng theo ngành hàng.md".
//
// TẠI SAO CẦN SCRIPT RIÊNG — ĐÚNG lỗi watermark đã gặp ở bản 8.1 (xem
// scripts/resyncDoanhThuChinhanhLive.js, mirror y hệt cơ chế):
// job "Doanh thu theo ngành hàng - Live" dùng chính cột WORK_DATE (ngày làm
// việc trong nguồn) làm UpdatedAtColumn (xem scripts/seedNganhHangSync.js —
// `updatedAtColumn: job.dateColumn`), tức câu truy vấn đồng bộ là
// "WHERE WORK_DATE >= mốc_đã_đồng_bộ" (etl/lib/tableSyncEngine.js). WORK_DATE
// của 1 dòng KHÔNG đổi theo thời gian — nên những ngày ĐÃ đồng bộ TRƯỚC KHI
// VIEW được thêm 5 cột mới (mốc đã vượt qua WORK_DATE của ngày đó) sẽ KHÔNG
// BAO GIỜ được kéo lại dù job chạy lại bao nhiêu lần/đợi bao lâu — cột
// "DoanhThu" (Total) của những ngày đó vẫn ĐÚNG (đã đồng bộ từ VIEW cũ, cột
// này có từ trước), nhưng 5 cột MỚI (đặc biệt DoanhThuBanLe/DoanhThuBanBuon)
// y như CHƯA từng đồng bộ cho những ngày đó — ĐÚNG hiện tượng người dùng báo
// cáo: Total cả tháng đúng, Bán lẻ/Bán buôn như chỉ có của ngày "hôm nay"
// (ngày job chạy lại gần nhất SAU KHI VIEW đã thêm 5 cột mới).
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDoanhThuNganhHangLive.js           (xem trước, không đổi gì)
//   node scripts/resyncDoanhThuNganhHangLive.js --confirm (thực sự chạy)
//
// KHÔNG đụng tới job "Nhập hàng theo ngành hàng - Live" (measureColumns của
// job đó không đổi ở bản 9.68, không có lỗi này) và KHÔNG đụng tới job
// "Doanh thu theo ngành hàng - Lịch sử (DSMART16_EOM)" (SourceSystem khác,
// job Lịch sử vẫn đang chạy dở dang kéo lịch sử nhiều năm — reset chung sẽ
// vô tình bắt job đó kéo lại TOÀN BỘ từ đầu, mất thêm thời gian không cần
// thiết; theo đúng lý do đã nêu ở resyncDoanhThuChinhanhLive.js).
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_nganhhang';
const LIVE_JOB_NAME = 'Doanh thu theo ngành hàng - Live (DSMART16)';
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
    console.error(`⛔ Không tìm thấy job "${LIVE_JOB_NAME}" trong etl.SyncJobs — kiểm tra lại tên job (đã đổi tên?) hoặc chạy scripts/seedNganhHangSync.js trước.`);
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
  console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (tối đa 15 phút tới, theo lịch */15 * * * *) sẽ tự kéo lại toàn bộ dữ liệu Live với đủ 8 cột đo (gồm DoanhThuBanLe/DoanhThuBanBuon/LaiGopBanLe/LaiGopBanBuon/GiaTriHongHuy).`);

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Đồng bộ → Log (chỉ mất vài phút vì job Live chỉ giữ dữ liệu gần đây, không phải nhiều năm như job Lịch sử). Sau khi job chạy xong 1 lượt, mở lại báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" tháng 10 — Bán lẻ/Bán buôn phải khớp cả tháng, không còn chỉ có số của "hôm nay".');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
