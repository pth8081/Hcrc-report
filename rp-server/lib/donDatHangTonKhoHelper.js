// lib/donDatHangTonKhoHelper.js — Bản 9.95, theo yêu cầu người dùng: tái
// dùng domain `don_dat_hang` (đã đồng bộ sẵn cho 6 báo cáo "Đơn đặt hàng"/
// "Đơn nhập hàng"/"So sánh đặt–nhận", xem bc-don-dat-hang.md) để TÍNH 2 cột
// "Chờ nhập (NCC)"/"Đã nhập hôm nay (NCC)" cho báo cáo "Top bán chạy đang
// tồn kho = 0" (bc-ton-kho-0.md) — KHÔNG cần DBA xây VIEW/job riêng mới cho
// 2 cột này (trước đó dự kiến domain riêng `chonhap_ncc`/`danhap_ncc` CHƯA
// từng được xây thật).
//
// CÔNG THỨC — ĐÚNG công thức ĐÃ XÁC NHẬN, đang chạy thật ở báo cáo "So sánh
// đặt–nhận" (`lib/purchaseOrderRunner.js:aggregateByOrder()`), KHÔNG phải
// công thức mới: với MỖI đơn (nhóm theo BU_ID + SoDon + MaHangHienThi),
// SoLuongTheoDon = tổng SL các dòng ĐẶT (LoaiGiaoDich 133/130/330),
// SoLuongThucNhan = tổng SL các dòng NHẬN (333) CÙNG đơn đó (xử lý đúng
// trường hợp 1 đơn nhận NHIỀU LẦN). "Chờ nhập" của 1 đơn = phần dương của
// (SoLuongTheoDon - SoLuongThucNhan) — CLAMP VỀ 0 THEO TỪNG ĐƠN TRƯỚC KHI
// cộng dồn nhiều đơn lại (đơn khác bị nhận THỪA do nhập sai KHÔNG được phép
// "bù" cho đơn đang thiếu hàng của SKU khác, đó là 2 vấn đề độc lập) — rồi
// CỘNG DỒN qua mọi đơn ĐẶT trong `pendingWindowDays` ngày gần nhất (mặc
// định 90 — đơn đặt quá 90 ngày vẫn chưa nhận coi như không còn ý nghĩa
// "đang chờ nhập" thực tế nữa, theo thống nhất với người dùng bản 9.95).
// "Đã nhập hôm nay" = tổng SL mọi dòng `333` có EventDate = đúng hôm nay,
// KHÔNG cần nhóm theo đơn (chỉ cần tổng đã về trong ngày).
//
// GIỚI HẠN QUAN TRỌNG (đã báo cho người dùng, bản 9.95) — domain
// `don_dat_hang` CHỈ có dữ liệu từ NHÀ CUNG CẤP (NCC), KHÔNG có "Điều
// chuyển" (chuyển hàng nội bộ giữa chi nhánh) — 2 cột "Chờ nhập (Điều
// chuyển)"/"Đã nhập hôm nay (Điều chuyển)" ở bc-ton-kho-0.md VẪN CẦN domain
// riêng do DBA xây (chưa có), KHÔNG xử lý được bằng helper này.
//
// KHOÁ NỐI (JOIN KEY) — don_dat_hang gắn theo BU_ID (mã Điểm thô) +
// MaHangHienThi (= SKU_CODE, THÊM bản 9.95 — xem VIEW
// `dbo.vw_DonDatHangChiNhanh` ở bc-don-dat-hang.md mục 2, JOIN thêm
// SKU_DEF), trong khi domain `banhang_sku`/`tonkho_sku` (dùng cho báo cáo
// "Top bán chạy đang tồn kho = 0") khoá theo STK_ID (mã KHO, KHÔNG phải mã
// Điểm) + MaHangHienThi — PHẢI dịch BU_ID → mã Điểm → (các) STK_ID qua
// bảng "Ánh xạ Điểm - STK_ID" (`lib/diemStkMapping.js`) mới ghép được, xem
// expandToEntityMap() bên dưới. 1 mã Điểm có thể ứng với NHIỀU STK_ID (vd
// nhiều ngành/khối hàng trong cùng 1 siêu thị) — cùng 1 số "Chờ/Đã nhập"
// của 1 mã Điểm được gán cho MỌI STK_ID thuộc mã Điểm đó mang ĐÚNG mã hàng
// — KHÔNG phải lỗi trùng lặp: 1 mã hàng thực tế chỉ tồn tại ở ĐÚNG 1 STK_ID
// trong số đó (theo cấu trúc ngành hàng DSMART16), nên chỉ ĐÚNG 1 trong số
// các entityCode "nhân bản" này thật sự được báo cáo tra tới (các entityCode
// còn lại đơn giản không khớp dòng tồn/bán nào, không bao giờ hiện ra).
//
// BU_ID CHƯA KHAI trong bảng "Ánh xạ Điểm - STK_ID" (cột BuId để trống) ->
// đơn đặt hàng của mã Điểm đó BỊ BỎ QUA ở đây (không đoán bừa) — ĐÚNG hành
// vi `buildBuIdLookup()` đã áp dụng cho purchaseOrderRunner.js.
const { sql } = require('../db');
const { loadDiemStkMapping } = require('./diemStkMapping');

