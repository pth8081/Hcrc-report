// routes/admin/promoCampaigns.js — Trang "Chiến dịch khuyến mãi (BRG
// Weekly Post)": quản lý "dữ liệu gốc" từng chiến dịch khuyến mãi (Báo cáo
// 3 MKT) — tạo chiến dịch, upload file SKU + file trọng số siêu thị, ghi
// vào dwh.PromoCampaigns/PromoCampaignSkus/PromoCampaignStoreWeights (xem
// chú thích đầy đủ tại CREATE TABLE trong dwh/schema.sql +
// "bc-brg-weekly-post.md"). Dùng RIÊNG pool "DWH_PROMO_IMPORTER" (KHÔNG
// dùng pool "DWH"/etl_writer quyền rộng hơn — cùng tinh thần phòng thủ
// chiều sâu như routes/admin/salesTargets.js:DWH_TARGET_IMPORTER, xem
// dwh/grants.sql).
//
// Quyền: requireMenuEdit('promo-campaigns') CHO MỌI THAO TÁC KỂ CẢ XEM —
// ảnh hưởng trực tiếp số liệu báo cáo khuyến mãi, không có mức "chỉ xem".
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuEdit } = require('../../lib/adminPermissions');
const {
  parsePromoCampaignSkuFile, parsePromoCampaignStoreWeightFile,
  upsertPromoCampaignSkus, upsertPromoCampaignStoreWeights,
  buildPromoCampaignSkuTemplate, buildPromoCampaignStoreWeightTemplate,
  buildPromoCampaignSkuExport, buildPromoCampaignStoreWeightExport,
  computeStoreRevenueByMaDiem
} = require('../../lib/promoCampaignImport');
const { logAction } = require('../../lib/auditLog');
const { hasZipSignature } = require('../../lib/fileSignature');
const { sendXlsx } = require('../../lib/xlsxResponse');

const POOL = 'DWH_PROMO_IMPORTER';

// sanitizeFileNamePart (bản 11.39) — tên chiến dịch do admin tự gõ tự do,
// có thể lỡ chứa ký tự Windows/Excel CẤM trong tên file (vd "/" nếu ghi
// kiểu "T6/K2") — thay bằng "-" trước khi ghép vào tên file tải về.
function sanitizeFileNamePart(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '-');
}

// loadCampaignActiveStatus (bản 11.40, theo yêu cầu người dùng — "đóng
// chiến dịch thì có xem báo cáo được không?") — TRƯỚC ĐÂY campaign không
// có cách nào ĐÓNG thật sự (form sửa không có ô "Trạng thái", cột hiển thị
// luôn là "Đang hoạt động") — thêm nút Đóng/Mở lại THẬT (route
// PUT /:id/status bên dưới), kèm CHẶN sửa/nhập thêm dữ liệu khi đã đóng
// (idempotent, tránh sửa nhầm chiến dịch tưởng đã kết thúc) — xem các route
// dùng hàm này. Trả về `null` nếu không tìm thấy chiến dịch, ngược lại
// true/false theo đúng IsActive hiện tại.
async function loadCampaignActiveStatus(pool, campaignId) {
  const result = await pool.request().input('id', sql.Int, campaignId).query('SELECT IsActive FROM dwh.PromoCampaigns WHERE Id = @id');
  if (!result.recordset.length) return null;
  return !!result.recordset[0].IsActive;
}
const CAMPAIGN_CLOSED_MESSAGE = 'Chiến dịch đã đóng — bấm "Mở lại" ở danh sách chiến dịch trước khi sửa/nhập thêm dữ liệu.';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ nhận file .xlsx'), ok);
  }
});

const router = express.Router();
router.use(requireAdminAuth);
router.use(requireMenuEdit('promo-campaigns'));

