// lib/brgWeeklyPostCore.js — Lõi dùng CHUNG cho mọi "view"/báo cáo của
// "BRG Weekly Post" (Báo cáo 3 MKT, bản 11.24) — ghép "dữ liệu gốc" của 1
// chiến dịch khuyến mãi (dwh.PromoCampaigns/PromoCampaignSkus/
// PromoCampaignStoreWeights — admin tự upload, xem etl/lib/promoCampaignImport.js)
// VỚI số liệu THỰC TẾ đọc từ 2 domain ĐÃ CÓ SẴN:
//   - `doanhthu_sku_nganhhang` (bán hàng, 1 dòng/(STK_ID, SKU_ID, ngày)) —
//     xem "bc-doanh-thu-sku-nganhhang.md". Join theo MaHang (SKU_ID đầy
//     đủ, dimension `MaHang` của domain đó).
//   - `tonkho_chitiet_sku` (tồn kho, 1 dòng/(STK_ID, SKU_ID, ngày đồng
//     bộ)) — xem "bc-ton-kho-chi-tiet.md". Join theo `MaHangHienThi` (mã
//     hiển thị 6 số — domain này KHÔNG có dimension SKU_ID đầy đủ) VÀ
//     `MaChiNhanh` (= STK_ID) — LẤY ĐÚNG NGÀY ĐỒNG BỘ GẦN NHẤT (MAX
//     EventDate toàn domain, mirror ý "Tồn kho: 17h00 - ngày X" trong file
//     mẫu — 1 mốc giờ CHUNG cho mọi siêu thị, không phải watermark riêng
//     từng dòng).
//
// ⚠️ GIẢ ĐỊNH CHƯA XÁC NHẬN (xem "bc-brg-weekly-post.md" mục ghi chú) —
// "Số lượng"/"Doanh thu" dùng số GỘP CHUNG bán lẻ+bán buôn (measures
// SoLuongBan/DoanhThu của domain doanhthu_sku_nganhhang) — domain đó
// KHÔNG tách được SỐ LƯỢNG riêng bán lẻ (chỉ tách được DOANH THU qua
// DoanhThuBanLe/DoanhThuBanBuon) — khác quy ước "loại trừ bán buôn" đã
// áp cho domain `doanhthu_the_chinhanh` (2 báo cáo "theo tuần") vì đó là
// quyết định RIÊNG cho 2 báo cáo đó, KHÔNG áp dụng ngầm định cho báo cáo
// này (file mẫu BRG Weekly Post không có ghi chú nào về loại trừ bán
// buôn) — báo lại nếu cần tách.
//
// Mã Điểm/Siêu thị: domain `doanhthu_sku_nganhhang`/`tonkho_chitiet_sku`
// khoá theo STK_ID/MaChiNhanh THÔ — dịch sang mã Điểm chuẩn qua
// lib/diemStkMapping.js (CÙNG 1 cơ chế dùng khắp hệ thống), KHÔNG tự suy
// tên/nhóm trực tiếp từ VIEW nguồn (đúng quy ước bắt buộc CLAUDE.md).
const { sql, getPool } = require('../db');
const { loadDiemStkMapping, remapRowsToDiem } = require('./diemStkMapping');

const SALES_DOMAIN = 'doanhthu_sku_nganhhang';
const STOCK_DOMAIN = 'tonkho_chitiet_sku';

async function loadCampaign(pool, campaignId) {
  const result = await pool.request().input('id', sql.Int, campaignId).query(`
    SELECT Id, Name, StartDate, EndDate, DataUpdatedThrough, IsActive
    FROM dwh.PromoCampaigns WHERE Id = @id
  `);
  if (!result.recordset.length) return null;
  const r = result.recordset[0];
  return {
    id: r.Id, name: r.Name, startDate: r.StartDate, endDate: r.EndDate,
    dataUpdatedThrough: r.DataUpdatedThrough, isActive: !!r.IsActive
  };
}

async function listCampaigns(pool) {
  const result = await pool.request().query(`
    SELECT Id, Name, StartDate, EndDate FROM dwh.PromoCampaigns WHERE IsActive = 1 ORDER BY StartDate DESC
  `);
  return result.recordset.map(r => ({ id: r.Id, name: r.Name, startDate: r.StartDate, endDate: r.EndDate }));
}