const DON_DAT_HANG_DOMAIN = 'don_dat_hang';
const DEFAULT_PENDING_WINDOW_DAYS = 90;

function dayOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "Chờ nhập (NCC)" — xem công thức đầy đủ ở đầu file. CTE RecentOrders chỉ
// lọc NGÀY ĐẶT (133) trong cửa sổ — KHÔNG lọc EventDate của dòng NHẬN (333)
// nữa (đã rút kinh nghiệm lỗi bản 9.17 ở purchaseOrderRunner.js: lọc trước
// khi gộp theo đơn làm rụng mất dòng cần ghép cặp) — PerOrder JOIN lại toàn
// bộ dòng (133 VÀ 333) của ĐÚNG những đơn đó, bất kể dòng 333 rơi ngày nào.
async function queryChoNhapNcc(pool, pendingFrom, today) {
  const req = pool.request();
  req.input('domain', sql.VarChar(50), DON_DAT_HANG_DOMAIN);
  req.input('pendingFrom', sql.Date, pendingFrom);
  req.input('today', sql.Date, today);
  const result = await req.query(`
    WITH RecentOrders AS (
      SELECT DISTINCT
        JSON_VALUE(Dimensions, '$.SoDon') AS SoDon,
        JSON_VALUE(Dimensions, '$.MaDiem') AS BuId
      FROM dwh.ReportFacts
      WHERE Domain = @domain
        AND JSON_VALUE(Dimensions, '$.LoaiGiaoDich') = '133'
        AND EventDate >= @pendingFrom AND EventDate <= @today
    ),
    PerOrder AS (
      SELECT ro.BuId, ro.SoDon, JSON_VALUE(f.Dimensions, '$.MaHangHienThi') AS SkuCode,
        SUM(CASE WHEN JSON_VALUE(f.Dimensions, '$.LoaiGiaoDich') IN ('133','130','330')
                 THEN CAST(JSON_VALUE(f.Measures, '$.SoLuong') AS DECIMAL(18,4)) ELSE 0 END) AS SoLuongTheoDon,
        SUM(CASE WHEN JSON_VALUE(f.Dimensions, '$.LoaiGiaoDich') = '333'
                 THEN CAST(JSON_VALUE(f.Measures, '$.SoLuong') AS DECIMAL(18,4)) ELSE 0 END) AS SoLuongThucNhan
      FROM dwh.ReportFacts f
      INNER JOIN RecentOrders ro
        ON JSON_VALUE(f.Dimensions, '$.SoDon') = ro.SoDon
        AND JSON_VALUE(f.Dimensions, '$.MaDiem') = ro.BuId
      WHERE f.Domain = @domain
      GROUP BY ro.BuId, ro.SoDon, JSON_VALUE(f.Dimensions, '$.MaHangHienThi')
    )
    SELECT BuId, SkuCode,
      SUM(CASE WHEN SoLuongTheoDon - SoLuongThucNhan > 0 THEN SoLuongTheoDon - SoLuongThucNhan ELSE 0 END) AS ChoNhap
    FROM PerOrder
    WHERE SkuCode IS NOT NULL
    GROUP BY BuId, SkuCode
  `);
  return result.recordset;
}