// ---- Chiến dịch ----
router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const result = await pool.request().query(`
      SELECT c.Id, c.Name, c.StartDate, c.EndDate, c.DataUpdatedThrough, c.IsActive, c.CreatedAt, c.CreatedBy,
        (SELECT COUNT(*) FROM dwh.PromoCampaignSkus s WHERE s.CampaignId = c.Id) AS SkuCount,
        (SELECT COUNT(*) FROM dwh.PromoCampaignStoreWeights w WHERE w.CampaignId = c.Id) AS StoreWeightCount
      FROM dwh.PromoCampaigns c
      ORDER BY c.StartDate DESC
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, name: r.Name, startDate: r.StartDate, endDate: r.EndDate,
      dataUpdatedThrough: r.DataUpdatedThrough, isActive: !!r.IsActive,
      createdAt: r.CreatedAt, createdBy: r.CreatedBy,
      skuCount: r.SkuCount, storeWeightCount: r.StoreWeightCount
    })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, startDate, endDate, dataUpdatedThrough } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Thiếu tên chiến dịch' });
    if (!startDate || !endDate) return res.status(400).json({ error: 'Thiếu ngày bắt đầu/kết thúc' });

    const pool = await getPool(POOL);
    const result = await pool.request()
      .input('name', sql.NVarChar(200), String(name).trim())
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .input('dataUpdatedThrough', sql.Date, dataUpdatedThrough || null)
      .input('createdBy', sql.NVarChar(50), req.admin.username)
      .query(`
        INSERT INTO dwh.PromoCampaigns (Name, StartDate, EndDate, DataUpdatedThrough, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@name, @startDate, @endDate, @dataUpdatedThrough, @createdBy)
      `);
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Chiến dịch khuyến mãi', actionType: 'TAO_CHIEN_DICH_KM', targetObject: name, description: `Tạo chiến dịch "${name}" (Id ${id})` });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, startDate, endDate, dataUpdatedThrough } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Thiếu tên chiến dịch' });
    if (!startDate || !endDate) return res.status(400).json({ error: 'Thiếu ngày bắt đầu/kết thúc' });

    const pool = await getPool(POOL);
    // CHẶN sửa thông tin (tên/ngày) khi chiến dịch ĐÃ ĐÓNG (bản 11.40) —
    // "Trạng thái" (IsActive) đổi RIÊNG qua PUT /:id/status, KHÔNG còn nhận
    // ở route này nữa (tách hẳn 2 việc: sửa nội dung vs đóng/mở).
    const isActive = await loadCampaignActiveStatus(pool, req.params.id);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), String(name).trim())
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .input('dataUpdatedThrough', sql.Date, dataUpdatedThrough || null)
      .query(`
        UPDATE dwh.PromoCampaigns SET
          Name = @name, StartDate = @startDate, EndDate = @endDate,
          DataUpdatedThrough = @dataUpdatedThrough
        OUTPUT INSERTED.Id
        WHERE Id = @id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    await logAction(req, { module: 'Chiến dịch khuyến mãi', actionType: 'SUA_CHIEN_DICH_KM', targetObject: name, description: `Sửa chiến dịch "${name}" (Id ${req.params.id})` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Đóng/Mở lại chiến dịch (bản 11.40, theo yêu cầu người dùng — tách RIÊNG
// khỏi PUT /:id ở trên: đóng/mở là 1 THAO TÁC, không phải "sửa nội dung",
// và PHẢI làm được ngay cả khi chiến dịch đang đóng (để MỞ LẠI). Đóng
// chiến dịch KHÔNG xoá/ẩn dữ liệu báo cáo — xem lib/brgWeeklyPostCore.js:
// listCampaigns() vẫn liệt kê ĐỦ cả chiến dịch đã đóng trong bộ lọc báo
// cáo "BRG Weekly Post", CHỈ chặn sửa/nhập thêm dữ liệu ở các route khác.
router.put('/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'Thiếu isActive (true/false)' });

    const pool = await getPool(POOL);
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE dwh.PromoCampaigns SET IsActive = @isActive OUTPUT INSERTED.Name WHERE Id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    const name = result.recordset[0].Name;
    await logAction(req, {
      module: 'Chiến dịch khuyến mãi', actionType: isActive ? 'MO_LAI_CHIEN_DICH_KM' : 'DONG_CHIEN_DICH_KM',
      targetObject: name, description: `${isActive ? 'Mở lại' : 'Đóng'} chiến dịch "${name}" (Id ${req.params.id})`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const idReq = () => new sql.Request(tx).input('id', sql.Int, req.params.id);
      await idReq().query('DELETE FROM dwh.PromoCampaignSkus WHERE CampaignId = @id');
      await idReq().query('DELETE FROM dwh.PromoCampaignStoreWeights WHERE CampaignId = @id');
      const result = await idReq().query('DELETE FROM dwh.PromoCampaigns OUTPUT DELETED.Name WHERE Id = @id');
      await tx.commit();
      if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
      await logAction(req, { module: 'Chiến dịch khuyến mãi', actionType: 'XOA_CHIEN_DICH_KM', targetObject: result.recordset[0].Name, description: `Xoá chiến dịch "${result.recordset[0].Name}" (Id ${req.params.id}) — kèm toàn bộ SKU/trọng số siêu thị` });
      res.json({ ok: true });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (err) { next(err); }
});

// ---- SKU (chỉ tiêu cả chuỗi) ----
router.get('/:id/skus', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const result = await pool.request().input('campaignId', sql.Int, req.params.id).query(`
      SELECT Id, MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini, PromoNote,
        PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal, DoanhThuKeHoachTotal, ImportedAt, ImportedBy
      FROM dwh.PromoCampaignSkus WHERE CampaignId = @campaignId ORDER BY MaHang
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, maHang: r.MaHang, skuCode: r.SkuCode, skuName: r.SkuName, deptName: r.DeptName,
      giaBanLe: r.GiaBanLe, giaKmMart: r.GiaKmMart, giaKmMini: r.GiaKmMini, promoNote: r.PromoNote,
      percentKm: r.PercentKm, taxRate: r.TaxRate, applyScope: r.ApplyScope,
      soLuongKeHoachTotal: r.SoLuongKeHoachTotal, doanhThuKeHoachTotal: r.DoanhThuKeHoachTotal,
      importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// "Xuất file" (bản 11.39, theo yêu cầu người dùng) — xuất ĐÚNG danh sách
// SKU ĐANG LƯU của chiến dịch này, CÙNG KHUÔN CỘT file mẫu/file nhập (có
// thể nhập lại thẳng nếu cần sửa) — KHÁC "/skus/template" (2 dòng ví dụ cố
// định, không phải dữ liệu thật).
router.get('/:id/skus/export', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const campaign = await pool.request().input('id', sql.Int, req.params.id).query('SELECT Name FROM dwh.PromoCampaigns WHERE Id = @id');
    if (!campaign.recordset.length) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    const result = await pool.request().input('campaignId', sql.Int, req.params.id).query(`
      SELECT MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini, PromoNote,
        PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal, DoanhThuKeHoachTotal
      FROM dwh.PromoCampaignSkus WHERE CampaignId = @campaignId ORDER BY MaHang
    `);
    const rows = result.recordset.map(r => ({
      maHang: r.MaHang, skuCode: r.SkuCode, skuName: r.SkuName, deptName: r.DeptName,
      giaBanLe: r.GiaBanLe, giaKmMart: r.GiaKmMart, giaKmMini: r.GiaKmMini, promoNote: r.PromoNote,
      percentKm: r.PercentKm, taxRate: r.TaxRate, applyScope: r.ApplyScope,
      soLuongKeHoachTotal: r.SoLuongKeHoachTotal, doanhThuKeHoachTotal: r.DoanhThuKeHoachTotal
    }));
    const buffer = await buildPromoCampaignSkuExport(rows);
    sendXlsx(res, buffer, `sku-${sanitizeFileNamePart(campaign.recordset[0].Name)}.xlsx`);
  } catch (err) { next(err); }
});

router.get('/skus/template', async (req, res, next) => {
  try {
    const buffer = await buildPromoCampaignSkuTemplate();
    sendXlsx(res, buffer, 'mau-sku-chien-dich-km.xlsx');
  } catch (err) { next(err); }
});

router.post('/:id/skus/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }
    let parsed;
    try {
      parsed = await parsePromoCampaignSkuFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });

    const pool = await getPool(POOL);
    const isActive = await loadCampaignActiveStatus(pool, req.params.id);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const result = await upsertPromoCampaignSkus(pool, Number(req.params.id), rows, req.admin.username);
    await logAction(req, { module: 'Chiến dịch khuyến mãi', actionType: 'NHAP_SKU_CHIEN_DICH_KM', targetObject: `Campaign ${req.params.id}`, description: `Nhập file SKU chiến dịch: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

router.delete('/:id/skus/:skuRowId', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const isActive = await loadCampaignActiveStatus(pool, req.params.id);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const result = await pool.request()
      .input('id', sql.Int, req.params.skuRowId)
      .input('campaignId', sql.Int, req.params.id)
      .query('DELETE FROM dwh.PromoCampaignSkus OUTPUT DELETED.MaHang WHERE Id = @id AND CampaignId = @campaignId');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng SKU' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Trọng số siêu thị ----
router.get('/:id/store-weights', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const result = await pool.request().input('campaignId', sql.Int, req.params.id).query(`
      SELECT Id, MaDiem, StoreWeight, ImportedAt, ImportedBy
      FROM dwh.PromoCampaignStoreWeights WHERE CampaignId = @campaignId ORDER BY MaDiem
    `);
    res.json(result.recordset.map(r => ({
      id: r.Id, maDiem: r.MaDiem, storeWeight: r.StoreWeight, importedAt: r.ImportedAt, importedBy: r.ImportedBy
    })));
  } catch (err) { next(err); }
});

// "Xuất file" trọng số siêu thị (bản 11.39) — cùng tinh thần
// "/:id/skus/export" ở trên.
router.get('/:id/store-weights/export', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const campaign = await pool.request().input('id', sql.Int, req.params.id).query('SELECT Name FROM dwh.PromoCampaigns WHERE Id = @id');
    if (!campaign.recordset.length) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    const result = await pool.request().input('campaignId', sql.Int, req.params.id).query(`
      SELECT MaDiem, StoreWeight FROM dwh.PromoCampaignStoreWeights WHERE CampaignId = @campaignId ORDER BY MaDiem
    `);
    const rows = result.recordset.map(r => ({ maDiem: r.MaDiem, storeWeight: r.StoreWeight }));
    const buffer = await buildPromoCampaignStoreWeightExport(rows);
    sendXlsx(res, buffer, `trong-so-sieu-thi-${sanitizeFileNamePart(campaign.recordset[0].Name)}.xlsx`);
  } catch (err) { next(err); }
});

router.get('/store-weights/template', async (req, res, next) => {
  try {
    const buffer = await buildPromoCampaignStoreWeightTemplate();
    sendXlsx(res, buffer, 'mau-trong-so-sieu-thi-km.xlsx');
  } catch (err) { next(err); }
});

router.post('/:id/store-weights/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file (.xlsx)' });
    if (!hasZipSignature(req.file.buffer)) {
      return res.status(400).json({ error: 'File không đúng định dạng .xlsx (sai chữ ký file)' });
    }
    let parsed;
    try {
      parsed = await parsePromoCampaignStoreWeightFile(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const { rows, rowErrors } = parsed;
    if (!rows.length) return res.status(400).json({ error: 'Không có dòng hợp lệ nào trong file', rowErrors });

    const pool = await getPool(POOL);
    const isActive = await loadCampaignActiveStatus(pool, req.params.id);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const result = await upsertPromoCampaignStoreWeights(pool, Number(req.params.id), rows, req.admin.username);
    await logAction(req, { module: 'Chiến dịch khuyến mãi', actionType: 'NHAP_TRONGSO_CHIEN_DICH_KM', targetObject: `Campaign ${req.params.id}`, description: `Nhập file trọng số siêu thị: thêm mới ${result.inserted}, cập nhật ${result.updated} dòng` });
    res.json({ ...result, rowErrors });
  } catch (err) { next(err); }
});

router.delete('/:id/store-weights/:weightRowId', async (req, res, next) => {
  try {
    const pool = await getPool(POOL);
    const isActive = await loadCampaignActiveStatus(pool, req.params.id);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const result = await pool.request()
      .input('id', sql.Int, req.params.weightRowId)
      .input('campaignId', sql.Int, req.params.id)
      .query('DELETE FROM dwh.PromoCampaignStoreWeights OUTPUT DELETED.MaDiem WHERE Id = @id AND CampaignId = @campaignId');
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy dòng trọng số' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Tính tự động" trọng số theo doanh thu (bản 11.44, theo yêu cầu người
// dùng — "nhập tay Trọng số mất thời gian, hệ thống có sẵn doanh thu rồi,
// tự tính giúp được không?") — tính lại StoreWeight của MỌI mã Điểm ĐANG
// CÓ trong danh sách trọng số của chiến dịch (phải nhập "Mã điểm" qua
// "Nhập file trọng số" TRƯỚC — cột "Trọng số" lúc đó điền tạm số nào cũng
// được, sẽ bị GHI ĐÈ ở đây), lấy TỔNG doanh thu CẢ SIÊU THỊ trong `days`
// ngày gần nhất tính tới HÔM NAY làm trọng số — đúng khuyến nghị đã tư vấn
// người dùng (dùng doanh thu TUYỆT ĐỐI gần đây, KHÔNG phải tỉ lệ đạt kế
// hoạch; khoảng ngày KHÔNG cần khớp đúng số ngày chiến dịch).
//
// etl.DiemStkMapping nằm ở CSDL HCRC_ETL (CSDL riêng của chính app này) —
// đọc qua pool 'ADMIN' như mọi route etl khác, KHÔNG qua pool POOL (CSDL
// HCRC_DWH). dwh.ReportFacts đọc qua ĐÚNG pool POOL (SELECT-ONLY, xem
// dwh/grants.sql) — KHÔNG mượn pool 'DWH'/etl_writer quyền rộng hơn, giữ
// đúng tinh thần phòng thủ chiều sâu của cả file này.
router.post('/:id/store-weights/auto-calculate', async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const days = Number(req.body && req.body.days);
    if (!Number.isFinite(days) || days < 1 || days > 366) {
      return res.status(400).json({ error: 'Thiếu/sai "days" (số ngày gần nhất, số nguyên 1-366)' });
    }

    const pool = await getPool(POOL);
    const isActive = await loadCampaignActiveStatus(pool, campaignId);
    if (isActive === null) return res.status(404).json({ error: 'Không tìm thấy chiến dịch' });
    if (!isActive) return res.status(400).json({ error: CAMPAIGN_CLOSED_MESSAGE });

    const existing = await pool.request().input('campaignId', sql.Int, campaignId)
      .query('SELECT MaDiem FROM dwh.PromoCampaignStoreWeights WHERE CampaignId = @campaignId');
    if (!existing.recordset.length) {
      return res.status(400).json({
        error: 'Chưa có siêu thị nào trong danh sách trọng số — nhập file "Mã điểm" trước (cột "Trọng số" điền tạm số bất kỳ, sẽ được tính lại ở đây), rồi bấm "Tính tự động".'
      });
    }

    const adminPool = await getPool('ADMIN');
    const diemRows = await adminPool.request().query('SELECT MaDiem, MaStkMoi FROM etl.DiemStkMapping WHERE IsActive = 1');
    const stkToMaDiem = new Map();
    for (const r of diemRows.recordset) {
      for (const stk of String(r.MaStkMoi || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        stkToMaDiem.set(stk, r.MaDiem);
      }
    }

    const toDate = new Date();
    const toISO = toDate.toISOString().slice(0, 10);
    const fromDate = new Date(toDate.getTime() - (days - 1) * 86400000);
    const fromISO = fromDate.toISOString().slice(0, 10);

    const revenueByMaDiem = await computeStoreRevenueByMaDiem(pool, stkToMaDiem, fromISO, toISO);

    for (const row of existing.recordset) {
      const weight = revenueByMaDiem.get(row.MaDiem) || 0;
      await pool.request()
        .input('campaignId', sql.Int, campaignId)
        .input('maDiem', sql.NVarChar(50), row.MaDiem)
        .input('weight', sql.Decimal(18, 2), weight)
        .query('UPDATE dwh.PromoCampaignStoreWeights SET StoreWeight = @weight, ImportedAt = SYSUTCDATETIME() WHERE CampaignId = @campaignId AND MaDiem = @maDiem');
    }

    await logAction(req, {
      module: 'Chiến dịch khuyến mãi', actionType: 'TU_DONG_TINH_TRONGSO_CHIEN_DICH_KM',
      targetObject: `Campaign ${campaignId}`,
      description: `Tính tự động trọng số theo doanh thu ${days} ngày gần nhất (${fromISO} - ${toISO}) cho ${existing.recordset.length} siêu thị`
    });
    res.json({ updated: existing.recordset.length, from: fromISO, to: toISO });
  } catch (err) { next(err); }
});

module.exports = router;