async function loadSkuMaster(pool, campaignId) {
  const result = await pool.request().input('campaignId', sql.Int, campaignId).query(`
    SELECT MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini, PromoNote,
      PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal, DoanhThuKeHoachTotal
    FROM dwh.PromoCampaignSkus WHERE CampaignId = @campaignId ORDER BY MaHang
  `);
  return result.recordset.map(r => ({
    maHang: r.MaHang, skuCode: r.SkuCode, skuName: r.SkuName, deptName: r.DeptName,
    giaBanLe: r.GiaBanLe, giaKmMart: r.GiaKmMart, giaKmMini: r.GiaKmMini, promoNote: r.PromoNote,
    percentKm: r.PercentKm, taxRate: r.TaxRate, applyScope: r.ApplyScope,
    soLuongKeHoachTotal: r.SoLuongKeHoachTotal || 0, doanhThuKeHoachTotal: r.DoanhThuKeHoachTotal || 0
  }));
}

// Map<MaDiem, weight> + tổng trọng số (CHIA chỉ tiêu cả chuỗi về từng
// siêu thị — xem dwh/schema.sql CREATE TABLE PromoCampaignStoreWeights).
async function loadStoreWeights(pool, campaignId) {
  const result = await pool.request().input('campaignId', sql.Int, campaignId).query(`
    SELECT MaDiem, StoreWeight FROM dwh.PromoCampaignStoreWeights WHERE CampaignId = @campaignId
  `);
  const byMaDiem = new Map();
  let total = 0;
  for (const r of result.recordset) {
    byMaDiem.set(r.MaDiem, r.StoreWeight);
    total += r.StoreWeight;
  }
  return { byMaDiem, total };
}

// Tỉ lệ siêu thị X = StoreWeight(X) / tổng — áp dụng tỉ lệ đó lên
// SoLuongKeHoachTotal/DoanhThuKeHoachTotal của 1 SKU -> ra chỉ tiêu RIÊNG
// của siêu thị X cho SKU đó. Trả Map<MaDiem, {soLuongKeHoach, doanhThuKeHoach}>.
function allocateSkuTargetToStores(sku, storeWeights) {
  const out = new Map();
  if (!storeWeights.total) return out;
  for (const [maDiem, weight] of storeWeights.byMaDiem) {
    const ratio = weight / storeWeights.total;
    out.set(maDiem, {
      soLuongKeHoach: sku.soLuongKeHoachTotal * ratio,
      doanhThuKeHoach: sku.doanhThuKeHoachTotal * ratio
    });
  }
  return out;
}

// Bán hàng THỰC TẾ trong [from, to] — trả về CẢ tổng theo MaHang (chain-wide)
// VÀ chi tiết theo (MaHang, STK_ID) (cho "By Store"/drill-down).
async function fetchActualSales(dwhPool, maHangList, from, to) {
  const byMaHangTotal = new Map(); // maHang -> {qty, revenue}
  const byMaHangStore = new Map(); // maHang -> Map(stkId -> {qty, revenue})
  if (!maHangList.length) return { byMaHangTotal, byMaHangStore };

  const request = dwhPool.request();
  request.input('domain', sql.VarChar(50), SALES_DOMAIN);
  request.input('from', sql.Date, from);
  request.input('to', sql.Date, to);
  const placeholders = maHangList.map((code, i) => { request.input(`sku${i}`, sql.NVarChar(50), code); return `@sku${i}`; });
  const result = await request.query(`
    SELECT MaHang, EntityCode, Dimensions, Measures
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EventDate BETWEEN @from AND @to
      AND MaHang IN (${placeholders.join(',')})
  `);
  for (const row of result.recordset) {
    const dims = JSON.parse(row.Dimensions || '{}');
    const measures = row.Measures ? JSON.parse(row.Measures) : {};
    const maHang = row.MaHang;
    const stkId = dims.STK_ID && dims.STK_ID.trim();
    const qty = measures.SoLuongBan || 0;
    const revenue = measures.DoanhThu || 0;
    if (!byMaHangTotal.has(maHang)) byMaHangTotal.set(maHang, { qty: 0, revenue: 0 });
    const totalAcc = byMaHangTotal.get(maHang);
    totalAcc.qty += qty; totalAcc.revenue += revenue;

    if (!stkId) continue;
    if (!byMaHangStore.has(maHang)) byMaHangStore.set(maHang, new Map());
    const storeMap = byMaHangStore.get(maHang);
    if (!storeMap.has(stkId)) storeMap.set(stkId, { qty: 0, revenue: 0 });
    const storeAcc = storeMap.get(stkId);
    storeAcc.qty += qty; storeAcc.revenue += revenue;
  }
  return { byMaHangTotal, byMaHangStore };
}