// "Đã nhập hôm nay (NCC)" — tổng SL dòng 333 đúng hôm nay, không cần nhóm
// theo đơn (chỉ cần tổng đã về trong ngày, không quan tâm đơn nào).
async function queryDaNhapHomNayNcc(pool, today) {
  const req = pool.request();
  req.input('domain', sql.VarChar(50), DON_DAT_HANG_DOMAIN);
  req.input('today', sql.Date, today);
  const result = await req.query(`
    SELECT JSON_VALUE(Dimensions, '$.MaDiem') AS BuId, JSON_VALUE(Dimensions, '$.MaHangHienThi') AS SkuCode,
      SUM(CAST(JSON_VALUE(Measures, '$.SoLuong') AS DECIMAL(18,4))) AS DaNhap
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EventDate = @today
      AND JSON_VALUE(Dimensions, '$.LoaiGiaoDich') = '333'
      AND JSON_VALUE(Dimensions, '$.MaHangHienThi') IS NOT NULL
    GROUP BY JSON_VALUE(Dimensions, '$.MaDiem'), JSON_VALUE(Dimensions, '$.MaHangHienThi')
  `);
  return result.recordset;
}

// Dịch (BU_ID, SkuCode) -> (các) EntityCode "<STK_ID>_<SkuCode>" — xem chú
// thích "KHOÁ NỐI" ở đầu file cho lý do 1 BU_ID có thể giãn ra nhiều
// entityCode. Dùng gán (=), KHÔNG cộng dồn (+=) — mỗi entityCode "nhân bản"
// đại diện ĐÚNG 1 giá trị gốc của mã Điểm đó, không phải nhiều giá trị
// khác nhau cần gộp.
function expandToEntityMap(rows, qtyField, buIdToMaDiem, diemMapping) {
  const map = new Map();
  for (const row of rows) {
    if (!row.SkuCode) continue;
    const maDiem = buIdToMaDiem.get(row.BuId);
    if (!maDiem) continue; // BU_ID chưa khai ánh xạ — bỏ qua, không đoán bừa
    const info = diemMapping.get(maDiem);
    if (!info || !info.maStkMoi.length) continue;
    const qty = Number(row[qtyField]) || 0;
    for (const stk of info.maStkMoi) {
      map.set(`${stk}_${row.SkuCode}`, qty);
    }
  }
  return map;
}

// pool PHẢI là pool DWH (đọc dwh.ReportFacts) — KHÁC pool ETL_DIEM_STK mà
// loadDiemStkMapping() tự mở riêng, không cần truyền vào đây.
async function loadDonDatHangPendingReceivedByEntity(pool, { today, pendingWindowDays } = {}) {
  const todayDay = dayOnly(today || new Date());
  const windowDays = Number.isFinite(Number(pendingWindowDays)) && Number(pendingWindowDays) > 0
    ? Number(pendingWindowDays) : DEFAULT_PENDING_WINDOW_DAYS;
  const pendingFrom = new Date(todayDay);
  pendingFrom.setUTCDate(pendingFrom.getUTCDate() - windowDays);

  const [choNhapRows, daNhapRows, diemMapping] = await Promise.all([
    queryChoNhapNcc(pool, pendingFrom, todayDay),
    queryDaNhapHomNayNcc(pool, todayDay),
    loadDiemStkMapping()
  ]);

  const buIdToMaDiem = new Map();
  for (const [maDiem, info] of diemMapping) {
    if (info.buId) buIdToMaDiem.set(info.buId, maDiem);
  }

  return {
    choNhapNccByEntity: expandToEntityMap(choNhapRows, 'ChoNhap', buIdToMaDiem, diemMapping),
    daNhapNccByEntity: expandToEntityMap(daNhapRows, 'DaNhap', buIdToMaDiem, diemMapping)
  };
}

module.exports = { loadDonDatHangPendingReceivedByEntity, DEFAULT_PENDING_WINDOW_DAYS };
