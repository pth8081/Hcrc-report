// scripts/cleanupTonKhoChiTietHistory.js — CHẠY 1 LẦN (bản 10.61), dọn sạch
// dữ liệu LỊCH SỬ THEO NGÀY đã tích luỹ THỪA của domain `tonkho_chitiet_sku`
// (dwh.ReportFacts) — SAU KHI đã chạy `node scripts/seedTonKhoChiTietSync.js`
// để đổi `KeepHistory` của job từ 1 (sai) về 0 (đúng, xem chú thích đầu file
// đó) — theo yêu cầu người dùng: "hàng tồn thì tính tại thời điểm, nó phải
// luôn luôn ghi đè, không cần lịch sử".
//
// KHÁC `resyncDoanhThuNganhHangLichSu.js` (file đó XOÁ SẠCH rồi kéo lại TỪ
// ĐẦU từ nguồn, cần reset watermark) — script NÀY KHÔNG xoá sạch domain,
// KHÔNG đụng watermark (`etl.SyncState`): dữ liệu "hiện tại" (dòng mới nhất/
// mã hàng+chi nhánh) ĐÃ ĐÚNG SẴN, chỉ cần XOÁ BỚT các dòng NGÀY CŨ của CÙNG
// 1 thực thể (mã hàng + chi nhánh), GIỮ LẠI đúng 1 dòng/thực thể (ngày gần
// nhất đã đồng bộ của riêng thực thể đó — KHÔNG ép về đúng 1 ngày chung cho
// TOÀN domain, vì có thể có thực thể lỡ chưa kịp đồng bộ ở lượt gần nhất).
// Từ lượt đồng bộ TIẾP THEO trở đi, `KeepHistory = 0` sẽ tự giữ đúng bất
// biến "1 dòng/thực thể" (xem etl/lib/upsert.js) — script này CHỈ dọn phần
// lịch sử ĐÃ accumulate TRƯỚC KHI đổi cấu hình, không cần chạy lại lần 2.
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá:
//   node scripts/cleanupTonKhoChiTietHistory.js           (xem trước, không đổi gì)
//   node scripts/cleanupTonKhoChiTietHistory.js --confirm (thực sự chạy)
//
// Xoá THEO TỪNG ĐỢT NHỎ (giống resyncDoanhThuNganhHangLichSu.js, sau sự cố
// thật domain triệu dòng vượt request timeout/giữ khoá quá lâu nếu xoá 1
// lệnh DUY NHẤT) — mỗi lượt tối đa BATCH_SIZE dòng, lặp lại tới khi hết.
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'tonkho_chitiet_sku';
const JOB_NAME = 'Tồn kho Chi tiết theo SKU - Live (DSMART16)';
const BATCH_SIZE = 5000;

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const adminPool = await getPool('ADMIN');
  const dwhPool = await getPool('DWH');

  const jobResult = await adminPool.request()
    .input('name', sql.NVarChar(200), JOB_NAME)
    .query('SELECT Id, KeepHistory FROM etl.SyncJobs WHERE Name = @name');
  const job = jobResult.recordset[0];
  if (!job) {
    console.error(`⛔ Không tìm thấy job "${JOB_NAME}" trong etl.SyncJobs — chạy "node scripts/seedTonKhoChiTietSync.js" trước (tạo/cập nhật job).`);
    process.exit(1);
    return;
  }
  if (job.KeepHistory) {
    console.error(`⛔ Job "${JOB_NAME}" (Id ${job.Id}) VẪN đang KeepHistory=1 — chạy "node scripts/seedTonKhoChiTietSync.js" TRƯỚC (đổi về 0), rồi mới chạy lại script này (nếu không, lượt đồng bộ kế tiếp lại tiếp tục SINH THÊM dòng lịch sử mới, dọn xong vẫn vô ích).`);
    process.exit(1);
    return;
  }
  console.log(`✅ Job "${JOB_NAME}" (Id ${job.Id}) đã KeepHistory=0 — an toàn để dọn lịch sử cũ.`);

  const countResult = await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .query(`
      SELECT COUNT(*) AS TongSoDong FROM dwh.ReportFacts WHERE Domain = @domain;

      SELECT COUNT(*) AS SoDongThua FROM dwh.ReportFacts rf
      WHERE rf.Domain = @domain
        AND rf.EventDate < (
          SELECT MAX(rf2.EventDate) FROM dwh.ReportFacts rf2
          WHERE rf2.Domain = rf.Domain AND rf2.SourceSystem = rf.SourceSystem AND rf2.EntityCode = rf.EntityCode
        );
    `);
  const tongSoDong = countResult.recordsets[0][0].TongSoDong;
  const soDongThua = countResult.recordsets[1][0].SoDongThua;

  console.log(`Domain "${DOMAIN}": tổng ${tongSoDong} dòng, trong đó ${soDongThua} dòng LỊCH SỬ THỪA (khác ngày gần nhất của đúng thực thể đó) sẽ bị xoá — giữ lại ${tongSoDong - soDongThua} dòng (đúng 1 dòng/mã hàng+chi nhánh, là dữ liệu "hiện tại" đang dùng cho báo cáo/API).`);

  if (!confirmed) {
    console.log('\n(Chưa làm gì cả — đây là xem trước. Truyền --confirm để thực sự xoá.)');
    process.exit(0);
  }

  if (!soDongThua) {
    console.log('\n✅ Không có dòng thừa nào cần dọn — có thể đã dọn trước đó. Xong.');
    process.exit(0);
  }

  let totalDeleted = 0;
  for (;;) {
    const deleteResult = await dwhPool.request()
      .input('domain', sql.VarChar(50), DOMAIN)
      .input('batchSize', sql.Int, BATCH_SIZE)
      .query(`
        DELETE TOP (@batchSize) rf
        FROM dwh.ReportFacts rf
        WHERE rf.Domain = @domain
          AND rf.EventDate < (
            SELECT MAX(rf2.EventDate) FROM dwh.ReportFacts rf2
            WHERE rf2.Domain = rf.Domain AND rf2.SourceSystem = rf.SourceSystem AND rf2.EntityCode = rf.EntityCode
          );
      `);
    const batchDeleted = deleteResult.rowsAffected[0] || 0;
    totalDeleted += batchDeleted;
    if (totalDeleted % (BATCH_SIZE * 20) === 0 || batchDeleted < BATCH_SIZE) {
      console.log(`   ... đã xoá ${totalDeleted}/${soDongThua} dòng`);
    }
    if (batchDeleted < BATCH_SIZE) break; // lượt cuối, còn lại ít hơn 1 đợt -> hết
  }

  console.log(`\n✅ Đã xoá ${totalDeleted} dòng lịch sử thừa. Domain "${DOMAIN}" giờ chỉ còn đúng 1 dòng/mã hàng+chi nhánh — không cần chạy lại script này nữa (lượt đồng bộ sau tự giữ đúng bất biến này nhờ KeepHistory=0).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
