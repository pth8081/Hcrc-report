// lib/compositeReportRunner.js — SourceType='composite': ghép NHIỀU "khối
// nguồn" (blocks) thành 1 dòng/thực thể theo entityCode, RỒI mới chạy công
// thức (lib/formulaEngine.js) trên dòng đã ghép. Dùng khi 1 báo cáo cần
// trộn dữ liệu "hôm nay" (directDb hoặc apiRealtime, có thể realtime từng
// điểm bán qua API Server) với "cùng kỳ năm trước" + "chỉ tiêu" (LUÔN
// directDb, đọc dwh.ReportFacts/dwh.SalesTargets) — vd báo cáo nhanh doanh
// thu chi nhánh, xem VERSION.md.
//
// Mỗi khối tự chạy qua ĐÚNG đường đã có sẵn (directDb qua
// lib/reportEngine.js:runReport, apiReport/apiRealtime qua
// lib/apiReportClient.js, target qua lib/salesTargetsReader.js) — file này
// CHỈ thêm bước ghép + chạy công thức, không viết lại logic fetch của từng
// loại nguồn.
//
// DefinitionJson.blocks: [{
//   key,                    // BẮT BUỘC, duy nhất — tên trường lồng trong dòng đã ghép
//   sourceType,             // 'directDb' | 'apiReport' | 'apiRealtime' (bỏ qua nếu isTarget)
//   domain, dataSourceId,   // directDb: domain BẮT BUỘC, dataSourceId tuỳ chọn (mặc định DWH)
//   dateOffsetYears,        // directDb: 0 = ngày yêu cầu (mặc định), -1 = cùng kỳ năm trước
//   filters,                // directDb: definition.filters bổ sung, giống 'directDb' thường
//   useDiemStkMapping,      // directDb: TUỲ CHỌN, mặc định false — BẬT khi
//                           // mã EntityCode thật trong domain này là mã kho
//                           // STK_ID (dwh.ReportFacts) nhưng báo cáo cần
//                           // hiện/ghép theo mã "Điểm" (BU_ID, dùng nguyên
//                           // trong file chỉ tiêu — xem
//                           // etl/lib/salesTargetsImport.js): tra
//                           // etl.DiemStkMapping (CSDL etl, đọc qua
//                           // lib/diemStkMapping.js), CỘNG DỒN measures của
//                           // MỌI kho STK_ID khớp đúng 1 mã Điểm thành 1
//                           // dòng — dùng MaStkMoi (kho HIỆN TẠI) khi
//                           // dateOffsetYears>=0, MaStkCu (kho CŨ, cùng kỳ
//                           // năm trước) khi dateOffsetYears<0 — vì mã kho
//                           // có thể đổi theo thời gian dù mã Điểm không
//                           // đổi. Mã Điểm không khai kho nào cho đúng kỳ
//                           // (hoặc kho đó không có dữ liệu) -> "không có
//                           // dữ liệu" (không phải 0) — theo đúng yêu cầu
//                           // người dùng, xem lib/diemStkMapping.js.
//   apiConnectionId, apiTarget, // apiReport/apiRealtime
//   isTarget, targetDomain, // true -> đọc dwh.SalesTargets (lib/salesTargetsReader.js)
//   targetGranularity,      // isTarget: 'day' tra ĐÚNG ngày yêu cầu (chỉ
//                           // tiêu THEO NGÀY, mẫu file thật LDTD/HCRC — xem
//                           // etl/lib/salesTargetsImport.js), mặc định/bỏ
//                           // trống = tra theo ngày 1 đầu tháng (chỉ tiêu
//                           // THEO THÁNG, hành vi cũ)
//   skipWhen                // TUỲ CHỌN {field, equals} — BỎ QUA HẲN khối này
//                           // (không gọi truy vấn, coi như không có dòng
//                           // nào) khi filterValues[field] === equals (so
//                           // sánh CHUỖI, an toàn với select trả string) —
//                           // dùng cho "chế độ xem" tuỳ chọn ẩn bớt khối so
//                           // sánh, xem seedLdtdHcrcReports.js.
//   mapBuIdToMaDiem,        // directDb: TUỲ CHỌN — dịch entityCode thô
//                           // (BU_ID thật, bảng TRANSHDR) về đúng mã Điểm
//                           // SAU KHI gộp theo ngày (TRƯỚC useDiemStkMapping/
//                           // requireStkStability bên dưới), tra qua
//                           // lib/diemStkMapping.js:buildBuIdLookup() (đọc
//                           // etl.DiemStkMapping.BuId — CHỈ 1 CỘT DUY NHẤT,
//                           // KHÔNG tách cũ/mới như MaStkCu/MaStkMoi, vì BU_ID
//                           // là mã Điểm KHÔNG THAY ĐỔI theo thời gian, xem
//                           // "quy tắc mã BU_ID và STK_ID.md"). KHÔNG có khai
//                           // tường minh thì mã Điểm đó KHÔNG khớp gì cả
//                           // (KHÔNG tự suy "+00" nữa — người dùng chỉ rõ đó
//                           // chỉ là quan sát từ mẫu ĐÃ kiểm tra qua SQL,
//                           // không phải quy tắc DSMART áp dụng chung, tự suy
//                           // có rủi ro sai âm thầm). Dùng cho domain
//                           // giaodich_chinhanh: TRƯỚC ĐÂY tài liệu giả định
//                           // "BU_ID giữ nguyên = mã Điểm" — SAI, đã xác nhận
//                           // lại bằng dữ liệu thật (SELECT DISTINCT
//                           // BU_ID/STK_ID qua STRANS JOIN TRANSHDR): BU_ID
//                           // thật KHÔNG khớp mã Điểm, nên cột Giao dịch
//                           // LUÔN TRỐNG cho tới khi admin xác nhận đúng
//                           // BU_ID qua SQL thật rồi điền vào bảng ánh xạ.
//                           // entityCode KHÔNG khớp BU_ID nào trong bảng ánh
//                           // xạ (mã Điểm chưa khai) bị LOẠI HẲN khỏi khối
//                           // này (rơi về "không có dữ liệu", cùng triết lý
//                           // useDiemStkMapping) — xem VERSION.md.
//   requireStkStability,    // directDb: TUỲ CHỌN, mặc định false — dùng cho
//                           // domain KHÔNG bật useDiemStkMapping (entityCode
//                           // đã đúng = mã Điểm SAU khi áp mapBuIdToMaDiem
//                           // (nếu có) ở trên, vd giaodich_chinhanh)
//                           // nhưng vẫn cần áp đúng nghiệp vụ: mã Điểm nào có
//                           // "Ánh xạ Điểm - STK_ID" khai MaStkCu KHÁC
//                           // MaStkMoi (đã đổi kho — đóng cửa/mở lại) thì bị
//                           // LOẠI KHỎI khối này (coi như "không có dữ liệu"),
//                           // DÙ nguồn thô (TRANSHDR) vẫn có số liên tục theo
//                           // BU_ID — vì nghiệp vụ coi kho CŨ (kỳ so sánh) và
//                           // kho MỚI (kỳ hiện tại) là 2 điểm bán KHÁC NHAU,
//                           // không được so sánh chung (người dùng xác nhận
//                           // rõ: "nếu mã STK cũ và mới khác nhau thì siêu thị
//                           // không có doanh thu/giao dịch cùng kỳ"). Mã Điểm
//                           // KHÔNG có dòng khai Ánh xạ Điểm-STK cũng bị loại
//                           // (không đủ thông tin để khẳng định ổn định) —
//                           // dùng cho khối "cùng kỳ năm trước" của domain
//                           // giaodich_chinhanh, xem lib/diemStkMapping.js:stkListsMatch.
// }]
// definition.columns[].hideWhen — TUỲ CHỌN {field, equals}, CÙNG cơ chế như
// block.skipWhen ở trên — ẨN HẲN cột đó khỏi describeColumns()/dòng kết quả
// (không chỉ để trống) khi điều kiện khớp — thường đi kèm skipWhen của
// đúng khối mà cột đó tham chiếu tới (ẩn cột thì cũng nên bỏ qua khối cho
// đỡ tốn 1 lượt truy vấn không ai xem).
//
// Công thức trong definition.columns tham chiếu field dạng "tenKhoi.field..."
// (vd "current.measures.doanhThu", "target.ChiTieuDoanhThu",
// "lastYear.measures.doanhThu") — xem resolveCompositeField() bên dưới.
//
// TrangThai='DaDong' trong khối isTarget (nhập qua etl-admin, xem
// etl/lib/salesTargetsImport.js) LOẠI HẲN thực thể đó khỏi kết quả — CHỈ
// khi có đánh dấu TƯỜNG MINH, không suy luận từ việc THIẾU dòng chỉ tiêu
// (siêu thị chưa kịp nhập chỉ tiêu tháng đó vẫn hiện ra bình thường, chỉ
// trống field target — xem đoạn lọc mergedRows trong runCompositeReport()).
//
// DefinitionJson.requireTargetMatch (TUỲ CHỌN, mặc định false/không đổi
// hành vi cũ ở trên) — BẬT thì lật ngược logic: CHỈ giữ thực thể có mặt
// trong khối target (mọi entityCode KHÁC — có thực đạt nhưng KHÔNG có chỉ
// tiêu — bị loại khỏi kết quả). Dùng cho báo cáo coi danh sách chỉ tiêu là
// "danh sách chuẩn" của các siêu thị/cửa hàng thật (chặn mã rác/mã test lọt
// vào từ nguồn dữ liệu thô) — xem seedLdtdHcrcReports.js. Yêu cầu
// definition.blocks có ít nhất 1 khối isTarget; không có khối target nào
// thì cờ này coi như không đặt (không loại gì, tránh vô tình xoá sạch báo
// cáo nếu ai đó bật nhầm cờ mà quên khai khối target).
//
// DefinitionJson.requireDiemStkMapping (TUỲ CHỌN, mặc định false) — BẬT thì
// loại HẲN mọi mã Điểm KHÔNG có dòng khai trong etl.DiemStkMapping ("Ánh xạ
// Điểm - STK_ID"), DÙ mã đó vẫn có dữ liệu ở khối target/giaodich_chinhanh
// (2 khối này không cần tra bảng ánh xạ nên vẫn "có dữ liệu" dù mã Điểm
// chưa khai ánh xạ) — dùng để tránh hiện dòng nửa vời (có Chỉ tiêu/Giao
// dịch nhưng Doanh thu luôn trống) cho tới khi admin khai đủ ánh xạ, xem
// seedLdtdHcrcReports.js.
//
// DefinitionJson.groupBy (TUỲ CHỌN) — dòng "Tổng cộng" theo nhóm + tổng
// toàn báo cáo (vd "Tổng cộng MART"/"Tổng cộng MINIMART"/"Tổng cộng"):
//   field         — path "tenKhoi.field" dùng để nhóm (vd "current.dimensions.chain")
//   groups        — [{ value, label }] — THỨ TỰ xuất hiện của các dòng tổng,
//                   value khớp đúng giá trị field ở trên
//                   (vd { value:'MART', label:'Tổng cộng MART' })
//   grandTotalLabel — nhãn dòng tổng toàn báo cáo (mặc định "Tổng cộng")
//   labelColumn   — key cột (trong definition.columns) sẽ được GÁN nhãn ở
//                   dòng tổng, cột số khác được TÍNH LẠI bằng cách cộng dồn
//                   dữ liệu THÔ (measures/targets) của mọi dòng trong nhóm
//                   RỒI chạy lại đúng công thức đó — vd "Tỷ lệ đạt" ở dòng
//                   tổng = SUM(thực đạt)/SUM(chỉ tiêu), KHÔNG PHẢI trung
//                   bình cộng % từng dòng (xem sumMergedRows()).
//   sortBy        — TUỲ CHỌN {field, direction} — sắp xếp CÁC DÒNG DỮ LIỆU
//                   BÊN TRONG từng nhóm (field cùng dạng path "tenKhoi.field"
//                   như "field" ở trên, vd "current.dimensions.dienTich") —
//                   direction "desc" (mặc định, diện tích lớn -> nhỏ, khớp
//                   file mẫu báo cáo cũ) hoặc "asc". KHÔNG sắp xếp dòng
//                   "Tổng cộng" (luôn đứng cuối mỗi nhóm, xem bên dưới) —
//                   CHỈ áp dụng khi CÓ groupBy, không dùng cho báo cáo
//                   không nhóm (definition.groupBy để trống).
//
// DefinitionJson.topN (TUỲ CHỌN, KHÔNG dùng cùng lúc với groupBy — có topN
// thì bỏ qua hẳn groupBy nếu lỡ khai cả 2) — "Top N" 1 chỉ số, dùng cho
// Dashboard "Top 5 chi nhánh" (xem scripts/seedTop5ChiNhanhReports.js):
//   field      — path "tenKhoi.field" lấy giá trị để XẾP HẠNG (vd
//                "current.measures.doanhThu").
//   direction  — "desc" (mặc định, cao nhất trước) hoặc "asc" (thấp nhất
//                trước).
//   limit      — số dòng giữ lại SAU KHI xếp hạng (mặc định 5).
//   filterField, filterValue — TUỲ CHỌN, LỌC thực thể trước khi xếp hạng (vd
//                filterField="current.dimensions.chain", filterValue="MART"
//                — chỉ xếp hạng trong đúng 1 chuỗi MART/MINIMART). Không
//                khai filterField -> xếp hạng trên TOÀN BỘ thực thể đã ghép.
// KHÔNG có dòng "Tổng cộng" (khác groupBy) — topN luôn trả đúng ĐÚNG `limit`
// dòng (hoặc ít hơn nếu không đủ thực thể), đã tự đánh số "stt" 1..N theo
// ĐÚNG thứ tự xếp hạng (khác cột "stt" thường — xem chú thích cột "stt" bên
// dưới — chỉ đánh số lúc XUẤT; topN đánh số ngay ở bước chạy báo cáo vì bản
// chất là 1 danh sách ĐÃ xếp hạng, không phải danh sách cố định các chi
// nhánh như báo cáo thường).
//
// Tiêu đề nhóm cột + màu (Excel/PDF) — DefinitionJson.columnGroups (TUỲ
// CHỌN, mặc định KHÔNG có = xuất Excel/PDF phẳng như trước, không đổi hành
// vi báo cáo cũ). Chỉ ẢNH HƯỞNG lúc XUẤT (lib/exportExcel.js/
// lib/exportPdf.js — dùng chung, kể cả file đính kèm gửi email tự động,
// xem jobs/reportEmailScheduler.js), KHÔNG ảnh hưởng bảng xem trên web
// (rp-user tự vẽ bảng phẳng như cũ, không đọc field này):
//   columnGroups: [{ label, color, keys }]
//     label — nhãn nhóm (vd "Doanh thu"), gộp 1 ô ngang phía trên nhóm cột.
//     color — 1 trong "green"/"yellow"/"orange"/"blue"/"red"/"gray"/"purple"
//             (xem lib/reportCellFormat.js), hoặc mã HEX 6 ký tự tự chọn.
//     keys  — mảng key cột (trong definition.columns) thuộc nhóm này, PHẢI
//             liền kề nhau đúng thứ tự khai ở columns (không xen cột khác
//             nhóm ở giữa) — xem seedLdtdHcrcReports.js làm ví dụ thật.
//   Cột KHÔNG thuộc nhóm nào (vd "Siêu thị/Cửa hàng", "Diện tích") tự vẽ 1
//   ô tiêu đề riêng, gộp dọc 2 dòng header, không tô màu.
// definition.columns[].format — TUỲ CHỌN "percent": công thức đã tự nhân
//   100 sẵn (vd "ROUND(x/y*100,1)"), lúc xuất CHỈ thêm dấu "%" khi hiển thị
//   (Excel: numFmt tự chế `0"%"`, không dùng numFmt phần trăm chuẩn — tránh
//   nhân lại 100 lần nữa). Không khai = số thường, phân cách nghìn.
// definition.columns[].width — TUỲ CHỌN, trọng số bề rộng cột lúc xuất PDF
//   (mặc định 1 — cột nào cần rộng hơn, vd tên siêu thị, đặt số lớn hơn).
// Cột đặc biệt key="stt" (label tuỳ ý, thường "TT") — lúc xuất TỰ đánh số
//   lại từ 1 theo TỪNG NHÓM groupBy (reset ngay sau mỗi dòng "Tổng cộng"),
//   để TRỐNG ở chính dòng "Tổng cộng" — khớp đúng cột "TT" đếm riêng theo
//   từng nhóm MART/MINIMART trong mẫu báo cáo cũ (xem
//   lib/reportCellFormat.js:computeSttValues()). Giá trị thật trong dữ liệu
//   (nếu formula nào đó lỡ gán cho key "stt") bị GHI ĐÈ lúc xuất.
//
// Bộ lọc filterValues.eventDate là NGÀY (chuỗi "YYYY-MM-DD", tương thích
// ngược với báo cáo cũ khai filter type="date") HOẶC KHOẢNG NGÀY ({from,to},
// khai filter type="dateRange" — xem seedLdtdHcrcReports.js) — mặc định
// ngày hiện tại của máy chủ nếu không truyền gì. resolveRequestedRange()
// CHUẨN HOÁ cả 2 dạng về CÙNG 1 hình dạng {from, to} (1 ngày = khoảng có
// from===to), để MỌI khối bên dưới chỉ cần viết 1 đường xử lý (khoảng),
// không phải 2 đường riêng cho "1 ngày" và "nhiều ngày" — khi from===to,
// mọi phép cộng dồn dưới đây tự nhiên cho ra ĐÚNG kết quả y hệt hành vi cũ
// (tổng của 1 phần tử = chính nó).
//
// Khối directDb: CỘNG DỒN (SUM) measures của mọi ngày trong khoảng theo
// TỪNG entityCode (xem aggregateDailyRowsByEntity) — dimensions (vd
// dienTich, chain) KHÔNG cộng dồn, lấy giá trị không rỗng đầu tiên (thuộc
// tính tĩnh của chi nhánh, không đổi theo ngày). Khối dateOffsetYears dịch
// CẢ 2 đầu mút của khoảng theo đúng số năm (dương lịch, khớp câu trả lời đã
// chốt — "28/08 <-> 28/08"), cho ra khoảng "cùng kỳ năm trước" tương ứng.
//
// Khối isTarget: CỘNG DỒN chỉ tiêu TỪNG NGÀY (targetGranularity='day') hoặc
// TỪNG THÁNG (mặc định) trong khoảng, xem lib/salesTargetsReader.js —
// quyết định nghiệp vụ đã chốt với người dùng (không quy đổi/chia tỷ lệ
// theo số ngày thực chọn trong tháng).
//
// GIỚI HẠN ĐÃ BIẾT: khối apiReport/apiRealtime (gọi API Server ngoài) CHƯA
// hỗ trợ khoảng ngày — API bên ngoài chỉ nhận 1 ngày. Nếu người dùng chọn
// khoảng nhiều ngày, khối này chỉ nhận ngày CUỐI khoảng (best-effort, không
// cộng dồn) — KHÔNG dùng loại khối này trong 1 báo cáo composite đã khai
// filter "dateRange" trừ khi chấp nhận giới hạn này.
//
// KHÔNG áp dụng page/pageSize — báo cáo composite trả về TOÀN BỘ dòng đã
// ghép (thường là danh sách cố định các điểm bán, không phân trang được
// một khi cần tính dòng "Tổng cộng" ở tầng gọi — xem
// routes/reports.js/lib/reportRunner.js mục xử lý groupBy).
//
// CÁC BLOCK CHẠY SONG SONG (Promise.all), không tuần tự — độ trễ báo cáo
// bằng đúng khối CHẬM NHẤT, không phải TỔNG mọi khối. Quan trọng khi báo
// cáo có nhiều khối apiReport/apiRealtime (mỗi khối = 1 lượt gọi HTTP tới
// API Server, có thể tới nhiều endpoint/kết nối khác nhau — xem
// resolveCompositeField()). Kết quả GHÉP vẫn duyệt theo ĐÚNG thứ tự
// definition.blocks (không phải thứ tự khối nào chạy xong trước) — thứ tự
// dòng trả về không đổi dù chạy song song, chỉ nhanh hơn.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const { runReport, describeColumns } = require('./reportEngine');
const { runApiReport } = require('./apiReportClient');
const { evaluateFormula, extractFieldPaths } = require('./formulaEngine');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, remapRowsToDiem, stkListsMatch, buildBuIdLookup } = require('./diemStkMapping');

