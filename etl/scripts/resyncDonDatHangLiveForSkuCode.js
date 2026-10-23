// scripts/resyncDonDatHangLiveForSkuCode.js — CHẠY 1 LẦN sau bản 9.95 (VIEW
// dbo.vw_DonDatHangChiNhanh thêm cột MaHangHienThi, JOIN SKU_DEF — xem
// VERSION.md 9.95 và "bc-ton-kho-0.md" mục "Chờ nhập/Đã nhập (NCC)").
//
// TÁI DÙNG nguyên vẹn ở bản 9.102 (thêm cột MaNganhHang/TenNganhHang, JOIN
// DEPTLIST) — tên file còn "...ForSkuCode" (giữ nguyên, không đổi tên gây
// nhầm lẫn lịch sử), nhưng CƠ CHẾ (xoá dữ liệu Live cũ + reset watermark,
// ép job kéo lại với CẤU HÌNH DIMENSION MỚI NHẤT) áp dụng ĐÚNG CHO MỌI LẦN
// thêm cột Dimension mới vào VIEW `vw_DonDatHangChiNhanh`, không riêng gì
// MaHangHienThi — chạy lại script NÀY (sau khi đã chạy
// `seedDonDatHangSync.js` để cập nhật DimensionColumnsJson) là đủ, KHÔNG
// cần viết script resync riêng cho mỗi cột mới.
//
// TẠI SAO CẦN SCRIPT RIÊNG — ĐÚNG lỗi watermark đã gặp ở bản 8.1/9.68/9.86
// (xem scripts/resyncDoanhThuChinhanhLive.js/resyncDoanhThuNganhHangLive.js,
// mirror y hệt cơ chế): job "Đơn đặt hàng - nhập hàng (DSMART16)" dùng chính
// cột EventDate làm UpdatedAtColumn (xem scripts/seedDonDatHangSync.js —
// `updatedAtColumn: 'EventDate'`, vì STOPED_DT luôn NULL) — tức câu truy vấn
// đồng bộ là "WHERE EventDate >= mốc_đã_đồng_bộ". EventDate của 1 dòng KHÔNG
// đổi theo thời gian — những ngày ĐÃ đồng bộ TRƯỚC KHI VIEW được thêm cột
// MaHangHienThi (mốc đã vượt qua EventDate của ngày đó) sẽ KHÔNG BAO GIỜ
// được kéo lại dù job chạy lại bao nhiêu lần — các cột cũ (MaHang/TenNCC/...)
// vẫn ĐÚNG, nhưng Dimensions.MaHangHienThi của những ngày đó sẽ THIẾU (y như
// chưa từng đồng bộ), khiến "Chờ nhập/Đã nhập (NCC)" ở báo cáo
// "Top bán chạy đang tồn kho = 0" bị thiếu/sai cho đúng những đơn cũ đó.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDonDatHangLiveForSkuCode.js           (xem trước, không đổi gì)
//   node scripts/resyncDonDatHangLiveForSkuCode.js --confirm (thực sự chạy)
//
// CHỈ đụng tới job "Đơn đặt hàng - nhập hàng (DSMART16)" (Live) — KHÔNG đụng
// tới job "...Lịch sử (DSMART16_EOM)" (SourceSystem khác, job Lịch sử đang
// chạy dở dang kéo nhiều năm lịch sử — reset chung sẽ bắt job đó kéo lại
// TOÀN BỘ từ đầu, mất thêm nhiều thời gian không cần thiết). Job Live chỉ
// giữ dữ liệu gần đây (tháng hiện tại/vài tháng, xem bc-don-dat-hang.md mục
// 6.6) nên reset toàn bộ job này là RẺ — không phải lo tốn thời gian như
// job Lịch sử. 6 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận"/
// ... dùng CHUNG domain này KHÔNG bị ảnh hưởng (chỉ kéo lại ĐÚNG dữ liệu đã
// có, thêm đúng 1 cột mới — MERGE idempotent).
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'don_dat_hang';
const LIVE_JOB_NAME = 'Đơn đặt hàng - nhập hàng (DSMART16)';
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
    console.error(`⛔ Không tìm thấy job "${LIVE_JOB_NAME}" trong etl.SyncJobs — kiểm tra lại tên job (đã đổi tên?) hoặc chạy scripts/seedDonDatHangSync.js trước.`);
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
  console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (tối đa 15 phút tới, theo lịch */15 * * * *) sẽ tự kéo lại toàn bộ dữ liệu Live, lần này có đủ Dimensions.MaHangHienThi.`);

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Đồng bộ → Log (chỉ mất vài phút vì job Live chỉ giữ dữ liệu gần đây, không phải nhiều năm như job Lịch sử). Sau khi job chạy xong 1 lượt, mở lại báo cáo "Top bán chạy đang tồn kho = 0" — 2 cột "Chờ nhập (NCC)"/"Đã nhập hôm nay (NCC)" (nếu đã bật, xem bc-ton-kho-0.md) phải có số liệu cho đơn hàng trong ~90 ngày gần nhất.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
