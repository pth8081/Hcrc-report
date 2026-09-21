// routes/admin/salesTargets.js — Trang "Nhập chỉ tiêu": upload file Excel
// chỉ tiêu (target/KPI) theo tháng, ghi vào dwh.SalesTargets (bảng RIÊNG,
// KHÔNG chung dwh.ReportFacts — xem dwh/schema.sql). Dùng RIÊNG pool
// "DWH_TARGET_IMPORTER" (KHÔNG dùng pool "DWH"/etl_writer, quyền rộng hơn
// nhiều) — dù route này chạy trong CÙNG tiến trình etl với routes ghi
// dwh.ReportFacts, phòng thủ chiều sâu: lỗi ở route này không thể chạm được
// dwh.ReportFacts (xem dwh/grants.sql).
//
// TRƯỚC ĐÂY 1 trang "Nhập chỉ tiêu" chung (MenuCode 'sales-targets') — nay
// TÁCH thành 2 trang ĐỘC LẬP theo đúng 2 báo cáo tiêu thụ chỉ tiêu ("Lãnh
// đạo Tập đoàn" / "HCRC"), mỗi báo cáo do 1 nhóm khác nhau quản lý/nhập
// liệu (xem etl-db/schema.sql phần migrate MenuCode). Route logic HỆT NHAU
// giữa 2 trang (cùng bảng dwh.SalesTargets, cùng cách nhập Excel) — chỉ
// khác MenuCode kiểm quyền VÀ Domain — nên dựng thành factory
// createSalesTargetsRouter(menuCode, domain) thay vì chép file, mount 2
// lần ở server.js với 2 cặp (menuCode, domain) khác nhau.
//
// KHOÁ CỨNG Domain theo THAM SỐ (không đọc từ req.query/req.body nữa) —
// TRƯỚC ĐÂY domain do người dùng gõ tự do giống hệt nhau ở cả 2 trang,
// khiến 2 nhóm LDTD/HCRC dễ vô tình gõ TRÙNG 1 chuỗi domain (đều đang nhắm
// tới cùng nghiệp vụ "doanh thu chi nhánh") — dwh.SalesTargets khoá duy
// nhất theo (Domain, EntityCode, PeriodMonth) nên trùng domain sẽ khiến 2
// bên GHI ĐÈ CHỈ TIÊU CỦA NHAU, phá đúng yêu cầu "2 nhóm quản lý độc lập,
// chỉ khác import target" (rà soát theo yêu cầu người dùng). Domain khoá
// này KHÔNG cần trùng domain của khối "current"/"lastYear" bên báo cáo
// composite (rp-server) — khối "target" (isTarget:true) đọc targetDomain
// HOÀN TOÀN ĐỘC LẬP với domain của khối actual/cùng-kỳ, xem
// hướng_dẫn_báo_cáo.md mục 1 — nên 2 báo cáo LDTD/HCRC vẫn dùng CHUNG 1
// khối "current" (cùng số liệu thực đạt thật) nhưng trỏ "targetDomain" tới
// ĐÚNG 1 trong 2 domain khoá cứng dưới đây khi cấu hình báo cáo ở rp-user.
//
// Quyền: requireMenuAccess(menuCode) để xem, requireMenuEdit cho PUT/import
// — vai trò hệ thống luôn qua; vai trò khác cần được cấp đúng trang này
// (xem lib/adminPermissions.js).
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireMenuEdit } = require('../../lib/adminPermissions');
const { parseSalesTargetsFile, upsertSalesTargets, findUnknownEntityCodes, PERIOD_RE, PERIOD_DATE_RE, TRANG_THAI_VALUES } = require('../../lib/salesTargetsImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');

// memoryStorage — CHỈ đọc để parse ngay trong bộ nhớ, KHÔNG lưu file gốc
// lên đĩa (không cần giữ lại sau khi đã ghi xong dữ liệu vào DWH — tránh
// luôn câu hỏi path traversal của tên file gốc, khác template upload bên
// rp-server phải giữ file thật).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

