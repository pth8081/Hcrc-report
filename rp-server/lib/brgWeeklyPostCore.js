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
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');

const SALES_DOMAIN = 'doanhthu_sku_nganhhang';
const STOCK_DOMAIN = 'tonkho_chitiet_sku';
// STORE_REVENUE_DOMAIN/TRANSACTION_DOMAIN (bản 11.42, theo yêu cầu người
// dùng — đối chiếu file mẫu gốc phát hiện "Theo siêu thị" còn thiếu 3 cột
// "Số lượng Bill bán lẻ"/"Tổng doanh thu bán lẻ thực tế"/"Tỷ trọng DS KM/
// Tổng DS bán lẻ" so với sheet "By Store" gốc — đây là số liệu CẢ SIÊU
// THỊ (mọi mặt hàng, không riêng SKU khuyến mãi), ĐÃ CÓ SẴN domain dùng
// chung với báo cáo "Doanh thu tổng hợp HCRC" (xem
// lib/doanhThuTongHopHcrcRunner.js) — tái dùng NGUYÊN, không viết lại.
const STORE_REVENUE_DOMAIN = 'doanhthu_chinhanh'; // khoá STK_ID trực tiếp (entityCode), measure 'DoanhThu'.
const TRANSACTION_DOMAIN = 'giaodich_chinhanh'; // khoá BU_ID trực tiếp (entityCode, KHÁC STK_ID — 1 mã Điểm = ĐÚNG 1 BU_ID), measure 'SoGiaoDich'.

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

