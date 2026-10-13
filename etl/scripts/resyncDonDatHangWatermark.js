// scripts/resyncDonDatHangWatermark.js — CHẠY 1 LẦN sau bản 9.27 (thêm mã
// giao dịch 130/330 vào 2 VIEW nguồn — xem VERSION.md): job đồng bộ domain
// `don_dat_hang` (CẢ job "Live" DSMART16 trung tâm LẪN job "Lịch sử"
// DSMART16_EOM) đã chạy qua rất nhiều mốc thời gian TRƯỚC KHI VIEW được
// sửa — watermark (etl.SyncState.LastSyncedAt) hiện đã vượt xa thời điểm
// của các đơn hàng mang mã 130/330 TRONG QUÁ KHỨ, nên dù VIEW đã lọc đúng,
// job chạy định kỳ tiếp theo CHỈ lấy dòng MỚI PHÁT SINH (WHERE UpdatedAt >=
// watermark) — KHÔNG tự quay lại lấy bù các đơn 130/330 đã tồn tại từ
// trước. Cần reset watermark về EPOCH để job tự quét lại TOÀN BỘ nguồn 1
// lần nữa.
//
// KHÁC resyncGiaodichChinhanh.js (đổi Ý NGHĨA EntityCode, dữ liệu cũ SAI
// hẳn, bắt buộc xoá): lần này dữ liệu `133`/`333` đã đồng bộ TRƯỚC ĐÓ vẫn
// ĐÚNG nguyên — chỉ THIẾU thêm 2 mã `130`/`330`, nên KHÔNG xoá dữ liệu cũ.
// upsertReportFacts() (etl/lib/upsert.js) dùng MERGE theo khoá nghiệp vụ
// (SourceSystem|Domain|EntityCode|EventDate) — quét lại từ đầu chỉ CẬP
// NHẬT (no-op) các dòng 133/333 đã có, và CHÈN MỚI đúng các dòng 130/330
// trước đây bị VIEW loại bỏ.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ XEM TRƯỚC, KHÔNG đổi gì
// (dry-run). Truyền đúng --confirm mới thực sự reset watermark:
//   node scripts/resyncDonDatHangWatermark.js           (xem trước)
//   node scripts/resyncDonDatHangWatermark.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'don_dat_hang';
const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const adminPool = await getPool('ADMIN');

  const jobsResult = await adminPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .query('SELECT Id, Name FROM etl.SyncJobs WHERE TargetDomain = @domain');
  const jobs = jobsResult.recordset;

  console.log(`Domain "${DOMAIN}": ${jobs.length} job đồng bộ liên quan (${jobs.map(j => j.Name).join(', ') || '(không có)'}).`);

  if (!jobs.length) {
    console.error(`⛔ Không tìm thấy job đồng bộ nào trỏ domain "${DOMAIN}" — kiểm tra lại tên job/TargetDomain trước khi chạy.`);
    process.exit(1);
  }

  if (!confirmed) {
    console.log('\n(Chưa đổi gì cả — đây là xem trước. Truyền --confirm để thực sự reset mốc đồng bộ.)');
    process.exit(0);
  }

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
    console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (theo lịch, hoặc bấm "Chạy thử" ngay) sẽ tự quét lại TOÀN BỘ nguồn, bù các đơn mã 130/330 trước đây bị bỏ sót.`);
  }

  console.log('\nXong. Job "Lịch sử" quét lại toàn bộ có thể mất VÀI GIỜ tuỳ khối lượng — theo dõi qua etl-admin → Log.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
