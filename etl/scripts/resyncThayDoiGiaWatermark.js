// scripts/resyncThayDoiGiaWatermark.js — CHẠY 1 LẦN sau bản 11.21 (thêm
// `ThoiDiemThayDoi`/`CapNhatLuc` vào dimensionColumns của 2 job "Thay đổi
// giá bán tức thời"/"Thay đổi giá từ thời điểm" — xem
// scripts/seedThayDoiGiaSync.js): dữ liệu ĐÃ đồng bộ TRƯỚC bản này không
// tự có lại 2 cột trên (job chỉ lấy dòng MỚI PHÁT SINH kể từ mốc đồng bộ
// đã lưu, không tự quét lại dòng cũ) — cần reset watermark về EPOCH để job
// tự quét lại TOÀN BỘ nguồn 1 lần nữa, mirror đúng mẫu đã dùng ở
// resyncDonDatHangWatermark.js.
//
// AN TOÀN cho dữ liệu đã có — upsertReportFacts() (etl/lib/upsert.js) MERGE
// theo khoá nghiệp vụ, quét lại chỉ CẬP NHẬT (bổ sung 2 field còn thiếu),
// không tạo trùng/mất dòng nào. 2 domain này CHỈ có job "Live" (không có
// job "Lịch sử" riêng như don_dat_hang), nên quét lại toàn bộ thường NHANH
// (không phải chờ hàng giờ).
//
// AN TOÀN: mặc định (không truyền cờ) chỉ XEM TRƯỚC, KHÔNG đổi gì
// (dry-run). Truyền đúng --confirm mới thực sự reset watermark:
//   node scripts/resyncThayDoiGiaWatermark.js           (xem trước)
//   node scripts/resyncThayDoiGiaWatermark.js --confirm (thực sự chạy)
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAINS = ['thaydoigia_tucthoi', 'thaydoigia_tuthoidiem'];
const EPOCH = new Date('1970-01-01T00:00:00.000Z');

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const adminPool = await getPool('ADMIN');

  const jobsResult = await adminPool.request()
    .query(`SELECT Id, Name, TargetDomain FROM etl.SyncJobs WHERE TargetDomain IN ('${DOMAINS.join("','")}')`);
  const jobs = jobsResult.recordset;

  console.log(`${DOMAINS.length} domain liên quan: ${jobs.length} job đồng bộ (${jobs.map(j => j.Name).join(', ') || '(không có)'}).`);

  if (!jobs.length) {
    console.error(`⛔ Không tìm thấy job đồng bộ nào trỏ 2 domain trên — kiểm tra lại đã chạy "node scripts/seedThayDoiGiaSync.js" chưa.`);
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
    console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" — lượt chạy kế tiếp (theo lịch tối đa 15 phút, hoặc bấm "Chạy thử" ngay trong etl-admin) sẽ tự quét lại TOÀN BỘ nguồn, bù cột còn thiếu cho dữ liệu cũ.`);
  }

  console.log('\nXong. Theo dõi qua etl-admin → Log.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