// Tồn kho HIỆN TẠI (snapshot ngày đồng bộ GẦN NHẤT toàn domain) — join
// theo SkuCode (mã hiển thị 6 số, domain KHÔNG có SKU_ID đầy đủ). Trả
// CẢ tổng theo skuCode (chain-wide) VÀ chi tiết theo (skuCode, MaChiNhanh).
async function fetchCurrentStock(dwhPool, skuCodeList) {
  const byCodeTotal = new Map(); // skuCode -> qty
  const byCodeStore = new Map(); // skuCode -> Map(maChiNhanh -> qty)
  if (!skuCodeList.length) return { byCodeTotal, byCodeStore, snapshotDate: null };

  const dateResult = await dwhPool.request().input('domain', sql.VarChar(50), STOCK_DOMAIN)
    .query('SELECT MAX(EventDate) AS LatestDate FROM dwh.ReportFacts WHERE Domain = @domain');
  const snapshotDate = dateResult.recordset[0].LatestDate;
  if (!snapshotDate) return { byCodeTotal, byCodeStore, snapshotDate: null };

  // KHÔNG có cột MaHangHienThi riêng (persisted/indexed) trên dwh.ReportFacts
  // như MaHang/MaNCC/MaNganhHang (chỉ domain đó mới cần lọc nhanh theo mã
  // hàng ở TẦNG FILTER của reportEngine.js — domain `tonkho_chitiet_sku`
  // CHƯA từng cần, xem dwh/schema.sql) — lọc TRỰC TIẾP qua JSON_VALUE, an
  // toàn vì đã giới hạn EventDate = 1 NGÀY DUY NHẤT trước (số dòng nhỏ,
  // không cần index riêng).
  const request = dwhPool.request();
  request.input('domain', sql.VarChar(50), STOCK_DOMAIN);
  request.input('snapshotDate', sql.Date, snapshotDate);
  const placeholders = skuCodeList.map((code, i) => { request.input(`sku${i}`, sql.NVarChar(50), code); return `@sku${i}`; });
  const result = await request.query(`
    SELECT Dimensions, Measures
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EventDate = @snapshotDate
      AND JSON_VALUE(Dimensions, '$.MaHangHienThi') IN (${placeholders.join(',')})
  `);
  for (const row of result.recordset) {
    const dims = JSON.parse(row.Dimensions || '{}');
    const measures = row.Measures ? JSON.parse(row.Measures) : {};
    const skuCode = dims.MaHangHienThi && dims.MaHangHienThi.trim();
    const maChiNhanh = dims.MaChiNhanh && dims.MaChiNhanh.trim();
    const qty = measures.SoLuongTon || 0;
    if (!skuCode) continue;
    byCodeTotal.set(skuCode, (byCodeTotal.get(skuCode) || 0) + qty);
    if (!maChiNhanh) continue;
    if (!byCodeStore.has(skuCode)) byCodeStore.set(skuCode, new Map());
    const storeMap = byCodeStore.get(skuCode);
    storeMap.set(maChiNhanh, (storeMap.get(maChiNhanh) || 0) + qty);
  }
  return { byCodeTotal, byCodeStore, snapshotDate };
}