function formatDateISO(d) {
  return d.toISOString().slice(0, 10);
}

// LỖI THẬT đã gặp (bản 8.26): "hôm nay" mặc định (không truyền
// filters.eventDate) từng tính bằng `formatDateISO(new Date())` —
// toISOString() LUÔN quy đổi về giờ UTC, không phải giờ Việt Nam của người
// dùng/máy chủ. Máy chủ chạy UTC (đi SAU giờ Việt Nam 7 tiếng) nên suốt
// khoảng 00:00-06:59 giờ Việt Nam mỗi ngày, UTC vẫn còn Ở NGÀY HÔM TRƯỚC —
// báo cáo không truyền ngày (gọi thẳng API, hoặc trang vừa tải chưa kịp chọn
// ngày) sẽ âm thầm hiện ĐÚNG NGÀY HÔM QUA trong khoảng giờ đó. Cố định
// 'Asia/Ho_Chi_Minh' (đúng múi giờ nghiệp vụ, không phụ thuộc múi giờ hệ
// điều hành máy chủ) — cùng lỗi/cách sửa như rp-user/src/lib/dateRange.js:todayISO().
function vietnamTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// 29/2 dịch tới 1 năm KHÔNG NHUẬN không tồn tại — Date.setUTCFullYear() của
// JS tự "chồm" qua ngày kế tiếp có thật (29/2/2024 dịch -1 năm ra 1/3/2023,
// KHÔNG BÁO LỖI GÌ) — âm thầm lệch nguyên 1 ngày cho MỌI báo cáo "cùng kỳ
// năm trước" chạy đúng ngày 29/2 (4 năm mới gặp 1 lần, dễ lọt qua test tay
// thông thường). Chốt cứng về 28/2 của năm đích khi năm đó không nhuận —
// đúng quy ước lịch phổ biến cho "cùng ngày năm trước" khi 29/2 không tồn
// tại ở năm đối chiếu.
function shiftYears(dateStr, years) {
  if (!years) return dateStr;
  const d = new Date(`${dateStr}T00:00:00Z`);
  const targetYear = d.getUTCFullYear() + years;
  if (d.getUTCMonth() === 1 && d.getUTCDate() === 29 && !isLeapYear(targetYear)) {
    return formatDateISO(new Date(Date.UTC(targetYear, 1, 28)));
  }
  d.setUTCFullYear(targetYear);
  return formatDateISO(d);
}

