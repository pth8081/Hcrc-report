// lib/diemStkMapping.js — Đọc etl.DiemStkMapping (CSDL HCRC_ETL, pool RIÊNG
// "ETL_DIEM_STK", CHỈ ĐỌC) — ánh xạ mã "Điểm" (dùng nguyên trong file chỉ
// tiêu LDTD/HCRC) sang NHIỀU mã kho STK_ID thật trong dwh.ReportFacts (domain
// doanh thu), tách theo kỳ CŨ (MaStkCu — cùng kỳ năm trước) / MỚI (MaStkMoi
// — hiện tại), VÀ mã BU_ID thật trong TRANSHDR (domain giao dịch) — xem "quy
// tắc mã BU_ID và STK_ID.md" (nguồn tham chiếu chính thức, đối chiếu TRƯỚC
// khi sửa gì ở đây): BU_ID là mã Điểm, KHÔNG THAY ĐỔI theo thời gian — CHỈ 1
// GIÁ TRỊ DUY NHẤT dùng CHUNG cho cả 2 kỳ (KHÔNG tách cũ/mới như
// MaStkCu/MaStkMoi — TRANSHDR không có cột STK_ID để tách theo kỳ). Đại
// lượng THẬT SỰ có khái niệm "cũ/mới" chỉ là STK (kho, domain doanh thu) —
// xem etl-db/schema.sql CREATE TABLE cho giải thích đầy đủ, và
// lib/compositeReportRunner.js (block.useDiemStkMapping/block.mapBuIdToMaDiem)
// cho nơi tiêu thụ.
//
// LoaiChuoi ('MART'/'MINIMART', TUỲ CHỌN, admin tự khai) — GHI ĐÈ "chain"
// tự động (STOCK.TYPE qua domain doanhthu_chinhanh) khi có, dùng cho
// groupBy nhóm MART/MINIMART ở seedLdtdHcrcReports.js — xem remapRowsToDiem()
// bên dưới và etl-db/schema.sql.
//
// buildBuIdLookup() KHÔNG tự suy BU_ID theo quy tắc "+00" nữa (đã bỏ sau
// khi người dùng chỉ rõ: đó chỉ là quan sát từ các mẫu ĐÃ kiểm tra qua SQL,
// KHÔNG phải quy tắc DSMART áp dụng chung — tự suy cho mã CHƯA kiểm tra có
// rủi ro sai âm thầm) — CHỈ khớp mã Điểm nào đã khai BuId tường minh trong
// bảng "Ánh xạ Điểm - STK_ID".
//
// Cache TTL ngắn (60s, giống lib/permissions.js) — bảng này ít đổi, tránh
// mỗi lượt chạy báo cáo composite đều phải round-trip CSDL riêng.
//
// LỖI KẾT NỐI (.env chưa cấu hình ETL_DIEM_STK_*, hoặc CSDL tạm không tới
// được) KHÔNG NÉM RA NGOÀI — trả về Map RỖNG kèm cảnh báo console, để 1 báo
// cáo bật useDiemStkMapping chỉ mất đúng phần dữ liệu của nó (rơi về "không
// có dữ liệu" cho mọi mã Điểm, không lỗi 500 cả report), rút kinh nghiệm từ
// lỗi thật đã gặp: rp-server/lib/permissions.js từng ném lỗi DWH ra tận
// route đăng nhập — bài học là KHÔNG để 1 nguồn dữ liệu phụ chặn đứng cả
// tính năng KHÔNG liên quan tới nó (xem VERSION.md bản sửa lỗi đó).
const { getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, mapping: Map<maDiem, {maStkCu:[], maStkMoi:[], tenSieuThi}> }

function parseStkList(raw) {
  if (raw === null || raw === undefined) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

async function loadDiemStkMapping() {
  if (cache && cache.expiresAt > Date.now()) return cache.mapping;

  try {
    const pool = await getPool('ETL_DIEM_STK');
    const result = await pool.request().query('SELECT MaDiem, MaStkCu, MaStkMoi, TenSieuThi, BuId, LoaiChuoi FROM etl.DiemStkMapping');
    const mapping = new Map();
    for (const r of result.recordset) {
      mapping.set(r.MaDiem, {
        maStkCu: parseStkList(r.MaStkCu),
        maStkMoi: parseStkList(r.MaStkMoi),
        tenSieuThi: r.TenSieuThi || null,
        buId: r.BuId || null,
        loaiChuoi: r.LoaiChuoi || null
      });
    }
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, mapping };
    return mapping;
  } catch (err) {
    console.warn(`⚠️  [diemStkMapping] Không đọc được etl.DiemStkMapping (kiểm tra ETL_DIEM_STK_* trong .env) — báo cáo bật useDiemStkMapping sẽ tạm KHÔNG có dữ liệu cho tới khi kết nối lại được: ${err.message}`);
    return new Map();
  }
}

