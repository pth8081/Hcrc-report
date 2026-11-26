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

// Tỉ lệ siêu thị X = StoreWeight(X) / TỔNG trọng số các siêu thị CÓ ÁP
// DỤNG SKU này (sku.applyScope — 'Mart'/'MiniMart' loại hẳn siêu thị khác
// loại khỏi "tổng" trước khi chia, KHÔNG phải chia đều cho MỌI siêu thị
// rồi để siêu thị không áp dụng ra số dương vô lý) — áp tỉ lệ đó lên
// SoLuongKeHoachTotal/DoanhThuKeHoachTotal của SKU -> chỉ tiêu RIÊNG của
// từng siêu thị. Trả Map<MaDiem, {soLuongKeHoach, doanhThuKeHoach}>.
function allocateSkuTargetToStores(sku, storeWeights, diemMapping) {
  const out = new Map();
  const eligible = [...storeWeights.byMaDiem.entries()].filter(([maDiem]) => {
    if (sku.applyScope === 'All' || !sku.applyScope) return true;
    const info = diemMapping.get(maDiem);
    const loaiChuoi = info && info.loaiChuoi;
    if (sku.applyScope === 'Mart') return loaiChuoi === 'MART';
    if (sku.applyScope === 'MiniMart') return loaiChuoi === 'MINIMART';
    return true;
  });
  const eligibleTotal = eligible.reduce((s, [, w]) => s + w, 0);
  if (!eligibleTotal) return out;
  for (const [maDiem, weight] of eligible) {
    const ratio = weight / eligibleTotal;
    out.set(maDiem, {
      soLuongKeHoach: sku.soLuongKeHoachTotal * ratio,
      doanhThuKeHoach: sku.doanhThuKeHoachTotal * ratio
    });
  }
  return out;
}

// Dữ liệu theo TỪNG SIÊU THỊ (mã Điểm) — gộp CẢ 3 nguồn (thực tế bán
// hàng/tồn kho/chỉ tiêu đã phân bổ) qua TỪNG SKU rồi cộng dồn — dùng cho
// "By Store"/"Từng ST.CH"/mọi view theo siêu thị khác. KHÔNG gồm "Tổng
// doanh số bán lẻ thực tế"/"Số lượng Bill bán lẻ" CỦA CẢ SIÊU THỊ (mọi
// mặt hàng, không riêng SKU khuyến mãi) — file mẫu CÓ 2 cột đó nhưng cần
// đọc THÊM domain `doanhthu_chinhanh`/`giaodich_chinhanh` (tổng doanh thu/
// giao dịch CẢ siêu thị, không riêng SKU KM) — CHƯA làm ở bản này, xem
// "bc-brg-weekly-post.md" mục ghi chú phạm vi.
function buildStoreRows(data) {
  const { skuMaster, sales, stock, storeWeights, diemMapping, stkToMaDiem } = data;
  const perStore = new Map();
  function getAcc(maDiem) {
    let acc = perStore.get(maDiem);
    if (!acc) {
      acc = { actualQty: 0, actualRevenue: 0, targetQty: 0, targetRevenue: 0, stockQty: 0, stockValue: 0 };
      perStore.set(maDiem, acc);
    }
    return acc;
  }

  for (const sku of skuMaster) {
    const storeSalesMap = sales.byMaHangStore.get(sku.maHang);
    if (storeSalesMap) {
      for (const [stkId, v] of storeSalesMap) {
        const maDiem = stkToMaDiem.get(stkId);
        if (!maDiem) continue;
        const acc = getAcc(maDiem);
        acc.actualQty += v.qty; acc.actualRevenue += v.revenue;
      }
    }

    const valuationPrice = (sku.giaKmMart ?? sku.giaBanLe) || 0;
    const taxRate = sku.taxRate || 0;
    const storeStockMap = sku.skuCode ? stock.byCodeStore.get(sku.skuCode) : null;
    if (storeStockMap) {
      for (const [maChiNhanh, qty] of storeStockMap) {
        const maDiem = stkToMaDiem.get(maChiNhanh);
        if (!maDiem) continue;
        const acc = getAcc(maDiem);
        acc.stockQty += qty;
        acc.stockValue += qty * valuationPrice / (1 + taxRate);
      }
    }

    const allocation = allocateSkuTargetToStores(sku, storeWeights, diemMapping);
    for (const [maDiem, t] of allocation) {
      const acc = getAcc(maDiem);
      acc.targetQty += t.soLuongKeHoach;
      acc.targetRevenue += t.doanhThuKeHoach;
    }
  }

  const rows = [];
  for (const [maDiem, info] of diemMapping) {
    const acc = perStore.get(maDiem) || { actualQty: 0, actualRevenue: 0, targetQty: 0, targetRevenue: 0, stockQty: 0, stockValue: 0 };
    rows.push({
      maDiem,
      stkId: (info.maStkMoi || []).join(', ') || null,
      tenSieuThi: info.tenSieuThi || null,
      loaiChuoi: info.loaiChuoi || null,
      soLuongThucTe: acc.actualQty,
      soLuongKeHoach: acc.targetQty,
      doanhThuThucTe: acc.actualRevenue,
      doanhThuKeHoach: acc.targetRevenue,
      tyLeThucHien: divOrNull(acc.actualRevenue, acc.targetRevenue),
      tonKho: acc.stockQty,
      giaTriTon: acc.stockValue,
      storeWeight: storeWeights.byMaDiem.get(maDiem) || 0
    });
  }
  return rows;
}

