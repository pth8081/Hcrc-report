// scripts/resyncDoanhThuNganhHangLichSu.js — CHẠY 1 LẦN (bản 9.96), theo
// báo cáo người dùng: 2 cột "Bán lẻ"/"Bán buôn" của "% so cùng kỳ năm
// trước" (cả Doanh thu lẫn Lãi gộp) LUÔN TRỐNG, trong khi "Total" vẫn có
// số bình thường.
//
// NGUYÊN NHÂN (ĐÃ XÁC NHẬN qua SQL thật, không phải đoán) — job "Doanh thu
// theo ngành hàng - Lịch sử (DSMART16_EOM)" đang chạy với
// `MeasureColumnsJson = ["SoLuongBan","DoanhThu","LaiGop"]` — cấu hình CŨ,
// trước bản 9.68 (chưa từng được cập nhật lên 8 số đo, dù VIEW nguồn VÀ
// Nhà cung cấp "Lịch sử" đã có sẵn 5 cột mới từ bản 9.68) — nghĩa là job
// này CHƯA BAO GIỜ lấy `DoanhThuBanLe`/`DoanhThuBanBuon`/`LaiGopBanLe`/
// `LaiGopBanBuon`/`GiaTriHongHuy` cho BẤT KỲ ngày nào trong toàn bộ lịch sử
// nó đã đồng bộ (kể cả watermark đã chạy xa tới đâu — vấn đề nằm ở
// CẤU HÌNH job, không phải tốc độ đồng bộ). KHÁC bản 9.86 (đó là lỗi
// watermark khiến job KHÔNG BAO GIỜ quay lại ngày cũ — ở đây job luôn có
// đi qua đúng ngày, chỉ là chưa từng YÊU CẦU đủ cột).
//
// CÁCH SỬA — 2 bước, PHẢI làm ĐÚNG THỨ TỰ:
//   1. node scripts/seedNganhHangSync.js --with-history
//      (cập nhật MeasureColumnsJson của job lên đủ 8 số đo — KHÔNG tự xoá
//      dữ liệu cũ, chỉ đổi cấu hình cho LẦN ĐỒNG BỘ TIẾP THEO)
//   2. node scripts/resyncDoanhThuNganhHangLichSu.js --confirm
//      (file NÀY — xoá dữ liệu CŨ đã đồng bộ thiếu cột + reset watermark
//      để job quét lại TOÀN BỘ LỊCH SỬ, lần này với cấu hình ĐỦ 8 số đo)
//
// ‼️ CẢNH BÁO QUAN TRỌNG — RẤT CHẬM, KHÁC bản 9.86 (đó là job "Live", chỉ
// giữ dữ liệu vài tháng gần đây, resync xong trong vài phút) ‼️ Job NÀY là
// "Lịch sử" (DSMART16_EOM), quét ~93 bảng STRANS_YYYYMM từ nhiều năm trước
// tới nay — LẦN ĐỒNG BỘ ĐẦU TIÊN (trước khi có script này) đã mất RẤT
// NHIỀU NGÀY mới quét hết (xem VERSION.md bản 9.88/9.89 — quan sát được
// watermark tiến ~48 ngày lịch sử/lượt chạy, job chạy 1 lần/ngày theo lịch
// `0 3 * * *`). Chạy --confirm nghĩa là BẮT ĐẦU LẠI TỪ ĐẦU — có thể mất
// NHIỀU TUẦN mới quét xong lại toàn bộ lịch sử. Trong lúc đang resync lại:
//   - Báo cáo "cùng kỳ năm trước" sẽ TRỐNG HẲN (không chỉ thiếu Bán lẻ/Bán
//     buôn như hiện tại) cho tới khi job quét TỚI ĐÚNG ngày cần so sánh —
//     TẠM THỜI TỆ HƠN hiện tại, nhưng là ĐÁNH ĐỔI CẦN THIẾT để sau này có
//     đủ dữ liệu đúng.
//   - KHÔNG BẮT BUỘC chạy ngay — có thể cân nhắc thời điểm ít ảnh hưởng
//     (vd cuối tuần, ngoài giờ cần xem báo cáo "cùng kỳ năm trước" gấp).
//
// AN TOÀN: mặc định (không truyền cờ) chỉ ĐẾM và in ra, KHÔNG xoá gì cả
// (dry-run). Truyền đúng --confirm mới thực sự xoá + reset watermark:
//   node scripts/resyncDoanhThuNganhHangLichSu.js           (xem trước, không đổi gì)
//   node scripts/resyncDoanhThuNganhHangLichSu.js --confirm (thực sự chạy)
//
// CHỈ đụng tới job "Doanh thu theo ngành hàng - Lịch sử (DSMART16_EOM)" —
// KHÔNG đụng job "Live" (đã đúng cấu hình từ bản 9.86) và KHÔNG đụng job
// "Nhập hàng theo ngành hàng - Lịch sử (DSMART16_EOM)" (measureColumns
// riêng, KHÔNG liên quan 5 cột bản 9.68, không bị lỗi này).
require('dotenv').config();
const { sql, getPool } = require('../db');

const DOMAIN = 'doanhthu_nganhhang';
const JOB_NAME = 'Doanh thu theo ngành hàng - Lịch sử (DSMART16_EOM)';
const EPOCH = new Date('1970-01-01T00:00:00.000Z');
const REQUIRED_MEASURES = ['SoLuongBan', 'DoanhThu', 'DoanhThuBanLe', 'DoanhThuBanBuon', 'LaiGop', 'LaiGopBanLe', 'LaiGopBanBuon', 'GiaTriHongHuy'];