// Gộp NHIỀU dòng (đã theo STK_ID, 1 dòng/entityCode — xem
// aggregateDailyRowsByEntity trong compositeReportRunner.js) về ĐÚNG 1 dòng
// mỗi mã Điểm — CỘNG DỒN measures của các kho khớp danh sách STK_ID tương
// ứng kỳ (useCu=true -> MaStkCu, false -> MaStkMoi), dimensions lấy giá trị
// không rỗng đầu tiên (diện tích KHÔNG cộng dồn — 1 siêu thị vẫn 1 diện
// tích dù gộp nhiều kho ẢO, xem etl-db/schema.sql). Mã Điểm không khai kho
// nào cho đúng kỳ này (rỗng), hoặc khai nhưng kho đó không có dòng dữ liệu
// -> KHÔNG xuất hiện trong kết quả (rơi về "không có dữ liệu", không phải
// số 0 — đúng yêu cầu người dùng).
//
// useCu=true (kỳ "cùng kỳ năm trước") CHỈ hợp lệ khi MaStkCu và MaStkMoi là
// CÙNG 1 TẬP HỢP mã kho (siêu thị CHƯA từng đổi kho) — nếu mã Điểm đã đổi
// kho (MaStkCu khác MaStkMoi), LOẠI HẲN mã Điểm đó khỏi kết quả CHO KỲ NÀY,
// DÙ dwh.ReportFacts vẫn có dữ liệu doanh thu thật dưới mã kho CŨ (không
// suy luận từ việc "tìm không thấy dòng khớp" như trước) — vì kho CŨ và kho
// MỚI là 2 điểm bán KHÁC NHAU về bản chất (đóng cửa/mở lại dưới kho mới),
// không được dùng doanh thu kho cũ để so sánh "cùng kỳ" với kho mới, xem
// VERSION.md bản 6.86 và compositeReportRunner.js:block.requireStkStability
// (cùng quy tắc áp cho domain giaodich_chinhanh, cơ chế khác vì không remap
// được qua STK).
function remapRowsToDiem(rows, diemMapping, useCu) {
  const byStk = new Map(rows.map(r => [r.entityCode, r]));
  const out = [];
  for (const [maDiem, info] of diemMapping) {
    if (useCu && !stkListsMatch(info.maStkCu, info.maStkMoi)) continue;
    const stkList = useCu ? info.maStkCu : info.maStkMoi;
    if (!stkList.length) continue;
    const matchedRows = stkList.map(stk => byStk.get(stk)).filter(Boolean);
    if (!matchedRows.length) continue;

    const measures = {};
    const measureKeys = new Set();
    for (const r of matchedRows) for (const k of Object.keys(r.measures || {})) measureKeys.add(k);
    for (const k of measureKeys) {
      measures[k] = matchedRows.reduce((sum, r) => sum + (typeof r.measures[k] === 'number' ? r.measures[k] : 0), 0);
    }

    const dimensions = {};
    const dimensionKeys = new Set();
    for (const r of matchedRows) for (const k of Object.keys(r.dimensions || {})) dimensionKeys.add(k);
    for (const k of dimensionKeys) {
      const found = matchedRows.map(r => r.dimensions[k]).find(v => v !== null && v !== undefined);
      if (found !== undefined) dimensions[k] = found;
    }
    // TenSieuThi của bảng ánh xạ Điểm-STK ưu tiên hơn (nếu có) — đại diện
    // đúng cấp "mã Điểm" hiện đang dùng trên báo cáo, thay vì tên gắn theo
    // từng kho STK_ID lẻ (etl.BranchCodeMap, phục vụ mục đích KHÁC).
    if (info.tenSieuThi) dimensions.tenSieuThi = info.tenSieuThi;
    // LoaiChuoi do admin khai tường minh LUÔN ƯU TIÊN GHI ĐÈ "chain" tự động
    // lấy từ STOCK.TYPE (đồng bộ qua domain doanhthu_chinhanh) — đáng tin
    // hơn tự động vì không phụ thuộc job etl-admin có tick đúng Dimension
    // "chain" hay không, và tránh vài ngoại lệ dữ liệu DSMART đã ghi nhận
    // (TYPE='02' có dòng là "Kho hàng..." không phải MiniMart bán lẻ thật —
    // xem etl-db/schema.sql). Để trống (null) -> giữ nguyên giá trị tự động
    // như trước, KHÔNG đổi hành vi cũ.
    if (info.loaiChuoi) dimensions.chain = info.loaiChuoi;

    out.push({
      entityCode: maDiem,
      sourceSystem: matchedRows[0].sourceSystem,
      eventDate: matchedRows[0].eventDate,
      dimensions,
      measures
    });
  }
  return out;
}