// actualDataDomain (TUỲ CHỌN) — domain THỰC ĐẠT tương ứng (vd
// "doanhthu_chinhanh") dùng để ĐỐI CHIẾU EntityCode trong file chỉ tiêu vừa
// nhập với EntityCode THẬT đang có dữ liệu đồng bộ, cảnh báo (không chặn)
// mã gõ sai/nhầm chính tả — xem findUnknownEntityCodes() trong
// lib/salesTargetsImport.js. Bỏ trống thì KHÔNG đối chiếu (route dùng cho
// domain khác ngoài LDTD/HCRC, không biết chắc domain thực đạt nào tương
// ứng).
function createSalesTargetsRouter(menuCode, domain, actualDataDomain) {
const router = express.Router();
router.use(requireAdminAuth);

router.get('/', requireMenuAccess(menuCode), async (req, res, next) => {
  try {
    const { periodMonth } = req.query;
    const pool = await getPool('DWH_TARGET_IMPORTER');
    const request = pool.request().input('domain', sql.VarChar(50), domain);
    const conditions = ['Domain = @domain'];
    if (periodMonth) { request.input('periodMonth', sql.Date, periodMonth); conditions.push('PeriodMonth = @periodMonth'); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await request.query(`
      SELECT Id, Domain, EntityCode, PeriodMonth, TargetsJson, ImportedAt, ImportedBy
      FROM dwh.SalesTargets ${where}
      ORDER BY PeriodMonth DESC, EntityCode
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, domain: r.Domain, entityCode: r.EntityCode, periodMonth: r.PeriodMonth,
      targets: JSON.parse(r.TargetsJson), importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// Sửa/thêm ĐÚNG 1 dòng — dùng khi giữa tháng phát sinh đóng/mở siêu thị,
// KHÔNG cần chuẩn bị lại cả file Excel. Body PHẢI mang đủ "targets" hiện có
// (kể cả field không đổi) — route này GHI ĐÈ nguyên TargetsJson của dòng đó
// (giống hệt semantics import file, chỉ khác 1 dòng thay vì cả file), KHÔNG
// merge từng phần ở tầng server — tránh nhầm lẫn field nào bị giữ/field nào
// bị xoá nếu server tự ý merge. Giao diện (etl-admin) tự tải dữ liệu hiện
// có của dòng đó lên form trước khi cho sửa, để không mất dữ liệu ngoài ý
// muốn.
router.put('/one', requireMenuEdit(menuCode), async (req, res, next) => {
  try {
    const { entityCode, periodMonth, trangThai, targets } = req.body || {};
    if (!entityCode || !String(entityCode).trim()) return res.status(400).json({ error: 'Thiếu entityCode (mã siêu thị)' });
    // Chấp nhận CẢ 2 dạng — "YYYY-MM" (chỉ tiêu THEO THÁNG, hành vi cũ, quy
    // về ngày 1 đầu tháng) và "YYYY-MM-DD" (chỉ tiêu THEO NGÀY, dùng cho
    // LDTD/HCRC từ khi 2 mẫu file thật là chỉ tiêu ngày — xem
    // etl/lib/salesTargetsImport.js).
    let periodDateISO;
    if (PERIOD_RE.test(periodMonth || '')) periodDateISO = `${periodMonth}-01`;
    else if (PERIOD_DATE_RE.test(periodMonth || '')) periodDateISO = periodMonth;
    else return res.status(400).json({ error: '"periodMonth" phải dạng YYYY-MM (chỉ tiêu tháng) hoặc YYYY-MM-DD (chỉ tiêu theo ngày)' });
    if (trangThai && !TRANG_THAI_VALUES.includes(trangThai)) {
      return res.status(400).json({ error: `"trangThai" phải là một trong: ${TRANG_THAI_VALUES.join(', ')} (hoặc để trống)` });
    }

    const mergedTargets = { ...(targets || {}) };
    if (trangThai) mergedTargets.TrangThai = trangThai;
    else delete mergedTargets.TrangThai;
    if (!Object.keys(mergedTargets).length) {
      return res.status(400).json({ error: 'Không có giá trị chỉ tiêu nào (và không đánh dấu trangThai)' });
    }

    const pool = await getPool('DWH_TARGET_IMPORTER');
    const result = await upsertSalesTargets(pool, domain, [{
      entityCode: String(entityCode).trim(),
      periodMonth: new Date(`${periodDateISO}T00:00:00Z`),
      targets: mergedTargets
    }], req.admin.username);
    await logAction(req, { module: 'Nhập chỉ tiêu', actionType: 'SUA_CHI_TIEU', targetObject: `${domain}/${entityCode}/${periodMonth}`, description: `Sửa chỉ tiêu "${entityCode}" tháng ${periodMonth} (domain "${domain}")` });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/import', requireMenuEdit(menuCode), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    // fileFilter (đuôi .xlsx) chỉ soi được originalname, CHƯA có nội dung —
    // kiểm tra thêm chữ ký ZIP thật của file trước khi đưa vào ExcelJS,
    // chặn file đổi đuôi giả mạo (xem lib/fileSignature.js).
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }

    let parsed;
    try {
      parsed = await parseSalesTargetsFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) {
      return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });
    }

    const pool = await getPool('DWH_TARGET_IMPORTER');
    // preserveTrangThaiIfUnspecified: file nhập không nhất thiết có cột
    // TrangThai (chỉ dùng để sửa số liệu) — không được để re-upload âm thầm
    // mở lại 1 siêu thị đã đóng (xem chú thích trong lib/salesTargetsImport.js).
    const result = await upsertSalesTargets(pool, domain, rows, req.admin.username, { preserveTrangThaiIfUnspecified: true });
    await logAction(req, { module: 'Nhập chỉ tiêu', actionType: 'NHAP_CHI_TIEU', targetObject: domain, description: `Nhập file chỉ tiêu domain "${domain}": thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    // CẢNH BÁO (không chặn) mã EntityCode nào trong file không khớp bất kỳ
    // chi nhánh nào đang có dữ liệu đồng bộ thật — xem chú thích
    // findUnknownEntityCodes() trong lib/salesTargetsImport.js. Chạy SAU khi
    // đã nhập xong (không trì hoãn/chặn việc nhập chỉ vì lỗi đối chiếu).
    let unknownEntityCodes = [];
    try {
      unknownEntityCodes = await findUnknownEntityCodes(pool, actualDataDomain, rows.map(r => r.entityCode));
    } catch (warnErr) {
      console.warn('⚠️  [sales-targets] Không đối chiếu được EntityCode với dữ liệu thực đạt:', warnErr.message);
    }
    res.json({ ...result, rowErrors, unknownEntityCodes });
  } catch (err) { next(err); }
});

  return router;
}

module.exports = { createSalesTargetsRouter };
