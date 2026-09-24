// scripts/generateBranchCodeMapFromDiemStk.js — Tự dựng sẵn file Excel để
// nhập vào "Ánh xạ mã chi nhánh" (etl.BranchCodeMap), LẤY DỮ LIỆU TỪ
// "Ánh xạ Điểm - STK_ID" (etl.DiemStkMapping) đã khai — người dùng không
// cần gõ tay lại 2 lần cùng 1 dữ liệu.
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
// Script này vì vậy LẤY LUÔN mã kho ĐẦU TIÊN trong "Mã STK_ID (Điểm mới)"
// (hoặc "Điểm cũ" nếu "Điểm mới" trống — mã Điểm đã đóng) làm MaChuan.
//
// KHÔNG tự ghi vào etl.BranchCodeMap — chỉ xuất file .xlsx ĐÚNG khuôn cột
// nút "Nhập file ánh xạ" ở trang "Ánh xạ mã chi nhánh" đang chấp nhận, để
// người dùng xem lại rồi tự nhập (đúng quy trình có kiểm tra trùng/lỗi sẵn
// của trang đó), không có gì ghi thẳng CSDL "sau lưng" người dùng.
//
// Cách dùng:
//   node scripts/generateBranchCodeMapFromDiemStk.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getPool } = require('../db');

function parseStkList(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const pool = await getPool('ADMIN');
  const result = await pool.request()
    .query('SELECT MaDiem, MaStkCu, MaStkMoi, TenSieuThi FROM etl.DiemStkMapping ORDER BY MaDiem');

  const rows = [];
  const skipped = [];
  for (const r of result.recordset) {
    const moi = parseStkList(r.MaStkMoi);
    const cu = parseStkList(r.MaStkCu);
    const maChuan = moi[0] || cu[0];
    if (!maChuan) {
      skipped.push(r.MaDiem);
      continue;
    }
    rows.push({ maDiem: r.MaDiem, maChuan, tenSieuThi: r.TenSieuThi || '', tuKho: moi[0] ? 'Điểm mới' : 'Điểm cũ' });
  }

  if (!rows.length) {
    console.error('⛔ "Ánh xạ Điểm - STK_ID" chưa có dữ liệu (hoặc mọi dòng đều trống cả 2 cột mã kho) — khai bảng đó trước rồi chạy lại script này.');
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Anh xa ma chi nhanh');
  const headerRow = sheet.addRow(['LoaiMaKhac', 'MaKhac', 'MaChuan', 'TenSieuThi', 'TrangThai']);
  headerRow.font = { bold: true };
  for (const r of rows) sheet.addRow(['BU_ID', r.maDiem, r.maChuan, r.tenSieuThi, '']);
  sheet.columns.forEach((col) => { col.width = 22; });

  const exportDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outputPath = path.join(exportDir, `anh-xa-mac-chi-nhanh-tu-diem-stk-${stamp}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Đã xuất ${rows.length} dòng vào: ${outputPath}`);
  console.log('   Cột LoaiMaKhac cố định "BU_ID" — khớp đúng "Ánh xạ mã chi nhánh" đã chọn ở job Đồng bộ Giao dịch (Live/Lịch sử).');
  console.log('   Tải file này về, xem lại, rồi nhập qua nút "Nhập file ánh xạ" ở trang "Ánh xạ mã chi nhánh" — KHÔNG tự động ghi CSDL.');
  if (skipped.length) {
    console.log(`⚠️  Bỏ qua ${skipped.length} mã Điểm CHƯA có mã kho nào (cả cũ lẫn mới) trong "Ánh xạ Điểm - STK_ID": ${skipped.join(', ')}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