// So sánh 2 danh sách mã kho (đã parseStkList) có PHẢI CÙNG 1 TẬP HỢP hay
// không (không quan tâm thứ tự) — dùng để phát hiện mã Điểm nào ĐÃ đổi kho
// (MaStkCu khác MaStkMoi) giữa 2 kỳ so sánh, xem
// compositeReportRunner.js:block.requireStkStability.
function stkListsMatch(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(v => setB.has(v));
}

// Dựng Map<BU_ID thật, mã Điểm> — CHỈ dùng giá trị admin khai TƯỜNG MINH
// trong etl.DiemStkMapping.BuId — KHÔNG (còn) tự suy "mã Điểm + 00" như
// trước (bản 6.98/6.99). Người dùng chỉ rõ: hậu tố "00" quan sát được qua
// SQL chỉ đúng cho các mẫu ĐÃ kiểm tra, KHÔNG phải quy tắc DSMART công bố
// áp dụng chung cho MỌI mã Điểm — tự suy cho mã CHƯA kiểm tra có rủi ro
// SAI ÂM THẦM (gộp sai doanh thu/giao dịch vào nhầm mã Điểm mà không ai
// biết để kiểm tra lại), còn nguy hiểm hơn hiện trống — xem "quy tắc mã
// BU_ID và STK_ID.md". Mã Điểm nào CHƯA khai BuId tường minh thì domain
// giaodich_chinhanh của mã đó KHÔNG xuất hiện trong lookup — rơi về "không
// có dữ liệu" (đúng hành vi mặc định của compositeReportRunner khi
// entityCode không khớp khối nào), CHỜ admin xác nhận qua SQL thật rồi
// điền vào bảng "Ánh xạ Điểm - STK_ID".
//
// CHỈ 1 GIÁ TRỊ DUY NHẤT DÙNG CHUNG CHO CẢ 2 KỲ — BU_ID là mã Điểm, KHÔNG
// THAY ĐỔI theo thời gian (xác nhận với người dùng, xem "quy tắc mã BU_ID
// và STK_ID.md"), KHÁC HẲN MaStkCu/MaStkMoi (kho CÓ thể đổi). Dùng để dịch
// entityCode thô (BU_ID) của domain giaodich_chinhanh về đúng mã Điểm
// TRƯỚC khi ghép với khối Doanh thu/Chỉ tiêu — xem
// lib/compositeReportRunner.js:block.mapBuIdToMaDiem. Mã Điểm nào khai 2
// BU_ID trùng nhau (hiếm, lỗi khai tay) thì entityCode SAU (theo thứ tự
// Map.entries()) ghi đè — không có cách nào phân biệt đúng/sai ở tầng này,
// admin cần tự sửa lại bảng Ánh xạ Điểm - STK_ID nếu gặp cảnh báo dữ liệu
// sai ở báo cáo.
function buildBuIdLookup(diemMapping) {
  const lookup = new Map();
  for (const [maDiem, info] of diemMapping) {
    if (!info.buId) continue;
    lookup.set(info.buId, maDiem);
  }
  return lookup;
}

// storeScope (bản 8.51, app.UserStoreAccess — mảng MaDiem, hoặc null =
// "Toàn bộ") -> tập hợp STK_ID (kho) THẬT tương ứng, dùng để lọc trực tiếp
// theo MaChiNhanh/STK_ID ở các báo cáo KHÔNG qua compositeReportRunner.js
// (báo cáo đó đã tự xử lý __storeScope riêng — xem block.useDiemStkMapping).
// null -> trả về null (không lọc gì, đúng ý nghĩa "không giới hạn", PHÂN
// BIỆT RÕ với Set rỗng — Set rỗng nghĩa là CÓ giới hạn nhưng giới hạn đó
// chưa khớp kho thật nào, phải lọc về rỗng, không phải "xem hết").
async function resolveStoreScopeStkIds(storeScope) {
  if (!storeScope) return null;
  const diemMapping = await loadDiemStkMapping();
  const stkIds = new Set();
  for (const maDiem of storeScope) {
    const info = diemMapping.get(maDiem);
    if (!info) continue;
    for (const stk of info.maStkMoi) stkIds.add(stk);
  }
  return stkIds;
}

module.exports = { loadDiemStkMapping, remapRowsToDiem, stkListsMatch, buildBuIdLookup, resolveStoreScopeStkIds };