function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

// So khớp block.skipWhen/column.hideWhen — CHUYỂN VỀ CHUỖI trước khi so
// sánh (`filterValues[field]` đến từ query string/JSON body, thường là
// chuỗi từ SearchableSelect ở frontend, nhưng không ép kiểu cứng để tránh
// vỡ nếu ai đó gọi thẳng API với kiểu boolean/số thật).
function matchesCondition(cond, filterValues) {
  if (!cond) return false;
  return String(filterValues[cond.field]) === String(cond.equals);
}

// Chuẩn hoá filterValues.eventDate về {from, to} — chấp nhận CẢ 2 dạng: chuỗi
// "YYYY-MM-DD" (1 ngày, báo cáo cũ khai filter type="date") và {from, to}
// (khoảng ngày, filter type="dateRange"). Không truyền gì -> ngày hiện tại
// của máy chủ (hành vi cũ, 1 ngày). from > to (người dùng lỡ chọn ngược) ->
// tự hoán đổi lại cho đúng, không báo lỗi.
function resolveRequestedRange(filterValues) {
  const raw = filterValues.eventDate;
  const today = vietnamTodayISO();
  if (raw && typeof raw === 'object') {
    const from = raw.from || raw.to || today;
    const to = raw.to || raw.from || today;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  const day = raw || today;
  return { from: day, to: day };
}

function eventDateKey(eventDate) {
  if (eventDate instanceof Date) return eventDate.toISOString().slice(0, 10);
  return String(eventDate).slice(0, 10);
}

// Gộp NHIỀU DÒNG THEO NGÀY (kết quả thô của runReport trên 1 khoảng ngày,
// có thể nhiều dòng/entityCode — 1 dòng/ngày) thành ĐÚNG 1 dòng/entityCode —
// bắt buộc, vì bước ghép ở runCompositeReport() coi 1 khối trả >1 dòng cho
// cùng entityCode là LỖI CẤU HÌNH (loại hẳn thực thể đó). CỘNG DỒN mọi
// measures (số liệu phát sinh THEO NGÀY — doanh thu, số giao dịch...),
// KHÔNG cộng dồn dimensions (thuộc tính TĨNH của chi nhánh — diện tích,
// nhóm chuỗi — cộng theo ngày sẽ ra số vô nghĩa, vd diện tích x N ngày) mà
// lấy giá trị không rỗng đầu tiên gặp được.
//
// KHỬ TRÙNG theo (entityCode, ngày) TRƯỚC KHI cộng dồn — 1 domain có thể
// được đồng bộ bởi NHIỀU job khác nhau (khác SourceSystem, vd "Doanh thu
// chi nhánh - Live (DSMART16)" và "- Lịch sử (DSMART16_EOM)" trong
// seedLdtdHcrcSync.js) mà khoảng ngày nguồn CHỒNG LẤN NHAU — CSDL Lịch sử
// (DSMART16_EOM) có "vùng đệm ~1-2 tháng gần nhất" (STRANS_EOM, xem "báo
// cáo doanh thu cuối ngày.md" Bước 1) NÊN vẫn đồng bộ được cả những ngày
// GẦN ĐÂY mà job Live cũng đã đồng bộ — dwh.ReportFacts cho phép 2 dòng
// cùng entityCode+ngày MIỄN LÀ khác SourceSystem (khoá UNIQUE gồm cả
// SourceSystem, xem dwh/schema.sql), nên runReport() trả về CẢ 2 dòng cho
// cùng 1 ngày thật. TRƯỚC ĐÂY hàm này coi MỌI dòng trả về là "1 ngày riêng"
// rồi cộng dồn thẳng — 1 ngày bị 2 job chồng lấn đồng bộ thì bị TÍNH GẤP
// ĐÔI (2 nguồn cùng phản ánh 1 ngày thật, số liệu lệch nhau < 0.5% theo tài
// liệu VIEW nguồn, KHÔNG PHẢI 2 ngày khác nhau) — đây là nguyên nhân khiến
// "Thực đạt" của báo cáo nhanh doanh thu LDTD/HCRC ra số lớn bất thường so
// với Chỉ tiêu, xem VERSION.md. Giờ chỉ giữ ĐÚNG 1 dòng/entityCode/ngày —
// ưu tiên bản ghi có SyncedAt MỚI NHẤT (nguồn nào cũng cho số liệu gần như
// nhau, chọn nguồn nào không quan trọng bằng việc KHÔNG cộng trùng).
function aggregateDailyRowsByEntity(rows, representativeEventDate) {
  const byEntityDate = new Map();
  for (const row of rows) {
    if (!row.entityCode) continue;
    const key = `${row.entityCode}|${eventDateKey(row.eventDate)}`;
    const existing = byEntityDate.get(key);
    if (!existing || (row.syncedAt && (!existing.syncedAt || row.syncedAt > existing.syncedAt))) {
      byEntityDate.set(key, row);
    }
  }
  const byEntity = new Map();
  for (const row of byEntityDate.values()) {
    if (!byEntity.has(row.entityCode)) byEntity.set(row.entityCode, []);
    byEntity.get(row.entityCode).push(row);
  }
  const out = [];
  for (const [entityCode, group] of byEntity) {
    const measures = {};
    const measureKeys = new Set();
    for (const r of group) for (const k of Object.keys(r.measures || {})) measureKeys.add(k);
    for (const k of measureKeys) {
      measures[k] = group.reduce((sum, r) => sum + (typeof r.measures[k] === 'number' ? r.measures[k] : 0), 0);
    }
    const dimensions = {};
    const dimensionKeys = new Set();
    for (const r of group) for (const k of Object.keys(r.dimensions || {})) dimensionKeys.add(k);
    for (const k of dimensionKeys) {
      const found = group.map(r => r.dimensions[k]).find(v => v !== null && v !== undefined);
      if (found !== undefined) dimensions[k] = found;
    }
    out.push({
      entityCode,
      sourceSystem: group[0].sourceSystem,
      eventDate: representativeEventDate,
      dimensions,
      measures
    });
  }
  return out;
}

async function runBlock(block, requestedRange, filterValues) {
  const { from, to } = requestedRange;
  if (block.isTarget) {
    const dwhPool = await getPool('DWH');
    const fromPeriod = block.targetGranularity === 'day' ? from : firstOfMonth(from);
    const toPeriod = block.targetGranularity === 'day' ? to : firstOfMonth(to);
    return runSalesTargetsBlockRange(dwhPool, block.targetDomain, fromPeriod, toPeriod);
  }
  if (block.sourceType === 'directDb') {
    const pool = block.dataSourceId ? await getPoolForDataSource(block.dataSourceId) : await getPool('DWH');
    const years = block.dateOffsetYears || 0;
    const eventDateRange = { from: shiftYears(from, years), to: shiftYears(to, years) };
    const blockDefinition = { domain: block.domain, filters: [{ field: 'eventDate', type: 'dateRange' }, ...(block.filters || [])] };
    const blockFilterValues = { ...filterValues, eventDate: eventDateRange };
    const rawRows = await runReport(pool, blockDefinition, blockFilterValues, { page: 1, pageSize: 5000 });
    let stkRows = aggregateDailyRowsByEntity(rawRows, eventDateRange.to);

    // mapBuIdToMaDiem (TUỲ CHỌN) — domain 'giaodich_chinhanh' (TRANSHDR.BU_ID)
    // ĐÃ XÁC NHẬN bằng dữ liệu thật (SELECT DISTINCT BU_ID/STK_ID qua STRANS
    // JOIN TRANSHDR): BU_ID KHÔNG "giữ nguyên = mã Điểm" như tài liệu cũ giả
    // định. Dịch entityCode thô (BU_ID) về đúng mã Điểm qua bảng Ánh xạ Điểm
    // - STK_ID (etl.DiemStkMapping.BuId — CHỈ 1 CỘT DUY NHẤT, KHÔNG tách
    // cũ/mới như MaStkCu/MaStkMoi, vì BU_ID là mã Điểm KHÔNG THAY ĐỔI theo
    // thời gian, xem "quy tắc mã BU_ID và STK_ID.md" — KHÔNG khai tường minh
    // thì KHÔNG khớp gì cả (KHÔNG tự suy "+00" — bỏ hẳn sau khi người dùng
    // chỉ rõ đó chỉ là quan sát từ mẫu ĐÃ kiểm tra, không phải quy tắc
    // DSMART áp dụng chung, tự suy có rủi ro sai âm thầm), xem
    // lib/diemStkMapping.js:buildBuIdLookup(). entityCode KHÔNG khớp BU_ID
    // nào trong bảng ánh xạ (mã Điểm chưa khai) bị LOẠI HẲN (rơi về "không
    // có dữ liệu", KHÔNG hiện dòng nửa vời, KHÔNG đoán bừa) — admin cần xác
    // nhận đúng BU_ID qua SQL thật rồi điền vào bảng ánh xạ (xem VERSION.md).
    if (block.mapBuIdToMaDiem) {
      const diemMapping = await loadDiemStkMapping();
      const buIdLookup = buildBuIdLookup(diemMapping);
      stkRows = stkRows
        .map((row) => (buIdLookup.has(row.entityCode) ? { ...row, entityCode: buIdLookup.get(row.entityCode) } : null))
        .filter(Boolean);
    }
    if (block.useDiemStkMapping) {
      const diemMapping = await loadDiemStkMapping();
      return remapRowsToDiem(stkRows, diemMapping, years < 0);
    }
    if (block.requireStkStability) {
      const diemMapping = await loadDiemStkMapping();
      return stkRows.filter((row) => {
        const info = diemMapping.get(row.entityCode);
        return info && stkListsMatch(info.maStkCu, info.maStkMoi);
      });
    }
    return stkRows;
  }
  if (block.sourceType === 'apiReport' || block.sourceType === 'apiRealtime') {
    // dateOffsetYears CHỈ áp dụng được cho khối directDb (dịch cả khoảng
    // ngày) — khối này gọi API ngoài, không hiểu khoảng ngày (xem chú thích
    // dưới), nên KHÔNG có cách áp dụng dateOffsetYears đúng nghĩa. Chặn ở
    // đây (không chỉ ở routes/reportCatalog.js:validateCompositeDefinition,
    // vì định nghĩa báo cáo có thể được ghi thẳng qua script seed, bỏ qua
    // route đó) — thà lỗi rõ ràng lúc chạy còn hơn báo cáo lặng lẽ hiện SAI
    // dữ liệu (vẫn ngày hiện tại, không phải "năm trước" như đã khai).
    if (block.dateOffsetYears) {
      throw new Error(`Khối "${block.key}" (${block.sourceType}) khai dateOffsetYears nhưng khối này không hỗ trợ (chỉ khối directDb dịch được theo năm) — sửa cấu hình báo cáo, bỏ dateOffsetYears ở khối này.`);
    }
    // GIỚI HẠN ĐÃ BIẾT (xem chú thích đầu file): API ngoài chưa hiểu khoảng
    // ngày — chỉ truyền đúng 1 ngày CUỐI khoảng, best-effort, KHÔNG cộng dồn.
    const apiFilterValues = { ...filterValues, eventDate: to };
    const { rows } = await runApiReport(block, apiFilterValues, { page: 1, pageSize: 5000 });
    return rows;
  }
  throw new Error(`Khối nguồn "${block.key}" thiếu/sai sourceType (và không phải isTarget)`);
}

// path[0] = tên khối, phần còn lại đi sâu vào field lồng bên trong dữ liệu
// khối đó (directDb: entityCode/eventDate/sourceSystem/dimensions.x/measures.x
// — giống hệt reportEngine.js:resolveField, chỉ khác đi qua 1 cấp "tên khối"
// trước; target: field phẳng trực tiếp; api: field phẳng theo cột đã chiếu
// sẵn bên api-server).
function resolveCompositeField(mergedRow, path) {
  const [blockKey, ...rest] = path;
  let cur = mergedRow[blockKey];
  for (const p of rest) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function projectCompositeRow(mergedRow, columns) {
  const out = {};
  for (const col of columns) {
    if (col && typeof col === 'object' && col.formula) {
      out[col.key] = evaluateFormula(col.formula, (path) => resolveCompositeField(mergedRow, path));
    } else {
      const key = typeof col === 'string' ? col : col.key;
      out[key] = resolveCompositeField(mergedRow, key.split('.'));
    }
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
}

// Cộng dồn ĐỆ QUY mọi field số của cùng 1 khối qua nhiều dòng đã ghép — field
// không phải số (chuỗi/ngày, vd entityCode/eventDate) lấy giá trị KHÔNG RỖNG
// đầu tiên gặp được (không có ý nghĩa ở dòng tổng nhưng không nên bỏ trống
// đột ngột nếu công thức nào đó lỡ tham chiếu tới).
function deepSumBlock(blockValues) {
  const present = blockValues.filter(b => b !== undefined && b !== null);
  if (!present.length) return undefined;
  const keys = new Set();
  for (const b of present) for (const k of Object.keys(b)) keys.add(k);
  const result = {};
  for (const k of keys) {
    const values = present.map(b => b[k]).filter(v => v !== undefined);
    if (!values.length) continue;
    // TRƯỚC ĐÂY: values.every(v => typeof v === 'number') — 1 dòng trong
    // nhóm có measure NULL (bình thường, vd chưa kịp đồng bộ ngày đó, KHÁC
    // case TrangThai='DaDong' đã lọc riêng ở trên) làm điều kiện "every" sai
    // hoàn toàn, rơi xuống nhánh "lấy 1 giá trị" thay vì cộng dồn — dòng
    // "Tổng cộng"/"Tổng nhóm" ÂM THẦM HỤT SỐ những dòng khác null trong cùng
    // nhóm, không có cảnh báo gì. Giờ cộng dồn mọi giá trị SỐ có trong nhóm
    // (null coi như không đóng góp, không phải "toàn bộ phải là số").
    if (values.some(v => typeof v === 'number')) {
      result[k] = values.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    } else if (values.every(v => isPlainObject(v))) {
      result[k] = deepSumBlock(values);
    } else {
      result[k] = values.find(v => v !== null);
    }
  }
  return result;
}

// mergedRows đã ghép (CHƯA project qua columns) -> 1 "dòng ghép tổng hợp"
// cùng hình dạng {blockKey: {...cộng dồn}} — chạy được QUA ĐÚNG
// projectCompositeRow()/công thức như 1 dòng thường, cho ra tổng ĐÚNG bằng
// tổng dữ liệu thô (không phải tổng của các % đã tính riêng từng dòng).
function sumMergedRows(mergedRows, blockKeys) {
  const summed = {};
  for (const key of blockKeys) {
    summed[key] = deepSumBlock(mergedRows.map(r => r[key]));
  }
  return summed;
}

// resolveCompositeField() (dưới) đọc path[0] làm TÊN KHỐI — path[0] gõ sai/
// khối bị đổi tên sau khi cột đã tạo luôn resolveField về undefined, cột đó
// âm thầm ra rỗng KHÔNG có cảnh báo gì (routes/reportCatalog.js:
// validateCompositeDefinition chặn CỨNG việc này lúc LƯU, nhưng định nghĩa
// có thể được ghi thẳng qua script seed, bỏ qua route đó) — CẢNH BÁO (không
// chặn cứng, khác Fix6 dateOffsetYears vì đây là lỗi hiển thị/thiếu cột chứ
// không phải số liệu SAI) ngay khi phát hiện lúc chạy, 1 lần/field lạ/mỗi
// lượt chạy, để lộ ra log server thay vì chỉ thấy cột trống không rõ vì sao.
function warnUnknownFormulaFields(definition) {
  const validHeads = new Set([...definition.blocks.map(b => b.key), 'entityCode', 'stt']);
  for (const col of definition.columns || []) {
    const paths = [];
    if (col && typeof col === 'object' && col.formula) {
      try { paths.push(...extractFieldPaths(col.formula)); } catch { continue; }
    } else {
      const key = typeof col === 'string' ? col : col && col.key;
      if (key) paths.push(key.split('.'));
    }
    for (const path of paths) {
      if (!validHeads.has(path[0])) {
        const colLabel = typeof col === 'string' ? col : col.key;
        console.warn(`⚠️  [composite] cột "${colLabel}" tham chiếu "${path.join('.')}" — "${path[0]}" không khớp tên khối nào đã khai (${[...validHeads].join(', ')}) — cột này sẽ luôn rỗng, kiểm tra lại DefinitionJson.columns`);
      }
    }
  }
}

async function runCompositeReport(definition, filterValues = {}) {
  if (!Array.isArray(definition.blocks) || !definition.blocks.length) {
    throw new Error('Báo cáo composite thiếu "blocks"');
  }
  warnUnknownFormulaFields(definition);
  const requestedRange = resolveRequestedRange(filterValues);

  // Chạy TẤT CẢ khối song song — Promise.all giữ nguyên đúng thứ tự kết quả
  // theo definition.blocks (không phải thứ tự khối nào resolve trước), nên
  // vòng ghép bên dưới vẫn duyệt đúng thứ tự cấu hình như trước, KHÔNG đổi
  // hành vi merge — chỉ khác ở chỗ mọi khối bắt đầu chạy CÙNG LÚC thay vì
  // đợi khối trước xong mới bắt đầu khối sau. Khối khớp `skipWhen` KHÔNG gọi
  // runBlock() (bỏ qua hẳn truy vấn, không chỉ ẩn kết quả) — coi như trả về
  // mảng rỗng, giống hệt "không có dữ liệu" ở bước ghép bên dưới.
  const blockRowsList = await Promise.all(
    definition.blocks.map(block => (
      matchesCondition(block.skipWhen, filterValues) ? [] : runBlock(block, requestedRange, filterValues)
    ))
  );

  // Map giữ thứ tự chèn -> thứ tự dòng trả về ổn định, khớp thứ tự khối
  // ĐẦU TIÊN gặp mỗi entityCode (thường là khối "hôm nay").
  const merged = new Map();
  // entityCode nào có khối trả về >1 dòng (xem cảnh báo bên dưới) — LOẠI HẲN
  // khỏi kết quả (xem đoạn lọc mergedRows), KHÔNG chỉ cảnh báo âm thầm rồi
  // vẫn trả dòng có thể sai như TRƯỚC ĐÂY — tránh 2 thái cực: (a) im lặng
  // hiện số liệu SAI (rủi ro cao hơn — người xem tin tưởng số liệu, không
  // biết mà kiểm tra lại) và (b) chặn CỨNG cả báo cáo chỉ vì 1 thực thể lỗi
  // cấu hình (ảnh hưởng mọi người xem MỌI thực thể khác, kể cả khi đúng
  // 100%). Loại riêng đúng thực thể lỗi + trả "warnings" cho caller hiển thị
  // là điểm cân bằng giữa 2 rủi ro đó.
  const ambiguousEntityCodes = new Set();
  definition.blocks.forEach((block, i) => {
    for (const row of blockRowsList[i]) {
      const entityCode = row.entityCode;
      if (!entityCode) continue;
      if (!merged.has(entityCode)) merged.set(entityCode, { entityCode });
      const target = merged.get(entityCode);
      if (target[block.key] !== undefined) {
        console.warn(`⚠️  [composite] khối "${block.key}" trả về NHIỀU HƠN 1 dòng cho entityCode "${entityCode}" — LOẠI thực thể này khỏi báo cáo, kiểm tra lại cấu hình filters của khối này`);
        ambiguousEntityCodes.add(entityCode);
      }
      target[block.key] = row;
    }
  });

  // Cảnh báo entityCode chỉ lệch HOA/thường hoặc khoảng trắng — hướng_dẫn_báo_cáo.md
  // ("entityCode phải khớp CHÍNH XÁC") coi đây là trách nhiệm admin gõ đúng
  // quy ước, KHÔNG tự ý gộp/đổi ở đây (dwh.ReportFacts.EntityCode do ETL
  // đồng bộ, dwh.SalesTargets.EntityCode do admin gõ tay Excel — 2 nguồn
  // riêng biệt dễ lệch). Nhưng lệch kiểu này (vd "SM01" từ ETL và "sm01" gõ
  // tay) khiến 2 khối KHÔNG ghép được, tách thành 2 dòng riêng — dòng thực
  // đạt thiếu chỉ tiêu, dòng chỉ tiêu thiếu thực đạt — mà không có lỗi/cảnh
  // báo nào khác bắt được (khác trường hợp 1 khối trả >1 dòng ở trên). Chỉ
  // cảnh báo, không tự sửa — tránh đoán sai ý admin nếu có nguồn cố ý phân
  // biệt hoa/thường.
  if (merged.size > 1) {
    const seenNormalized = new Map(); // normalized (lowercase+trim) -> entityCode gốc đầu tiên gặp
    for (const entityCode of merged.keys()) {
      const normalized = String(entityCode).trim().toLowerCase();
      const original = seenNormalized.get(normalized);
      if (original !== undefined && original !== entityCode) {
        console.warn(`⚠️  [composite] entityCode "${original}" và "${entityCode}" chỉ khác hoa/thường hoặc khoảng trắng — có thể là 2 cách viết của CÙNG 1 thực thể bị tách thành 2 dòng riêng do không khớp chính xác (xem hướng_dẫn_báo_cáo.md), kiểm tra lại dữ liệu nguồn/file chỉ tiêu`);
      } else if (original === undefined) {
        seenNormalized.set(normalized, entityCode);
      }
    }
  }

  // Loại HẲN thực thể có TrangThai='DaDong' ở BẤT KỲ khối target nào (xem
  // etl/lib/salesTargetsImport.js) — CHỈ loại khi có đánh dấu TƯỜNG MINH.
  // Thực thể THIẾU dòng chỉ tiêu (chưa kịp nhập) vẫn phải hiện ra như bình
  // thường — không suy luận "thiếu dòng = đã đóng cửa", tránh mất siêu thị
  // khỏi báo cáo chỉ vì ai đó quên nhập 1 dòng. Cùng lượt lọc này LOẠI LUÔN
  // thực thể trong ambiguousEntityCodes (xem vòng ghép ở trên) — dữ liệu
  // không đủ tin cậy để tính đúng, không hiện ra thay vì hiện số có thể sai.
  const targetBlockKeys = definition.blocks.filter(b => b.isTarget).map(b => b.key);
  // requireTargetMatch (xem chú thích ở đầu file) — CHỈ áp dụng khi có ít
  // nhất 1 khối target thật sự khai trong definition, tránh lỡ bật cờ mà
  // quên khai khối target làm trống sạch báo cáo.
  const requireTargetMatch = !!definition.requireTargetMatch && targetBlockKeys.length > 0;
  // requireDiemStkMapping (TUỲ CHỌN, mặc định false) — BẬT thì loại HẲN mọi
  // mã Điểm KHÔNG có dòng khai trong etl.DiemStkMapping, DÙ mã đó có dữ liệu
  // ở khối target/giaodich_chinhanh (2 khối này không cần tra DiemStkMapping
  // — target đọc thẳng theo mã Điểm, giaodich giữ nguyên BU_ID = mã Điểm,
  // xem VERSION.md bản bỏ "Ánh xạ mã chi nhánh") — nếu không có cờ này, 1 mã
  // Điểm có trong file chỉ tiêu nhưng CHƯA khai "Ánh xạ Điểm - STK_ID" vẫn
  // lọt vào báo cáo với cột Doanh thu trống (đúng, vì thực đạt STK_ID không
  // tra được) nhưng cột Giao dịch/Chỉ tiêu vẫn có số — nhìn như báo cáo
  // thiếu dữ liệu ngẫu nhiên. Bật cờ này để ẨN HẲN dòng đó cho tới khi admin
  // khai đủ ánh xạ, tránh hiện dòng nửa vời — xem lib/diemStkMapping.js.
  const requireDiemStkMapping = !!definition.requireDiemStkMapping;
  const diemMappingForFilter = requireDiemStkMapping ? await loadDiemStkMapping() : null;
  // Phạm vi dữ liệu theo siêu thị (bản 8.51, theo yêu cầu người dùng — xem
  // app.UserStoreAccess) — filterValues.__storeScope do SERVER tự gắn ở
  // routes/reports.js/routes/dashboards.js theo app.UserStoreAccess của
  // người đang gọi (KHÔNG đọc trực tiếp từ client, xem 2 route đó) — mảng
  // MaDiem người đó CHỈ ĐƯỢC xem, null/undefined = "Toàn bộ" (không lọc gì,
  // đúng hành vi gốc). CHỈ lọc được khi entityCode của MỌI khối không phải
  // target đã quy về mã Điểm chuẩn (useDiemStkMapping/mapBuIdToMaDiem BẬT ở
  // TẤT CẢ các khối đó — xem lib/diemStkMapping.js:remapRowsToDiem()/
  // buildBuIdLookup()) — báo cáo composite KHÔNG dùng 1 trong 2 cờ này thì
  // entityCode vẫn là mã kho/mã thô, KHÔNG lọc được đáng tin cậy theo mã
  // Điểm -> GIỮ NGUYÊN không lọc (coi như báo cáo không có cột "siêu thị"
  // theo đúng nghĩa chuẩn, không phải lỗ hổng — giống báo cáo khác không bị
  // tính năng này đụng tới).
  const storeScope = Array.isArray(filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;
  const entityIsMaDiem = definition.blocks.filter(b => !b.isTarget).every(b => b.useDiemStkMapping || b.mapBuIdToMaDiem);
  const applyStoreScope = !!(storeScope && entityIsMaDiem);
  const mergedRows = [...merged.values()].filter(
    r => !targetBlockKeys.some(key => r[key]?.TrangThai === 'DaDong')
      && !ambiguousEntityCodes.has(r.entityCode)
      && (!requireTargetMatch || targetBlockKeys.some(key => r[key] !== undefined))
      && (!requireDiemStkMapping || diemMappingForFilter.has(r.entityCode))
      && (!applyStoreScope || storeScope.has(r.entityCode))
  );
  // Cột khớp `hideWhen` -> LOẠI HẲN khỏi danh sách cột trả về (không chỉ để
  // trống giá trị) — dùng cho "chế độ xem" tuỳ chọn ẩn bớt nhóm cột so sánh,
  // xem chú thích block.skipWhen/column.hideWhen ở đầu file.
  const visibleColumns = definition.columns.filter(col => !matchesCondition(col.hideWhen, filterValues));
  const columns = describeColumns(visibleColumns);
  // warnings — CHỈ cảnh báo "có thực thể bị loại", không liệt kê entityCode
  // cụ thể ra tận giao diện người dùng cuối (rp-user) — thông tin đó dành
  // cho admin xem qua log server (console.warn ở trên), tránh lộ mã thực
  // thể/chi tiết cấu hình nội bộ cho người dùng thường.
  const warnings = ambiguousEntityCodes.size
    ? [`Đã loại ${ambiguousEntityCodes.size} thực thể khỏi báo cáo do dữ liệu nguồn không nhất quán (1 khối trả nhiều hơn 1 dòng cho cùng thực thể) — liên hệ quản trị viên để kiểm tra lại cấu hình.`]
    : [];

  // topN (xem chú thích DefinitionJson.topN ở đầu file) — kiểm tra TRƯỚC
  // groupBy, bỏ qua hẳn groupBy nếu lỡ khai cả 2 trong cùng 1 definition.
  if (definition.topN) {
    const { field: rankField, direction = 'desc', limit = 5, filterField, filterValue } = definition.topN;
    const rankPath = rankField.split('.');
    const rankDir = direction === 'asc' ? 1 : -1;
    const candidateRows = filterField
      ? mergedRows.filter(r => String(resolveCompositeField(r, filterField.split('.'))) === String(filterValue))
      : mergedRows;
    const ranked = [...candidateRows].sort((a, b) => {
      const va = Number(resolveCompositeField(a, rankPath)) || 0;
      const vb = Number(resolveCompositeField(b, rankPath)) || 0;
      return (va - vb) * rankDir;
    }).slice(0, limit);
    const rows = ranked.map((r, i) => ({ ...projectCompositeRow(r, visibleColumns), stt: i + 1 }));
    return { columns, rows, warnings, columnGroups: definition.columnGroups || null };
  }

  if (!definition.groupBy) {
    return { columns, rows: mergedRows.map(r => projectCompositeRow(r, visibleColumns)), warnings, columnGroups: definition.columnGroups || null };
  }

  const { field, groups = [], grandTotalLabel, labelColumn, sortBy } = definition.groupBy;
  const groupPath = field.split('.');
  const sortPath = sortBy ? sortBy.field.split('.') : null;
  const sortDir = sortBy && sortBy.direction === 'asc' ? 1 : -1; // mặc định DESC
  const blockKeys = definition.blocks.map(b => b.key);
  const rows = [];
  const matchedValues = new Set();

  // Sắp xếp ổn định (Array.prototype.sort của Node đã stable từ lâu) —
  // dòng cùng giá trị sortBy giữ nguyên thứ tự tương đối ban đầu.
  function applySortBy(list) {
    if (!sortPath) return list;
    return [...list].sort((a, b) => {
      const va = Number(resolveCompositeField(a, sortPath)) || 0;
      const vb = Number(resolveCompositeField(b, sortPath)) || 0;
      return (va - vb) * sortDir;
    });
  }

  for (const g of groups) {
    matchedValues.add(g.value);
    const groupRows = applySortBy(mergedRows.filter(r => resolveCompositeField(r, groupPath) === g.value));
    if (!groupRows.length) continue;
    rows.push(...groupRows.map(r => projectCompositeRow(r, visibleColumns)));
    const subtotalRow = projectCompositeRow(sumMergedRows(groupRows, blockKeys), visibleColumns);
    if (labelColumn) subtotalRow[labelColumn] = g.label;
    subtotalRow.__isSubtotal = true;
    rows.push(subtotalRow);
  }
  // Dòng không khớp nhóm nào đã khai (dữ liệu ngoài dự kiến) — vẫn xuất
  // hiện ở cuối, KHÔNG âm thầm mất, để lộ ngay lỗi cấu hình "groups" thiếu.
  const unmatched = applySortBy(mergedRows.filter(r => !matchedValues.has(resolveCompositeField(r, groupPath))));
  rows.push(...unmatched.map(r => projectCompositeRow(r, visibleColumns)));

  const grandRow = projectCompositeRow(sumMergedRows(mergedRows, blockKeys), visibleColumns);
  if (labelColumn) grandRow[labelColumn] = grandTotalLabel || 'Tổng cộng';
  grandRow.__isSubtotal = true;
  grandRow.__isGrandTotal = true;
  rows.push(grandRow);

  // columnGroups (bản 8.53) — xem chú thích ở lib/reportRunner.js, cùng lý
  // do an toàn để lộ.
  return { columns, rows, warnings, columnGroups: definition.columnGroups || null };
}

module.exports = { runCompositeReport, resolveRequestedRange };