// SỬA bản 11.40 (theo yêu cầu người dùng — "đóng chiến dịch thì có xem
// báo cáo được không?") — TRƯỚC ĐÂY lọc `WHERE IsActive = 1`, nên chiến
// dịch ĐÃ ĐÓNG biến mất HẲN khỏi danh sách chọn ở bộ lọc báo cáo "BRG
// Weekly Post" — không ai xem/xuất lại được số liệu chiến dịch cũ nữa dù
// dữ liệu SKU/trọng số vẫn còn nguyên trong CSDL. Giờ liệt kê ĐỦ CẢ chiến
// dịch đã đóng (vẫn xem/xuất báo cáo được, CHỈ chặn sửa/nhập thêm dữ liệu
// ở etl-admin, xem etl/routes/admin/promoCampaigns.js) — trả thêm
// `isActive` để nơi gọi (routes/reports.js) tự đánh dấu "(Đã đóng)" trong
// nhãn hiển thị, phân biệt với chiến dịch đang chạy.
async function listCampaigns(pool) {
  const result = await pool.request().query(`
    SELECT Id, Name, StartDate, EndDate, IsActive FROM dwh.PromoCampaigns ORDER BY StartDate DESC
  `);
  return result.recordset.map(r => ({ id: r.Id, name: r.Name, startDate: r.StartDate, endDate: r.EndDate, isActive: !!r.IsActive }));
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
  const { skuMaster, sales, stock, storeWeights, diemMapping, stkToMaDiem, storeWideTotals } = data;
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
    // wide (bản 11.42) — Doanh thu/Bill bán lẻ CẢ SIÊU THỊ, KHÁC
    // `acc.actualRevenue` (chỉ riêng SKU khuyến mãi) — xem
    // fetchStoreWideTotals(). `storeWideTotals` CÓ THỂ undefined (caller
    // cũ/khác chưa truyền, vd nếu sau này có nơi khác gọi buildStoreRows()
    // mà không qua loadCampaignData()) — rơi về {} an toàn, không vỡ.
    const wide = (storeWideTotals && storeWideTotals.get(maDiem)) || {};
    const tongDoanhThuBanLe = wide.tongDoanhThuBanLe || 0;
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
      storeWeight: storeWeights.byMaDiem.get(maDiem) || 0,
      soLuongBillBanLe: wide.soLuongBillBanLe || 0,
      tongDoanhThuBanLe,
      tyTrongDoanhSoKmTrenTongBanLe: divOrNull(acc.actualRevenue, tongDoanhThuBanLe)
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
//
// SỬA LỖI THẬT (bản 11.49, báo cáo người dùng — đối chiếu trực tiếp
// `dbo.SKU_DEF` trên DSMART16 phát hiện: cột "Mã 10 số" người dùng nhập
// trong file chiến dịch — vd `1001254472` cho "Bưởi da xanh Mekostar" —
// THỰC RA LÀ `SKU_CODE`, KHÔNG PHẢI `SKU_ID` thật như tên cột/tài liệu
// trước giờ vẫn giả định — `SKU_ID` THẬT của chính sản phẩm đó là số 12
// CHỮ SỐ hoàn toàn khác (`292544720000`). Domain `doanhthu_sku_nganhhang`
// lọc theo cột `MaHang` = SKU_ID THẬT (12 số) — campaign gửi lên SKU_CODE
// (10 số, đúng mã trong file) nên KHÔNG BAO GIỜ khớp được dù doanh thu
// THẬT có tồn tại trong hệ thống. May mắn domain này CŨNG CÓ sẵn cột
// `MaHangHienThi` = SKU_CODE (ĐÚNG field campaign đang gửi lên, xem
// VIEW `V_HCRC_DOANHTHU_SKU_NGANHHANG`: `d.SKU_CODE AS MaHangHienThi`) —
// xử lý AN TOÀN theo CẢ 2 chiều, giống hệt cách đã sửa
// fetchCurrentStock() ở bản 11.48: lọc `IN (...)` với CẢ 2 ứng viên mỗi
// SKU (`maHang`/"Mã 10 số" VÀ `skuCode`/"Mã sản phẩm" 6 số) trên CẢ 2 cột
// (`MaHang` VÀ `MaHangHienThi`, đều ĐÃ có index riêng — vẫn SARGable),
// rồi DỊCH NGƯỢC giá trị THẬT khớp được (dù là SKU_ID hay SKU_CODE) về
// ĐÚNG `sku.maHang` (khoá canonical mọi nơi gọi đang dùng để tra cứu) qua
// `candidateToMaHang`.
//
// Tham số đổi từ `maHangList` (mảng string) sang `skuMaster` (mảng đầy
// đủ {maHang, skuCode,...}) để tự dựng đủ 2 ứng viên — ĐÃ SỬA nơi gọi ở
// loadCampaignData() bên dưới.
async function fetchActualSales(dwhPool, skuMaster, from, to) {
  const byMaHangTotal = new Map(); // maHang (canonical, = sku.maHang) -> {qty, revenue}
  const byMaHangStore = new Map(); // maHang (canonical) -> Map(stkId -> {qty, revenue})
  if (!skuMaster.length) return { byMaHangTotal, byMaHangStore };

  const candidateToMaHang = new Map();
  for (const sku of skuMaster) {
    candidateToMaHang.set(sku.maHang, sku.maHang);
    if (sku.skuCode) candidateToMaHang.set(sku.skuCode, sku.maHang);
  }
  const candidates = [...candidateToMaHang.keys()];

  for (const batch of chunk(candidates, SKU_BATCH_SIZE)) {
    const request = dwhPool.request();
    request.input('domain', sql.VarChar(50), SALES_DOMAIN);
    request.input('from', sql.Date, from);
    request.input('to', sql.Date, to);
    const placeholders = batch.map((code, i) => { request.input(`sku${i}`, sql.NVarChar(50), code); return `@sku${i}`; });
    const inClause = placeholders.join(',');
    const result = await request.query(`
      SELECT MaHang, MaHangHienThi, EntityCode, Dimensions, Measures
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EventDate BETWEEN @from AND @to
        AND (MaHang IN (${inClause}) OR MaHangHienThi IN (${inClause}))
    `);
    for (const row of result.recordset) {
      const maHang = candidateToMaHang.get(row.MaHang) || candidateToMaHang.get(row.MaHangHienThi);
      if (!maHang) continue; // an toàn — không nên xảy ra vì WHERE đã lọc đúng ứng viên
      const dims = JSON.parse(row.Dimensions || '{}');
      const measures = row.Measures ? JSON.parse(row.Measures) : {};
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
//
// SỬA LỖI THẬT (bản 11.48, báo cáo người dùng — đối chiếu trực tiếp
// dwh.ReportFacts phát hiện: với mã `1001254472`, cột `MaHangHienThi`
// của domain `tonkho_chitiet_sku` lưu NGUYÊN 10 số ĐẦY ĐỦ (= MaHang),
// KHÔNG phải mã hiển thị 6 số `254472` như quy ước "VIEW
// vw_TonKhoChiTietTheoSKU: MaHangHienThi = SKU_CODE" ở đa số SKU khác —
// khớp đúng kiểu dữ liệu NGUỒN (DSMART16) không nhất quán: 1 vài SKU (có
// thể do nhập tay/SKU mới tạo) có cột SKU_CODE TRÙNG LUÔN với SKU_ID đầy
// đủ, thay vì đúng mã rút gọn 6 số — khiến lọc CHỈ theo 6 số (`sku.skuCode`)
// bỏ sót HẲN các SKU rơi vào trường hợp này, luôn ra Tồn kho = 0 dù tồn
// kho thật > 0 (xem ảnh SSMS người dùng gửi — `SoLuongTon: 21.248` có
// thật khi lọc đúng theo mã 10 số). KHÔNG CÓ CÁCH nào biết trước SKU nào
// rơi vào trường hợp này (phụ thuộc dữ liệu nhập tay ở DSMART16, không
// suy luận được) — xử lý AN TOÀN theo cả 2 chiều:
//   1. Lọc IN (...) với CẢ 2 ứng viên mỗi SKU (`skuCode` 6 số VÀ `maHang`
//      10 số đầy đủ, hợp nhất + loại trùng) — VẪN SARGable (vẫn so sánh
//      TRỰC TIẾP cột `MaHangHienThi`, không bọc hàm nào, không mất index
//      seek đã sửa ở bản 11.38), chỉ nhiều giá trị hơn trong IN.
//   2. CHUẨN HOÁ khoá Map về ĐÚNG 6 số cuối (`.slice(-6)`) của GIÁ TRỊ
//      THẬT đọc được — KHÔNG dùng nguyên giá trị thô làm khoá nữa — nên
//      dù dòng khớp qua ứng viên 6 số hay ứng viên 10 số, khoá lưu vào
//      Map LUÔN là đúng 6 số, khớp đúng `sku.skuCode` (luôn 6 số, định
//      nghĩa `=RIGHT(MaHang,6)`) ở nơi gọi `stock.byCodeTotal.get(sku.skuCode)`.
// Tham số đổi từ `skuCodeList` (mảng string) sang `skuMaster` (mảng đầy
// đủ {skuCode, maHang,...}) để tự dựng đủ 2 ứng viên mỗi SKU — ĐÃ SỬA
// nơi gọi ở loadCampaignData() bên dưới.
async function fetchCurrentStock(dwhPool, skuMaster) {
  const byCodeTotal = new Map(); // skuCode (6 số, đã chuẩn hoá) -> qty
  const byCodeStore = new Map(); // skuCode (6 số, đã chuẩn hoá) -> Map(maChiNhanh -> qty)
  const candidateSet = new Set();
  for (const sku of skuMaster) {
    if (sku.skuCode) candidateSet.add(sku.skuCode);
    if (sku.maHang) candidateSet.add(sku.maHang);
  }
  const skuCodeList = [...candidateSet];
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
    // .slice(-6) — CHUẨN HOÁ về đúng 6 số cuối (xem chú thích bản 11.48 ở
    // trên) — áp dụng NGAY CẢ KHI giá trị thật đã đúng 6 số (slice(-6) của
    // chuỗi 6 ký tự trả về CHÍNH NÓ, không đổi hành vi cho SKU bình
    // thường).
    const rawCode = dims.MaHangHienThi && dims.MaHangHienThi.trim();
    const skuCode = rawCode ? rawCode.slice(-6) : null;
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

// fetchStoreWideTotals (bản 11.42, theo yêu cầu người dùng — đối chiếu
// file mẫu gốc "By Store" phát hiện báo cáo "Theo siêu thị" còn thiếu 3
// cột "Số lượng Bill bán lẻ"/"Tổng doanh thu bán lẻ thực tế"/"Tỷ trọng DS
// KM/Tổng DS bán lẻ") — ĐÚNG số liệu CẢ SIÊU THỊ (mọi mặt hàng, KHÔNG
// riêng SKU khuyến mãi), tái dùng NGUYÊN 2 domain đã có sẵn (dùng chung
// với "Báo cáo tổng hợp doanh thu HCRC", xem lib/doanhThuTongHopHcrcRunner.js)
// — KHÔNG viết lại logic đọc domain, chỉ ghép lại cho đúng khuôn báo cáo
// này (1 dòng/mã Điểm, gộp CẢ khoảng [from,to] thay vì từng ngày).
async function fetchStoreWideTotals(dwhPool, diemMapping, from, to) {
  const [revenueRaw, transactionRaw] = await Promise.all([
    fetchAllReportRows(dwhPool, { domain: STORE_REVENUE_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: { from, to } }),
    fetchAllReportRows(dwhPool, { domain: TRANSACTION_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: { from, to } })
  ]);
  // doanhthu_chinhanh khoá STK_ID TRỰC TIẾP (entityCode) — dịch qua
  // remapRowsToDiem() NHƯ MỌI domain khoá STK khác trong file này (trả
  // ĐỦ 1 dòng/mã Điểm, kể cả mã Điểm chưa có dòng doanh thu — measures={}).
  const revenueByDiem = remapRowsToDiem(aggregateDailyRowsByEntity(revenueRaw), diemMapping, false);
  // giaodich_chinhanh khoá BU_ID (1 mã Điểm = ĐÚNG 1 BU_ID, KHÁC STK_ID có
  // thể nhiều mã/mã Điểm) — dịch TAY qua buildBuIdLookup(), KHÔNG qua
  // remapRowsToDiem() (hàm đó chỉ hiểu đúng kiểu danh sách STK — xem chú
  // thích cùng mẫu ở lib/doanhThuTongHopHcrcRunner.js:sumTransactionsByBuId()).
  const buIdLookup = buildBuIdLookup(diemMapping);
  const transactionByDiem = new Map();
  for (const row of aggregateDailyRowsByEntity(transactionRaw)) {
    const maDiem = buIdLookup.get(row.entityCode);
    if (!maDiem) continue;
    const soGiaoDich = (row.measures && row.measures.SoGiaoDich) || 0;
    transactionByDiem.set(maDiem, (transactionByDiem.get(maDiem) || 0) + soGiaoDich);
  }
  const out = new Map();
  for (const r of revenueByDiem) {
    out.set(r.entityCode, {
      // SỬA LỖI THẬT (bản 11.46, phát hiện qua đối chiếu trực tiếp
      // Measures thật trong dwh.ReportFacts, báo cáo người dùng — "Tính
      // tự động" trọng số siêu thị RA 0 HẾT dù đã khớp đúng mã kho) — domain
      // `doanhthu_chinhanh` lưu measure "doanhThu" chữ "d" THƯỜNG (xem
      // measureColumns ở seedLdtdHcrcSync.js), KHÔNG PHẢI "DoanhThu" chữ
      // "D" HOA như domain `doanhthu_sku_nganhhang` (SALES_DOMAIN, measure
      // "DoanhThu" ĐÚNG — KHÔNG đổi, xem fetchActualSales() ở trên) — 2
      // domain khác nhau dùng 2 quy ước viết hoa/thường KHÁC NHAU cho cùng
      // 1 khái niệm, đọc nhầm khoá JSON này khiến KHÔNG BAO GIỜ ra đúng số
      // (luôn `undefined` -> về 0) dù mọi bước khớp mã (STK_ID/BU_ID/mã
      // Điểm) đều đúng từ đầu.
      tongDoanhThuBanLe: r.measures.doanhThu || 0,
      soLuongBillBanLe: transactionByDiem.get(r.entityCode) || 0
    });
  }
  return out;
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

  const [sales, stock, storeWideTotals] = await Promise.all([
    fetchActualSales(dwhPool, skuMaster, periodFrom, periodTo),
    fetchCurrentStock(dwhPool, skuMaster),
    // storeWideTotals (bản 11.42) — Doanh thu/Bill bán lẻ CẢ SIÊU THỊ
    // trong ĐÚNG khoảng [periodFrom, periodTo] (khớp đúng khoảng ngày
    // dùng cho SALES ở trên) — xem fetchStoreWideTotals().
    fetchStoreWideTotals(dwhPool, diemMapping, periodFrom, periodTo)
  ]);

  // buildBuIdLookup CHO sales/stock KHÔNG CẦN ở đây (2 domain đó không
  // khoá theo BU_ID) — chỉ cần dịch STK_ID -> mã Điểm cho sales.byMaHangStore
  // và MaChiNhanh (= STK_ID) -> mã Điểm cho stock.byCodeStore. buildBuIdLookup
  // THẬT SỰ dùng bên trong fetchStoreWideTotals() ở trên (domain
  // giaodich_chinhanh khoá BU_ID).
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
    sales, stock, storeWideTotals, periodFrom, periodTo,
    totalCampaignDays, elapsedDays, projectionFactor
  };
}

// Chi tiết TỪNG (siêu thị, SKU) — cross-join đầy đủ (bản 11.24, GỘP 2
// sheet "Từng ST.CH"/"Từng sản phẩm" của file mẫu — cả 2 sheet đó CÙNG 1
// bảng chi tiết (STORE x SKU), chỉ khác Excel dùng slicer/pivot để LỌC
// xem theo 1 chiều hay chiều khác — ở đây trả THẲNG toàn bộ, người xem tự
// lọc/sắp xếp trên bảng web theo tên ST.CH hay tên hàng, không cần 2 báo
// cáo riêng).
// computeTinhTrangTon (bản 11.42, theo yêu cầu người dùng — dò lại công
// thức cột "Tình trạng Tồn kho chưa đảm bảo 50% so với kế hoạch" của file
// mẫu gốc, trước đây "bc-brg-weekly-post.md" ghi "không suy ra được công
// thức nhất quán"). Đối chiếu TRỰC TIẾP công thức thật trong sheet "Data
// chi tiết" của file mẫu gốc (người dùng gửi lại), công thức ĐỦ 3 nhánh
// theo ngành hàng:
//   =IF(AND(OR(NH="ultra fresh",NH="NKTT UF"),(Tồn-KH/số ngày)<0),
//        "chưa đảm bảo",
//     IF(AND(NH="Fresh",(Tồn-KH*3/số ngày)<0),"chưa đảm bảo",
//       IF(AND((thiếu hụt/2+Tồn)<0,
//              OR(NH="Bánh kẹo",NH="Đồ uống",NH="Hóa mỹ phẩm",NH="Thực phẩm")),
//          "chưa đảm bảo",0)))
// CHỈ triển khai 2 NHÁNH ĐẦU — hợp lý về đơn vị (so "Tồn kho" là SỐ LƯỢNG
// với "Kế hoạch/số ngày CTKM" cũng SỐ LƯỢNG):
//   - "Ultra Fresh"/"NKTT UF" (giao hàng 1 ngày/lần, theo chú thích CHÍNH
//     file mẫu): Tồn < Kế hoạch ÷ số ngày CTKM → "Chưa đảm bảo".
//   - "Fresh" (giao hàng 3 ngày/lần — SỬA ĐÚNG LẠI công thức thật,
//     "Tồn − Kế hoạch×3/số ngày" KHÔNG PHẢI "Tồn/3" như bản nháp đầu —
//     nghĩa là so Tồn với nhu cầu 3 NGÀY tới, không phải chia Tồn cho 3):
//     Tồn < Kế hoạch × 3 ÷ số ngày CTKM → "Chưa đảm bảo".
// CỐ Ý KHÔNG làm nhánh thứ 3 (Bánh kẹo/Đồ uống/Hóa mỹ phẩm/Thực phẩm) —
// công thức gốc "(DS thiếu hụt/2 + Tồn) < 0" CỘNG THẲNG "DS thiếu hụt"
// (ĐƠN VỊ TIỀN — thường ÂM hàng triệu/tỷ đồng khi SKU CHƯA ĐẠT đủ kế
// hoạch, chuyện BÌNH THƯỜNG giữa kỳ CTKM) VỚI "Tồn" (ĐƠN VỊ SỐ LƯỢNG —
// chỉ vài/vài chục) — SAI THỨ NGUYÊN NGAY TỪ CHÍNH FILE MẪU GỐC, khiến
// nhánh này GẦN NHƯ LUÔN ra "chưa đảm bảo" cho MỌI SKU chưa đạt đủ kế
// hoạch bất kể tồn kho thật còn bao nhiêu — KHÔNG replicate 1 công thức
// đã sai thứ nguyên ngay từ nguồn. 4 ngành hàng này để trống (không đánh
// giá) — người xem tự đối chiếu "SL tồn"/"SL kế hoạch" nếu cần.
function computeTinhTrangTon(row, totalCampaignDays) {
  const dept = (row.deptName || '').trim().toLowerCase();
  if (dept === 'ultra fresh' || dept === 'nktt uf') {
    return (row.tonKho - row.soLuongKeHoach / totalCampaignDays) < 0 ? 'Chưa đảm bảo' : '';
  }
  if (dept === 'fresh') {
    return (row.tonKho - (row.soLuongKeHoach * 3) / totalCampaignDays) < 0 ? 'Chưa đảm bảo' : '';
  }
  return '';
}

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
        deptName: sku.deptName || null,
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

  const totalCampaignDays = data.totalCampaignDays || 1;
  for (const row of byKey.values()) {
    row.doanhThuThieuHut = row.doanhThuThucTe - row.doanhThuKeHoach;
    row.tinhTrangTon = computeTinhTrangTon(row, totalCampaignDays);
  }
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
// buildCampaignHeader (SỬA bản 11.48, theo yêu cầu người dùng — đối chiếu
// ảnh mẫu gốc "Thời gian CTKM"/"Thời gian cập nhật số liệu"/"Tồn kho" hiện
// NGAY trên báo cáo — TRƯỚC ĐÂY `periodLabel` CHỈ hiện đúng khoảng
// StartDate–EndDate của CẢ chiến dịch, KHÔNG hiện khoảng NGÀY THỰC TẾ đã
// dùng để tính "thực đạt"/"dự kiến" (`periodFrom`/`periodTo`, có thể NGẮN
// HƠN hẳn CTKM nếu campaign mới chạy vài ngày hoặc "Cập nhật số liệu tới
// ngày" đặt sớm hơn hôm nay), cũng KHÔNG hiện mốc snapshot Tồn kho đang
// dùng — gây khó phát hiện khi 1 trong 2 mốc đó bị cấu hình sai/cũ (đúng
// nguyên nhân nghi vấn của sự cố "SL/DS thực đạt luôn 0" đang điều tra).
// Nhận THẲNG `data` (kết quả đầy đủ loadCampaignData(), KHÔNG CHỈ
// `data.campaign` như trước) để đọc thêm `periodFrom`/`periodTo`/
// `stock.snapshotDate` — ĐÃ SỬA cả 5 nơi gọi hàm này (brgPost*Runner.js).
function buildCampaignHeader(data) {
  const campaign = data.campaign;
  const snapshotLabel = data.stock && data.stock.snapshotDate
    ? formatDateVN(data.stock.snapshotDate)
    : 'chưa có dữ liệu';
  return {
    displayTitle: `BRG Weekly Post — ${campaign.name}`,
    periodLabel: `Thời gian CTKM: ${formatDateVN(campaign.startDate)} – ${formatDateVN(campaign.endDate)}`
      + ` · Thời gian cập nhật số liệu: ${formatDateVN(data.periodFrom)} – ${formatDateVN(data.periodTo)}`
      + ` · Tồn kho: cập nhật tới ${snapshotLabel}`
  };
}

module.exports = {
  SALES_DOMAIN, STOCK_DOMAIN,
  loadCampaign, listCampaigns, loadSkuMaster, loadStoreWeights, allocateSkuTargetToStores,
  fetchActualSales, fetchCurrentStock, divOrNull, loadCampaignData, buildStoreRows, buildDetailRows,
  buildCampaignHeader
};