async function main() {
  const confirmed = process.argv.includes('--confirm');

  const dwhPool = await getPool('DWH');
  const adminPool = await getPool('ADMIN');

  const jobResult = await adminPool.request()
    .input('name', sql.NVarChar(200), JOB_NAME)
    .query('SELECT Id, Name, DataSourceId, TargetDomain, MeasureColumnsJson FROM etl.SyncJobs WHERE Name = @name');
  const job = jobResult.recordset[0];
  if (!job) {
    console.error(`⛔ Không tìm thấy job "${JOB_NAME}" trong etl.SyncJobs — kiểm tra lại tên job (đã đổi tên?) hoặc chạy "node scripts/seedNganhHangSync.js --with-history" trước.`);
    process.exit(1);
    return;
  }
  if (job.TargetDomain !== DOMAIN) {
    console.error(`⛔ Job "${JOB_NAME}" (Id ${job.Id}) có TargetDomain="${job.TargetDomain}", không phải "${DOMAIN}" như kỳ vọng — dừng lại, kiểm tra lại cấu hình.`);
    process.exit(1);
    return;
  }

  let currentMeasures = [];
  try { currentMeasures = JSON.parse(job.MeasureColumnsJson || '[]'); } catch { /* ignore, coi như rỗng */ }
  const missingMeasures = REQUIRED_MEASURES.filter(m => !currentMeasures.includes(m));
  if (missingMeasures.length) {
    console.error(`⛔ Job "${JOB_NAME}" VẪN CHƯA đủ ${REQUIRED_MEASURES.length} số đo (thiếu: ${missingMeasures.join(', ')}) — chạy "node scripts/seedNganhHangSync.js --with-history" TRƯỚC, rồi mới chạy lại script này (nếu không, resync xong vẫn tiếp tục thiếu cột, vô ích).`);
    process.exit(1);
    return;
  }
  console.log(`✅ Job "${JOB_NAME}" (Id ${job.Id}) đã có đủ ${REQUIRED_MEASURES.length} số đo trong cấu hình — an toàn để resync.`);

  const sourceSystem = `ds${job.DataSourceId}`;

  const countResult = await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('sourceSystem', sql.VarChar(50), sourceSystem)
    .query('SELECT COUNT(*) AS SoLuong, MIN(EventDate) AS NgaySom, MAX(EventDate) AS NgayMuon FROM dwh.ReportFacts WHERE Domain = @domain AND SourceSystem = @sourceSystem');
  const row = countResult.recordset[0];

  console.log(`Job "${job.Name}" (Id ${job.Id}), SourceSystem="${sourceSystem}": ${row.SoLuong} dòng dwh.ReportFacts (từ ${row.NgaySom ? row.NgaySom.toISOString().slice(0,10) : '(rỗng)'} tới ${row.NgayMuon ? row.NgayMuon.toISOString().slice(0,10) : '(rỗng)'}) sẽ bị xoá + kéo lại TỪ ĐẦU. Job "Live" VÀ job "Nhập hàng theo ngành hàng - Lịch sử" KHÔNG bị đụng tới.`);
  console.log('\n‼️  CẢNH BÁO: đây là job "Lịch sử" quét ~93 bảng nhiều năm — kéo lại TỪ ĐẦU có thể mất NHIỀU TUẦN (xem chú thích đầu file). Trong lúc đó báo cáo "cùng kỳ năm trước" sẽ TRỐNG HẲN, không chỉ thiếu Bán lẻ/Bán buôn như hiện tại.');

  if (!confirmed) {
    console.log('\n(Chưa làm gì cả — đây là xem trước. Truyền --confirm để thực sự xoá + reset đồng bộ lại.)');
    process.exit(0);
  }

  await dwhPool.request()
    .input('domain', sql.VarChar(50), DOMAIN)
    .input('sourceSystem', sql.VarChar(50), sourceSystem)
    .query('DELETE FROM dwh.ReportFacts WHERE Domain = @domain AND SourceSystem = @sourceSystem');
  console.log(`✅ Đã xoá ${row.SoLuong} dòng (SourceSystem="${sourceSystem}").`);

  await adminPool.request()
    .input('id', sql.Int, job.Id)
    .input('ts', sql.DateTime2, EPOCH)
    .query(`
      MERGE etl.SyncState AS target
      USING (SELECT @id AS SyncJobId) AS src ON target.SyncJobId = src.SyncJobId
      WHEN MATCHED THEN UPDATE SET LastSyncedAt = @ts
      WHEN NOT MATCHED THEN INSERT (SyncJobId, LastSyncedAt) VALUES (@id, @ts);
    `);
  console.log(`✅ Đã reset mốc đồng bộ của job "${job.Name}" về đầu — lượt chạy kế tiếp (theo lịch "0 3 * * *", 1 lần/ngày) sẽ bắt đầu quét lại TOÀN BỘ lịch sử, lần này có đủ 8 số đo.`);

  console.log('\nXong. Theo dõi tiến độ ở etl-admin → Đồng bộ → Log (SyncState.LastSyncedAt tiến dần theo từng lượt chạy, SQL kiểm tra giống bản 9.88/9.89). Khi watermark tiến TỚI ĐÚNG ngày "cùng kỳ năm trước" cần xem, báo cáo "Doanh thu/Nhập hàng theo ngành hàng" sẽ tự có đủ số liệu Bán lẻ/Bán buôn cho cột "% so cùng kỳ năm trước", không cần làm gì thêm.');
  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