// SKU_BATCH_SIZE (bản 11.38, SỬA LỖI THẬT — "Weekly Post không xuất được
// file", báo cáo người dùng) — TRƯỚC ĐÂY fetchActualSales()/fetchCurrentStock()
// gửi NGUYÊN danh sách mã hàng của CẢ chiến dịch thành 1 câu .input() MỖI mã
// (vd 1 chiến dịch "Black Friday" khai hàng trăm/hàng nghìn SKU qua nhiều
// ngành hàng — xem file campaign vừa test, SKU_ID tới hàng nghìn dòng) —
// KHÔNG có giới hạn nào. SQL Server chặn CỨNG tối đa ~2100 tham số/câu lệnh
// (`@domain`/`@from`/`@to` + N `@skuN`) — vượt ngưỡng này câu lệnh BỊ TỪ
// CHỐI NGAY (lỗi rõ ràng), nhưng NGAY CẢ KHI CHƯA chạm ngưỡng, hàng nghìn
// tham số trong 1 câu `IN (...)` khiến SQL Server BIÊN DỊCH kế hoạch truy
// vấn RẤT CHẬM (khác hẳn chi phí THỰC THI, không liên quan index) — đúng
// kiểu "treo lâu không ra file" người dùng mô tả (không phải lỗi hiện ra
// ngay, mà là CHỜ RẤT LÂU không phản hồi). Chia nhỏ danh sách mã hàng thành
// nhiều lượt gọi (≤ SKU_BATCH_SIZE mã/lượt, chạy TUẦN TỰ — tránh dồn nhiều
// kết nối cùng lúc vào pool DWH), gộp kết quả lại — mỗi câu lệnh giờ CHỈ
// còn tối đa vài trăm tham số, biên dịch nhanh như các domain khác.
const SKU_BATCH_SIZE = 400;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Bán hàng THỰC TẾ trong [from, to] — trả về CẢ tổng theo MaHang (chain-wide)
// VÀ chi tiết theo (MaHang, STK_ID) (cho "By Store"/drill-down).
async function fetchActualSales(dwhPool, maHangList, from, to) {
  const byMaHangTotal = new Map(); // maHang -> {qty, revenue}
  const byMaHangStore = new Map(); // maHang -> Map(stkId -> {qty, revenue})
  if (!maHangList.length) return { byMaHangTotal, byMaHangStore };

  for (const batch of chunk(maHangList, SKU_BATCH_SIZE)) {
    const request = dwhPool.request();
    request.input('domain', sql.VarChar(50), SALES_DOMAIN);
    request.input('from', sql.Date, from);
    request.input('to', sql.Date, to);
    const placeholders = batch.map((code, i) => { request.input(`sku${i}`, sql.NVarChar(50), code); return `@sku${i}`; });
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

  // SỬA LỖI HIỆU NĂNG THẬT (bản 11.38, theo báo cáo người dùng — "Weekly
  // Post xuất file bị treo", trong khi báo cáo khác đọc thẳng CSDL vẫn
  // nhanh bình thường) — TRƯỚC ĐÂY lọc TRỰC TIẾP qua JSON_VALUE(Dimensions,
  // '$.MaHangHienThi') ngay trong WHERE — hàm này KHÔNG SARGable (SQL
  // Server không seek được qua index cho biểu thức hàm gọi trực tiếp),
  // buộc QUÉT HẾT + tính JSON_VALUE() từng dòng của domain `tonkho_chitiet_sku`
  // ĐÚNG 1 ngày — domain này là "1 dòng/(chi nhánh, mã hàng)" cho TOÀN BỘ
  // danh mục CẢ CHUỖI (không riêng SKU khuyến mãi, xem
  // "bc-ton-kho-chi-tiet.md"), có thể hàng trăm nghìn dòng dù chỉ 1 ngày —
  // khác hẳn mọi báo cáo "đọc CSDL trực tiếp" KHÁC (luôn lọc qua cột
  // persisted-như-không-PERSISTED + index riêng, xem MaHang/MaNCC/
  // MaNganhHang ở dwh/schema.sql) nên KHÔNG chậm như domain này. Đã thêm
  // cột `MaHangHienThi` + index CÙNG MẪU ở dwh/schema.sql — lọc THẲNG theo
  // cột này (index seek, không gọi hàm trong WHERE nữa).
  const request = dwhPool.request();
  request.input('domain', sql.VarChar(50), STOCK_DOMAIN);
  request.input('snapshotDate', sql.Date, snapshotDate);
  const placeholders = skuCodeList.map((code, i) => { request.input(`sku${i}`, sql.NVarChar(50), code); return `@sku${i}`; });
  const result = await request.query(`
    SELECT Dimensions, Measures
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EventDate = @snapshotDate
      AND MaHangHienThi IN (${placeholders.join(',')})
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

  // "Dự kiến" (dò ngược khớp đúng số liệu mẫu thật — file mẫu ghi rõ
  // "Thời gian CTKM: 16/6-30/6/2026" = 15 ngày, "Thời gian cập nhật số
  // liệu: 16/6-17/6/2026" = 2 ngày ĐÃ QUA, tỉ lệ 2/15=0.133333 — khớp
  // ĐÚNG ô hiện trong file) — hệ số NGOẠI SUY = tổng số ngày kỳ CTKM / số
  // ngày ĐÃ QUA tính tới periodTo, dùng CHUNG cho mọi SKU/siêu thị: Dự
  // kiến = Thực tế × (totalCampaignDays / elapsedDays).
  const msPerDay = 86400000;
  const startISO = campaign.startDate.toISOString().slice(0, 10);
  const endISO = campaign.endDate.toISOString().slice(0, 10);
  const startUTC = new Date(`${startISO}T00:00:00Z`);
  const endUTC = new Date(`${endISO}T00:00:00Z`);
  const periodToUTC = new Date(`${periodTo}T00:00:00Z`);
  const totalCampaignDays = Math.round((endUTC - startUTC) / msPerDay) + 1;
  const elapsedDaysRaw = Math.round((periodToUTC - startUTC) / msPerDay) + 1;
  const elapsedDays = Math.max(1, Math.min(elapsedDaysRaw, totalCampaignDays));
  const projectionFactor = totalCampaignDays / elapsedDays;

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
      soLuongDuKien: actual.qty * projectionFactor,
      doanhThuDuKien: actual.revenue * projectionFactor,
      tyLeThucHien: divOrNull(actual.revenue, sku.doanhThuKeHoachTotal),
      tyLeDuKien: divOrNull(actual.revenue * projectionFactor, sku.doanhThuKeHoachTotal),
      tonKho: stockQty,
      giaTriTon
    };
  });

  return {
    campaign, skuMaster, skuRows, storeWeights, diemMapping, stkToMaDiem,
    sales, stock, periodFrom, periodTo,
    totalCampaignDays, elapsedDays, projectionFactor
  };
}

// Chi tiết TỪNG (siêu thị, SKU) — cross-join đầy đủ (bản 11.24, GỘP 2
// sheet "Từng ST.CH"/"Từng sản phẩm" của file mẫu — cả 2 sheet đó CÙNG 1
// bảng chi tiết (STORE x SKU), chỉ khác Excel dùng slicer/pivot để LỌC
// xem theo 1 chiều hay chiều khác — ở đây trả THẲNG toàn bộ, người xem tự
// lọc/sắp xếp trên bảng web theo tên ST.CH hay tên hàng, không cần 2 báo
// cáo riêng).
function buildDetailRows(data) {
  const { skuMaster, sales, stock, storeWeights, diemMapping, stkToMaDiem } = data;
  // 1 dòng/(maDiem, maHang), khởi tạo SẴN đủ mọi tổ hợp = 0 — rồi CỘNG
  // DỒN VÀO đúng dòng khi gặp dữ liệu, thay vì tính lại allocateSkuTargetToStores()
  // (vòng lặp bên trong, tốn O(siêu thị) mỗi lần) cho MỖI dòng — vòng lặp
  // NGOÀI theo SKU (mirror buildStoreRows()), tính 1 lần/SKU rồi rải vào
  // đúng dòng của từng siêu thị.
  const byKey = new Map(); // `${maDiem}|${maHang}` -> row
  function getRow(maDiem, info, sku) {
    const key = `${maDiem}|${sku.maHang}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        maDiem, tenSieuThi: info.tenSieuThi || null, maHang: sku.maHang, skuCode: sku.skuCode, skuName: sku.skuName,
        soLuongThucTe: 0, soLuongKeHoach: 0, doanhThuThucTe: 0, doanhThuKeHoach: 0, tonKho: 0, giaTriTon: 0
      };
      byKey.set(key, row);
    }
    return row;
  }

  for (const sku of skuMaster) {
    for (const [maDiem, info] of diemMapping) getRow(maDiem, info, sku); // đảm bảo CÓ dòng dù = 0

    const storeSalesMap = sales.byMaHangStore.get(sku.maHang);
    if (storeSalesMap) {
      for (const [stkId, v] of storeSalesMap) {
        const maDiem = stkToMaDiem.get(stkId);
        if (!maDiem) continue;
        const info = diemMapping.get(maDiem);
        const row = getRow(maDiem, info, sku);
        row.soLuongThucTe += v.qty; row.doanhThuThucTe += v.revenue;
      }
    }

    const valuationPrice = (sku.giaKmMart ?? sku.giaBanLe) || 0;
    const taxRate = sku.taxRate || 0;
    const storeStockMap = sku.skuCode ? stock.byCodeStore.get(sku.skuCode) : null;
    if (storeStockMap) {
      for (const [maChiNhanh, qty] of storeStockMap) {
        const maDiem = stkToMaDiem.get(maChiNhanh);
        if (!maDiem) continue;
        const info = diemMapping.get(maDiem);
        const row = getRow(maDiem, info, sku);
        row.tonKho += qty;
        row.giaTriTon += qty * valuationPrice / (1 + taxRate);
      }
    }

    const allocation = allocateSkuTargetToStores(sku, storeWeights, diemMapping);
    for (const [maDiem, t] of allocation) {
      const info = diemMapping.get(maDiem);
      const row = getRow(maDiem, info, sku);
      row.soLuongKeHoach += t.soLuongKeHoach;
      row.doanhThuKeHoach += t.doanhThuKeHoach;
    }
  }

  for (const row of byKey.values()) row.doanhThuThieuHut = row.doanhThuThucTe - row.doanhThuKeHoach;
  return [...byKey.values()];
}