function divOrNull(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

// Ghép TOÀN BỘ dữ liệu của 1 chiến dịch — dùng CHUNG cho mọi "view" phía
// sau. `periodFrom/periodTo` mặc định = [StartDate, DataUpdatedThrough ||
// hôm nay] (nếu cần khác, caller tự cắt lại trên `skuRows`/`byMaHangStore`
// trả về, không cần gọi lại DB).
async function loadCampaignData(campaignId, periodFromOverride, periodToOverride) {
  // dwh.PromoCampaigns/PromoCampaignSkus/PromoCampaignStoreWeights nằm
  // trong CSDL DWH (CÙNG dwh.ReportFacts) — pool 'DWH' (rpt_reader, SELECT
  // trên CẢ SCHEMA::dwh, xem dwh/grants.sql), KHÔNG phải pool 'RP' (CSDL
  // app.ReportCatalog... khác hẳn).
  const dwhPool = await getPool('DWH');

  const campaign = await loadCampaign(dwhPool, campaignId);
  if (!campaign) throw new Error(`Không tìm thấy chiến dịch Id=${campaignId}`);

  const [skuMaster, storeWeights, diemMapping] = await Promise.all([
    loadSkuMaster(dwhPool, campaignId),
    loadStoreWeights(dwhPool, campaignId),
    loadDiemStkMapping()
  ]);

  const periodFrom = periodFromOverride || campaign.startDate.toISOString().slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);
  const periodTo = periodToOverride
    || (campaign.dataUpdatedThrough ? campaign.dataUpdatedThrough.toISOString().slice(0, 10) : todayISO);

  const maHangList = skuMaster.map(s => s.maHang);
  const skuCodeList = skuMaster.filter(s => s.skuCode).map(s => s.skuCode);

  const [sales, stock] = await Promise.all([
    fetchActualSales(dwhPool, maHangList, periodFrom, periodTo),
    fetchCurrentStock(dwhPool, skuCodeList)
  ]);

  // buildBuIdLookup không cần ở đây (báo cáo này không dùng domain
  // giaodich_chinhanh) — chỉ cần dịch STK_ID -> mã Điểm cho sales.byMaHangStore
  // và MaChiNhanh (= STK_ID) -> mã Điểm cho stock.byCodeStore.
  const stkToMaDiem = new Map();
  for (const [maDiem, info] of diemMapping) {
    for (const stk of info.maStkMoi) stkToMaDiem.set(stk, maDiem);
  }

  // skuRows — 1 dòng/SKU, CHỈ TIÊU + THỰC TẾ CẢ CHUỖI (đúng khuôn "By items").
  // "Giá trị tồn" (bản 11.24) — dò ngược khớp ĐÚNG số liệu mẫu thật:
  // tonKho × GiaKmMart / (1 + TaxRate) — tức tồn kho được VALUE theo GIÁ
  // KHUYẾN MÃI MART, CHƯA GỒM VAT (ví dụ "Bia 333": tonKho=207985,
  // GiaKmMart=12000, TaxRate=0.1 -> 207985 × 12000/1.1 = 2,268,927,272.73,
  // khớp TUYỆT ĐỐI số liệu mẫu). Mã KHÔNG có GiaKmMart (chỉ áp dụng
  // MiniMart) rơi về GiaBanLe (chưa xác nhận bằng số liệu mẫu — mẫu KHÔNG
  // có dòng kiểu này để đối chiếu, nhưng là lựa chọn an toàn nhất).
  const skuRows = skuMaster.map(sku => {
    const actual = sales.byMaHangTotal.get(sku.maHang) || { qty: 0, revenue: 0 };
    const stockQty = sku.skuCode ? (stock.byCodeTotal.get(sku.skuCode) || 0) : 0;
    const valuationPrice = (sku.giaKmMart ?? sku.giaBanLe) || 0;
    const taxRate = sku.taxRate || 0;
    const giaTriTon = stockQty * valuationPrice / (1 + taxRate);
    return {
      ...sku,
      soLuongThucTe: actual.qty,
      doanhThuThucTe: actual.revenue,
      tyLeThucHien: divOrNull(actual.revenue, sku.doanhThuKeHoachTotal),
      tonKho: stockQty,
      giaTriTon
    };
  });

  return {
    campaign, skuMaster, skuRows, storeWeights, diemMapping, stkToMaDiem,
    sales, stock, periodFrom, periodTo
  };
}

module.exports = {
  SALES_DOMAIN, STOCK_DOMAIN,
  loadCampaign, listCampaigns, loadSkuMaster, loadStoreWeights, allocateSkuTargetToStores,
  fetchActualSales, fetchCurrentStock, divOrNull, loadCampaignData
};
