// scripts/generateBranchCodeMapFromDiemStk.js — BACKFILL 1 LẦN cho dữ liệu
// "Ánh xạ Điểm - STK_ID" đã nhập TRƯỚC KHI tính năng tự đồng bộ (bản 6.80)
// tồn tại. Từ bản 6.80, mỗi lần lưu "Ánh xạ Điểm - STK_ID" (qua trang
// etl-admin, cả sửa 1 dòng lẫn nhập file) TỰ ĐỘNG đồng bộ luôn sang
// etl.BranchCodeMap — KHÔNG cần chạy script này nữa cho dữ liệu MỚI, chỉ
// cần cho dữ liệu ĐÃ CÓ SẴN từ trước bản 6.80 (đồng bộ 1 lần cho xong, sau
// đó mọi thay đổi tiếp theo đã tự động).
//
// 2 bảng phục vụ 2 việc KHÁC NHAU nên KHÔNG thể dùng chung 1 bảng thật
// (etl.BranchCodeMap là quy đổi 1-1: 1 mã BU_ID <-> ĐÚNG 1 mã STK_ID chuẩn,
// áp dụng LÚC ĐỒNG BỘ để domain "giaodich_chinhanh" ghép được với
// "doanhthu_chinhanh" trong dwh.ReportFacts; etl.DiemStkMapping là 1-nhiều,
// tách kỳ cũ/mới, áp dụng LÚC CHẠY BÁO CÁO) — nhưng vì giao dịch
// (TRANSHDR/BU_ID) vốn KHÔNG tách được theo từng kho STK_ID nhỏ hơn, quy về
// STK_ID nào trong số các kho hiện có của 1 mã Điểm CŨNG ĐƯỢC — báo cáo
// composite (block.useDiemStkMapping) sẽ CỘNG DỒN lại đúng theo mã Điểm ở
// bước sau, không quan trọng đã "chẻ" theo đúng kho con nào lúc đồng bộ.
//
// Ghi TRỰC TIẾP vào etl.BranchCodeMap (dùng ĐÚNG hàm upsertBranchCodeMap()
// mà route etl-admin đang dùng — cùng 1 đường MERGE, an toàn chạy lại nhiều
// lần) — không còn xuất ra file Excel trung gian như phiên bản trước bản
// 6.80 (đỡ 1 bước tải lên/nhập lại thủ công không cần thiết nữa).
//
// Cách dùng:
//   node scripts/generateBranchCodeMapFromDiemStk.js
require('dotenv').config();
const { getPool } = require('../db');
const { buildBranchCodeMapSyncRows } = require('../lib/diemStkMappingImport');
const { upsertBranchCodeMap } = require('../lib/branchCodeMapImport');

function parseStkList(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .query('SELECT MaDiem, MaStkCu, MaStkMoi, TenSieuThi FROM etl.DiemStkMapping ORDER BY MaDiem');

  const diemRows = result.recordset.map((r) => ({
    maDiem: r.MaDiem, maStkCu: parseStkList(r.MaStkCu), maStkMoi: parseStkList(r.MaStkMoi), tenSieuThi: r.TenSieuThi
  }));
  const { rows, skipped } = buildBranchCodeMapSyncRows(diemRows);

  if (!rows.length) {
    console.error('⛔ "Ánh xạ Điểm - STK_ID" chưa có dữ liệu (hoặc mọi dòng đều trống cả 2 cột mã kho) — khai bảng đó trước rồi chạy lại script này.');
    process.exit(1);
  }

  const { inserted, updated } = await upsertBranchCodeMap(pool, rows, 'backfill-script');

  console.log(`✅ Đã đồng bộ ${rows.length} mã Điểm sang "Ánh xạ mã chi nhánh" (LoaiMaKhac="BU_ID"): thêm mới ${inserted}, cập nhật ${updated}.`);
  if (skipped.length) {
    console.log(`⚠️  Bỏ qua ${skipped.length} mã Điểm CHƯA có mã kho nào (cả cũ lẫn mới) trong "Ánh xạ Điểm - STK_ID": ${skipped.join(', ')}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