// buildCampaignHeader (bản 11.35, theo yêu cầu người dùng — "Báo cáo
// Weekly post cũng cần thể hiện thời gian ngày nào đến ngày nào trong báo
// cáo và tiêu đề tên theo chiến dịch") — dùng CHUNG cho cả 5 sheet
// "BRG Weekly Post" (lib/brgPost*Runner.js), mỗi runner tự gọi SAU KHI đã
// có `data` (từ loadCampaignData()) rồi gắn `displayTitle`/`periodLabel`
// vào kết quả trả về — routes/reports.js:/export (và rp-user ReportsPage.jsx)
// đọc 2 field MỚI này để hiện tên chiến dịch + khoảng ngày thay cho tiêu
// đề/khoảng ngày tĩnh cũ (báo cáo này KHÔNG có bộ lọc kiểu ngày nào để
// dùng được cơ chế token "{ngayBaoCao}" sẵn có — xem lib/reportTitleDate.js).
// Dùng NGUYÊN kỳ chiến dịch (StartDate–EndDate) — KHÔNG dùng periodTo (số
// ngày ĐÃ CÓ dữ liệu, đổi mỗi ngày) — vì đây là "tên/khoảng ngày CỦA CHIẾN
// DỊCH", ổn định suốt vòng đời báo cáo, khớp đúng cách hiển thị ở dropdown
// "Chiến dịch khuyến mãi" (rp-user) đã có sẵn.
function formatDateVN(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return [dt.getUTCDate(), dt.getUTCMonth() + 1, dt.getUTCFullYear()]
    .map((n, i) => (i === 2 ? String(n) : String(n).padStart(2, '0')))
    .join('/');
}
function buildCampaignHeader(campaign) {
  return {
    displayTitle: `BRG Weekly Post — ${campaign.name}`,
    periodLabel: `${formatDateVN(campaign.startDate)} – ${formatDateVN(campaign.endDate)}`
  };
}

module.exports = {
  SALES_DOMAIN, STOCK_DOMAIN,
  loadCampaign, listCampaigns, loadSkuMaster, loadStoreWeights, allocateSkuTargetToStores,
  fetchActualSales, fetchCurrentStock, divOrNull, loadCampaignData, buildStoreRows, buildDetailRows,
  buildCampaignHeader
};
