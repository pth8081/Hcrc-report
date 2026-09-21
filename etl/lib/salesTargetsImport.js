// lib/salesTargetsImport.js — Đọc file Excel chỉ tiêu (target/KPI) admin tải
// lên và ghi vào dwh.SalesTargets (bảng RIÊNG khỏi dwh.ReportFacts — xem
// dwh/schema.sql + dwh/grants.sql). Dùng RIÊNG pool "DWH_TARGET_IMPORTER"
// (KHÔNG dùng pool "DWH"/etl_writer) — xem routes/admin/salesTargets.js.
//
// TỰ NHẬN DIỆN 1 trong 3 định dạng file theo tên cột ở dòng tiêu đề (dò tối
// đa 3 dòng đầu — mẫu "Lãnh đạo Tập đoàn" có 1 dòng ghi chú trước dòng tiêu
// đề thật) — xem detectHeaderRow():
//
//   (1) "generic" — dòng 1 header, 2 cột CỐ ĐỊNH "MaSieuThi" + "Thang"
//       (dạng YYYY-MM) — hành vi CŨ, chỉ tiêu THEO THÁNG, các cột sau tuỳ ý
//       trở thành tên chỉ tiêu. Dành cho báo cáo khác ngoài LDTD/HCRC nếu
//       sau này cần chỉ tiêu tháng đơn giản.
//   (2) "ldtd-daily" — đúng mẫu file thật đội Lãnh đạo Tập đoàn gửi
//       ("Ngày/tháng", "Ngày", "Điểm", "Nhóm điểm", "Doanh thu", "Bill") —
//       chỉ tiêu THEO NGÀY, 1 dòng/(ngày, siêu thị).
//   (3) "hcrc-daily" — đúng mẫu file thật đội HCRC gửi ("Kỳ",
//       "Mã đối tượng chứa", "Mã loại chỉ tiêu", "Giá trị chỉ tiêu"...) —
//       cũng chỉ tiêu THEO NGÀY nhưng dạng bảng "dài": mỗi dòng chỉ mang 1
//       loại chỉ tiêu, phải GHÉP nhiều dòng cùng (Kỳ, Mã đối tượng chứa)
//       thành 1 dòng chỉ tiêu.
//
// (2) và (3) đều ghi ra ĐÚNG tên field "ChiTieuDoanhThu"/"ChiTieuGiaoDich"
// — khớp sẵn công thức trong DefinitionJson 2 báo cáo LDTD/HCRC (xem
// rp-server/scripts/seedLdtdHcrcReports.js, "báo cáo doanh thu cuối
// ngày.md" Bước 4) — không cần sửa gì báo cáo khi đổi định dạng file nhập.
//
// "Chỉ tiêu THEO NGÀY" nghĩa là PeriodMonth (tên cột DB giữ nguyên, xem
// dwh/schema.sql) lưu ĐÚNG 1 NGÀY CỤ THỂ thay vì luôn là ngày 1 đầu tháng —
// cột vẫn chỉ là kiểu DATE thường, không cần đổi schema. Khối "target"
// trong báo cáo composite phải khai thêm "targetGranularity": "day" để tra
// đúng theo ngày thay vì đầu tháng (xem rp-server/lib/compositeReportRunner.js).
//
// Cột "TrangThai"/"MaNganhHang" (xem chú thích cũ bên dưới) CHỈ áp dụng cho
// định dạng (1) "generic" — 2 mẫu thật (2)/(3) của LDTD/HCRC KHÔNG có cột
// này (không có trong file mẫu thật gửi) — siêu thị đóng cửa giữa tháng ở 2
// mẫu này xử lý bằng cách ĐƠN GIẢN LÀ KHÔNG gửi dòng của những ngày sau khi
// đóng cửa, không có cơ chế đánh dấu tường minh như (1).
//
// Cột "TrangThai" (TUỲ CHỌN, không bắt buộc có) — "HoatDong" (mặc định nếu
// để trống/không có cột) hoặc "DaDong". Report composite (xem
// rp-server/lib/compositeReportRunner.js) LOẠI HẲN siêu thị khỏi báo cáo
// khi thấy ĐÚNG "DaDong" — CỐ Ý không suy luận từ việc THIẾU dòng chỉ tiêu
// (siêu thị chưa kịp nhập chỉ tiêu tháng đó vẫn phải hiện ra, chỉ trống cột
// Chỉ tiêu, không được âm thầm biến mất chỉ vì ai đó quên 1 dòng).
//
// Cột "MaNganhHang" (TUỲ CHỌN) — chỉ tiêu THEO NGÀNH HÀNG thay vì theo cả
// siêu thị: có cột này VÀ có giá trị ở 1 dòng thì EntityCode dòng đó thành
// "<MaSieuThi>_<MaNganhHang>" (không phải chỉ MaSieuThi) — PHẢI khớp ĐÚNG
// quy ước EntityCode của domain THỰC ĐẠT tương ứng bên ETL (job "Theo bảng"
// đọc từ 1 VIEW nguồn có sẵn cột ghép "<MãSiêuThị>_<MãNgànhHàng>" làm "Cột
// khoá" — xem hướng_dẫn_báo_cáo.md mục 5) để composite report ghép đúng
// dòng thực đạt với dòng chỉ tiêu (ghép theo entityCode, xem
// rp-server/lib/compositeReportRunner.js). MaSieuThi/MaNganhHang GỐC vẫn
// được ghi thêm vào TargetsJson (không chỉ nằm trong EntityCode ghép) để
// công thức báo cáo đọc thẳng "target.MaSieuThi"/"target.MaNganhHang" mà
// không cần tách chuỗi EntityCode. Dòng KHÔNG có MaNganhHang (để trống/file
// không có cột) giữ nguyên hành vi cũ 100% — EntityCode = MaSieuThi, không
// thêm field nào vào TargetsJson.
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const REQUIRED_HEADERS = ['MaSieuThi', 'Thang'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIOD_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TRANG_THAI_VALUES = ['HoatDong', 'DaDong'];

// Ô CÔNG THỨC trong Excel: ExcelJS trả .value = {formula, result} (hoặc
// {error} nếu công thức lỗi vd "#DIV/0!") thay vì giá trị đã tính — trước
// đây code không nhận dạng dạng này, Number({formula,result}) = NaN nên rơi
// vào nhánh "giữ nguyên chuỗi gốc", ghi NGUYÊN OBJECT {formula,result} vào
// TargetsJson thay vì con số, hỏng âm thầm dữ liệu chỉ tiêu (công thức báo
// cáo đọc target.<Cột> kỳ vọng number lại gặp object). Lấy đúng .result đã
// tính sẵn (Excel đã tính khi lưu file); ô lỗi công thức coi như trống.
function extractCellValue(raw) {
  if (raw && typeof raw === 'object' && !(raw instanceof Date)) {
    if (Object.prototype.hasOwnProperty.call(raw, 'result')) return raw.result;
    if (Object.prototype.hasOwnProperty.call(raw, 'error')) return null;
    if (Object.prototype.hasOwnProperty.call(raw, 'richText')) return raw.richText.map(t => t.text).join('');
  }
  return raw;
}

// Số kiểu Việt Nam gõ vào ô định dạng Text (dấu phẩy thập phân, dấu chấm
// ngăn nghìn TUỲ CHỌN — vd "15,5" hoặc "1.234,56") — Number() chuẩn JS đọc
// "," như ký tự lạ nên ra NaN, trước đây rơi vào nhánh "giữ nguyên chuỗi
// gốc" (lưu "15,5" dạng string vào TargetsJson thay vì số 15.5), công thức
// báo cáo tính sai âm thầm. CHỈ áp dụng khi khớp CHẶT mẫu số kiểu này —
// tránh đoán nhầm 1 chuỗi không phải số (vd mã tự do) thành số.
function parseVietnameseNumber(str) {
  if (!/^-?\d{1,3}(\.\d{3})*,\d+$/.test(str) && !/^-?\d+,\d+$/.test(str)) return undefined;
  const n = Number(str.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

// Đọc "ngày" LINH HOẠT — 2 mẫu file thật LDTD/HCRC đều ghi ngày dưới dạng
// SỐ YYYYMMDD (vd 20260901) chứ không phải ô định dạng Ngày chuẩn Excel, và
// KHÔNG NHẤT QUÁN kiểu dữ liệu giữa các dòng (dòng đầu Excel lưu thành
// chuỗi text, các dòng sau lưu thành số) — chấp nhận cả Date (ô có định
// dạng ngày thật), số/chuỗi 8 chữ số YYYYMMDD, và chuỗi ISO "YYYY-MM-DD" có
// sẵn. Trả về "YYYY-MM-DD" hoặc null nếu không đọc được.
function parseFlexibleDate(raw) {
  const v = extractCellValue(raw);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v === null || v === undefined || v === '') return null;
  const str = String(v).trim();
  if (PERIOD_DATE_RE.test(str)) return str;
  const digits = str.replace(/\.0+$/, '');
  if (/^\d{8}$/.test(digits)) {
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    if (month < '01' || month > '12' || day < '01' || day > '31') return null;
    return `${digits.slice(0, 4)}-${month}-${day}`;
  }
  return null;
}

// Chặn sớm file .xlsx có QUÁ NHIỀU dòng — xem chú thích cùng tên trong
// lib/dataSourcesImport.js.
const MAX_IMPORT_ROWS = 5000;

// Giới hạn dung lượng SAU GIẢI NÉN, kiểm tra TRƯỚC workbook.xlsx.load() —
// xem chú thích cùng tên trong lib/dataSourcesImport.js.
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

// Dò dòng tiêu đề trong tối đa 3 dòng đầu (mẫu LDTD có 1 dòng ghi chú ở
// trên dòng tiêu đề thật) — nhận diện theo TẬP HỢP tên cột đặc trưng của
// từng định dạng, không cần khớp CHÍNH XÁC toàn bộ danh sách cột (mẫu HCRC
// thật có 1-2 tên cột hơi khác chuẩn chính tả — dò theo vài cột ổn định
// nhất, ít rủi ro đổi tên hơn).
function detectHeaderRow(sheet) {
  const maxScan = Math.min(3, sheet.rowCount);
  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber++) {
    const headers = [];
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber] = String(extractCellValue(cell.value) ?? '').trim();
    });
    const set = new Set(headers.filter(Boolean));
    if (set.has('MaSieuThi') && set.has('Thang')) return { rowNumber, headers, shape: 'generic' };
    if (set.has('Điểm') && set.has('Doanh thu') && set.has('Bill')) return { rowNumber, headers, shape: 'ldtd-daily' };
    if (set.has('Kỳ') && set.has('Mã đối tượng chứa') && set.has('Mã loại chỉ tiêu') && set.has('Giá trị chỉ tiêu')) {
      return { rowNumber, headers, shape: 'hcrc-daily' };
    }
  }
  return null;
}

// ---- (1) Định dạng "generic" — hành vi CŨ, chỉ tiêu THEO THÁNG ----------
function parseGenericShape(sheet, detected) {
  const { rowNumber: headerRow, headers } = detected;
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`File thiếu cột bắt buộc "${required}"`);
    }
  }
  const maSieuThiCol = headers.indexOf('MaSieuThi');
  const thangCol = headers.indexOf('Thang');
  const trangThaiCol = headers.indexOf('TrangThai'); // -1 nếu file không có cột này (hợp lệ, tuỳ chọn)
  const maNganhHangCol = headers.indexOf('MaNganhHang'); // -1 nếu file không có cột này (hợp lệ, tuỳ chọn)
  const targetCols = [];
  headers.forEach((name, colNumber) => {
    if (name && !['MaSieuThi', 'Thang', 'TrangThai', 'MaNganhHang'].includes(name)) targetCols.push({ name, colNumber });
  });
  // Chấp nhận file CHỈ có cột TrangThai (không cột chỉ tiêu số nào) — vd
  // chỉ để đánh dấu đóng cửa hàng loạt tháng này, không cần kèm số liệu.
  if (!targetCols.length && trangThaiCol === -1) {
    throw new Error('File không có cột chỉ tiêu nào ngoài MaSieuThi/Thang, và cũng không có cột TrangThai');
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const entityCodeRaw = row.getCell(maSieuThiCol).value;
    const maSieuThi = entityCodeRaw != null ? String(entityCodeRaw).trim() : '';
    const thangRaw = row.getCell(thangCol).value;
    const thang = thangRaw != null ? String(thangRaw).trim() : '';
    const maNganhHangRaw = maNganhHangCol !== -1 ? row.getCell(maNganhHangCol).value : null;
    const maNganhHang = maNganhHangRaw != null ? String(maNganhHangRaw).trim() : '';
    if (!maSieuThi && !thang) return; // dòng trống bỏ qua, không tính là lỗi

    if (!maSieuThi) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaSieuThi`); return; }
    if (!PERIOD_RE.test(thang)) {
      rowErrors.push(`Dòng ${rowNumber}: "Thang" phải dạng YYYY-MM (đang là "${thang}")`);
      return;
    }
    // Có ngành hàng -> EntityCode GHÉP (xem chú thích đầu file) — PHẢI khớp
    // đúng quy ước cột khoá của domain THỰC ĐẠT tương ứng bên ETL.
    const entityCode = maNganhHang ? `${maSieuThi}_${maNganhHang}` : maSieuThi;

    let trangThai = null;
    if (trangThaiCol !== -1) {
      const raw = row.getCell(trangThaiCol).value;
      const value = raw != null ? String(raw).trim() : '';
      if (value) {
        if (!TRANG_THAI_VALUES.includes(value)) {
          rowErrors.push(`Dòng ${rowNumber}: "TrangThai" phải là "HoatDong" hoặc "DaDong" (đang là "${value}")`);
          return;
        }
        trangThai = value;
      }
    }

    const targets = {};
    for (const { name, colNumber } of targetCols) {
      const v = extractCellValue(row.getCell(colNumber).value);
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'number') {
        targets[name] = v;
        continue;
      }
      const num = Number(v);
      if (Number.isFinite(num)) {
        targets[name] = num;
      } else if (typeof v === 'string') {
        const vn = parseVietnameseNumber(v.trim());
        targets[name] = vn !== undefined ? vn : v;
      } else {
        targets[name] = v;
      }
    }
    if (trangThai) targets.TrangThai = trangThai;
    // Ghi thêm MaSieuThi/MaNganhHang GỐC vào TargetsJson (ngoài việc đã ghép
    // vào EntityCode) — công thức báo cáo đọc thẳng "target.MaSieuThi"/
    // "target.MaNganhHang" mà không cần tự tách chuỗi EntityCode.
    if (maNganhHang) { targets.MaSieuThi = maSieuThi; targets.MaNganhHang = maNganhHang; }
    if (!Object.keys(targets).length) {
      rowErrors.push(`Dòng ${rowNumber}: không có giá trị chỉ tiêu nào (và không đánh dấu TrangThai)`);
      return;
    }

    rows.push({
      entityCode,
      periodMonth: new Date(`${thang}-01T00:00:00Z`),
      targets
    });
  });

  return { rows, rowErrors };
}

// ---- (2) Định dạng "ldtd-daily" — mẫu file thật đội Lãnh đạo Tập đoàn ---
// Cột cố định: "Ngày/tháng" (ngày áp dụng), "Điểm" (mã siêu thị), "Nhóm
// điểm" (TUỲ CHỌN, ghi thêm vào TargetsJson.NhomDiem để tham khảo — báo cáo
// hiện tại KHÔNG dùng field này), "Doanh thu" + "Bill". File mẫu thật ghi
// rõ ở dòng ghi chú "Chỉ lấy số nguyên, không lấy phần lẻ" và "cập nhật đủ
// cả 2 cột Doanh Thu và Bill, không cập nhật riêng lẻ" — Math.trunc() cắt
// phần thập phân (KHÔNG làm tròn), và 1 dòng chỉ có ĐÚNG 1 trong 2 cột bị
// coi là lỗi thay vì âm thầm chấp nhận nửa vời.
function parseLdtdDailyShape(sheet, detected) {
  const { rowNumber: headerRow, headers } = detected;
  const col = (name) => headers.indexOf(name);
  const dateCol = col('Ngày/tháng');
  const diemCol = col('Điểm');
  const nhomDiemCol = col('Nhóm điểm');
  const doanhThuCol = col('Doanh thu');
  const billCol = col('Bill');
  if (dateCol === -1 || diemCol === -1) {
    throw new Error('File thiếu cột bắt buộc "Ngày/tháng" hoặc "Điểm"');
  }

  const rows = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const entityCodeRaw = row.getCell(diemCol).value;
    const entityCode = entityCodeRaw != null ? String(extractCellValue(entityCodeRaw)).trim() : '';
    const dateISO = parseFlexibleDate(row.getCell(dateCol).value);
    if (!entityCode && !dateISO) return; // dòng trống bỏ qua, không tính là lỗi

    if (!entityCode) { rowErrors.push(`Dòng ${rowNumber}: thiếu "Điểm" (mã siêu thị)`); return; }
    if (!dateISO) { rowErrors.push(`Dòng ${rowNumber}: "Ngày/tháng" không đọc được (cần dạng ngày hoặc số YYYYMMDD)`); return; }

    const doanhThuRaw = doanhThuCol !== -1 ? extractCellValue(row.getCell(doanhThuCol).value) : null;
    const billRaw = billCol !== -1 ? extractCellValue(row.getCell(billCol).value) : null;
    const hasDoanhThu = doanhThuRaw !== null && doanhThuRaw !== undefined && doanhThuRaw !== '';
    const hasBill = billRaw !== null && billRaw !== undefined && billRaw !== '';
    if (hasDoanhThu !== hasBill) {
      rowErrors.push(`Dòng ${rowNumber}: file mẫu yêu cầu cập nhật đủ cả 2 cột "Doanh thu" và "Bill" cùng lúc, không cập nhật riêng lẻ`);
      return;
    }
    if (!hasDoanhThu && !hasBill) { rowErrors.push(`Dòng ${rowNumber}: thiếu cả "Doanh thu" và "Bill"`); return; }

    const doanhThu = Number(doanhThuRaw);
    const bill = Number(billRaw);
    if (!Number.isFinite(doanhThu) || !Number.isFinite(bill)) {
      rowErrors.push(`Dòng ${rowNumber}: "Doanh thu"/"Bill" phải là số (đang là "${doanhThuRaw}"/"${billRaw}")`);
      return;
    }

    const targets = { ChiTieuDoanhThu: Math.trunc(doanhThu), ChiTieuGiaoDich: Math.trunc(bill) };
    if (nhomDiemCol !== -1) {
      const nhomDiem = extractCellValue(row.getCell(nhomDiemCol).value);
      if (nhomDiem !== null && nhomDiem !== undefined && String(nhomDiem).trim()) targets.NhomDiem = String(nhomDiem).trim();
    }

    rows.push({ entityCode, periodMonth: new Date(`${dateISO}T00:00:00Z`), targets });
  });

  return { rows, rowErrors };
}

// ---- (3) Định dạng "hcrc-daily" — mẫu file thật đội HCRC gửi ------------
// Dạng bảng "dài": mỗi dòng chỉ mang 1 (Kỳ, Mã đối tượng chứa, Mã loại chỉ
// tiêu, Giá trị chỉ tiêu) — phải GHÉP nhiều dòng cùng (Kỳ, Mã đối tượng
// chứa) thành 1 dòng chỉ tiêu duy nhất.
//
// "Mã loại chỉ tiêu" KHÔNG có bảng chú giải trong file mẫu thật (cột "Tên
// loại chỉ tiêu" luôn để trống) — HCRC_TARGET_TYPE_MAP dưới đây SUY RA từ
// ĐỘ LỚN giá trị mẫu thực tế nhận được (mã "01": hàng chục/trăm triệu đồng
// -> doanh thu; mã "03": vài trăm -> số hoá đơn) — CẦN XÁC NHẬN LẠI với đội
// kế hoạch HCRC bằng dữ liệu thật trước khi coi là chính thức; sửa bảng này
// nếu sai hoặc phát sinh mã mới. Mã lạ (không có trong bảng) bị TỪ CHỐI rõ
// ràng (rowErrors) thay vì âm thầm bỏ qua/đoán bừa — đây là dữ liệu chỉ
// tiêu tài chính, sai lệch ở bước nhập liệu khó phát hiện lại sau này.
const HCRC_TARGET_TYPE_MAP = {
  '01': 'ChiTieuDoanhThu',
  '03': 'ChiTieuGiaoDich'
};

function parseHcrcDailyShape(sheet, detected) {
  const { rowNumber: headerRow, headers } = detected;
  const col = (name) => headers.indexOf(name);
  const kyCol = col('Kỳ');
  const maDoiTuongCol = col('Mã đối tượng chứa');
  const loaiDoiTuongCol = col('Loại đối tượng chứa');
  const maLoaiChiTieuCol = col('Mã loại chỉ tiêu');
  const giaTriCol = col('Giá trị chỉ tiêu');
  if (kyCol === -1 || maDoiTuongCol === -1 || maLoaiChiTieuCol === -1 || giaTriCol === -1) {
    throw new Error('File thiếu 1 trong các cột bắt buộc: "Kỳ", "Mã đối tượng chứa", "Mã loại chỉ tiêu", "Giá trị chỉ tiêu"');
  }

  const groups = new Map(); // "dateISO|entityCode" -> { entityCode, periodMonth, targets }
  const order = [];
  const rowErrors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const entityCodeRaw = row.getCell(maDoiTuongCol).value;
    const entityCode = entityCodeRaw != null ? String(extractCellValue(entityCodeRaw)).trim() : '';
    const dateISO = parseFlexibleDate(row.getCell(kyCol).value);
    if (!entityCode && !dateISO) return; // dòng trống bỏ qua, không tính là lỗi

    if (!entityCode) { rowErrors.push(`Dòng ${rowNumber}: thiếu "Mã đối tượng chứa"`); return; }
    if (!dateISO) { rowErrors.push(`Dòng ${rowNumber}: "Kỳ" không đọc được (cần dạng ngày hoặc số YYYYMMDD)`); return; }

    const maLoaiRaw = row.getCell(maLoaiChiTieuCol).value;
    const maLoai = maLoaiRaw != null ? String(extractCellValue(maLoaiRaw)).trim() : '';
    const fieldName = HCRC_TARGET_TYPE_MAP[maLoai];
    if (!fieldName) {
      rowErrors.push(`Dòng ${rowNumber}: "Mã loại chỉ tiêu" = "${maLoai}" chưa được cấu hình ánh xạ (xem HCRC_TARGET_TYPE_MAP trong etl/lib/salesTargetsImport.js)`);
      return;
    }

    const giaTriRaw = extractCellValue(row.getCell(giaTriCol).value);
    const giaTri = Number(giaTriRaw);
    if (!Number.isFinite(giaTri)) {
      rowErrors.push(`Dòng ${rowNumber}: "Giá trị chỉ tiêu" phải là số (đang là "${giaTriRaw}")`);
      return;
    }

    const key = `${dateISO}|${entityCode}`;
    if (!groups.has(key)) {
      groups.set(key, { entityCode, periodMonth: new Date(`${dateISO}T00:00:00Z`), targets: {} });
      order.push(key);
    }
    const group = groups.get(key);
    if (group.targets[fieldName] !== undefined) {
      rowErrors.push(`Dòng ${rowNumber}: trùng "Mã loại chỉ tiêu" = "${maLoai}" cho cùng (Kỳ, Mã đối tượng chứa) đã gặp ở dòng trước — giữ giá trị dòng đầu`);
      return;
    }
    group.targets[fieldName] = giaTri;

    if (loaiDoiTuongCol !== -1) {
      const loaiDoiTuong = extractCellValue(row.getCell(loaiDoiTuongCol).value);
      if (loaiDoiTuong !== null && loaiDoiTuong !== undefined && String(loaiDoiTuong).trim()) {
        group.targets.LoaiDoiTuongChua = String(loaiDoiTuong).trim();
      }
    }
  });

  const rows = order.map(key => groups.get(key)).filter(g => Object.keys(g.targets).length > 0);
  return { rows, rowErrors };
}

// { rows: [{entityCode, periodMonth: Date, targets: {...}}], rowErrors: string[] }
async function parseSalesTargetsFile(buffer) {
  guardZipBombSize(buffer, MAX_UNCOMPRESSED_BYTES);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new Error(`File có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
  }

  const detected = detectHeaderRow(sheet);
  if (!detected) {
    throw new Error(
      'Không nhận diện được định dạng file — cần đúng 1 trong 3 mẫu cột: ' +
      '(1) "MaSieuThi"+"Thang"; ' +
      '(2) "Điểm"+"Doanh thu"+"Bill" (mẫu Lãnh đạo Tập đoàn); ' +
      '(3) "Kỳ"+"Mã đối tượng chứa"+"Mã loại chỉ tiêu"+"Giá trị chỉ tiêu" (mẫu HCRC)'
    );
  }

  if (detected.shape === 'generic') return parseGenericShape(sheet, detected);
  if (detected.shape === 'ldtd-daily') return parseLdtdDailyShape(sheet, detected);
  return parseHcrcDailyShape(sheet, detected);
}

// Staging + MERGE — cùng mẫu với lib/upsert.js, khoá theo
// (Domain, EntityCode, PeriodMonth) thay vì (SourceSystem, Domain, EntityCode).
// preserveTrangThaiIfUnspecified — CHỈ bật cho POST /import (nhập file):
// file re-upload có thể không đụng gì tới cột TrangThai (không có cột đó,
// hoặc để trống ở dòng này), khi đó GIỮ NGUYÊN TrangThai đang có thay vì để
// mất (xem chú thích ở MERGE bên dưới). PUT /one (sửa 1 dòng) KHÔNG bật cờ
// này — route đó có tài liệu rõ "GHI ĐÈ nguyên TargetsJson" vì giao diện đã
// tự tải dữ liệu hiện có lên form, để trống trangThai trong form nghĩa là
// admin CHỦ Ý xoá, không phải "không biết/không đụng tới".
async function upsertSalesTargets(pool, domain, rows, importedBy, { preserveTrangThaiIfUnspecified = false } = {}) {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query(`
      IF OBJECT_ID('tempdb..#StagingTargets') IS NOT NULL DROP TABLE #StagingTargets;
      CREATE TABLE #StagingTargets (
        Domain      VARCHAR(50)   NOT NULL,
        EntityCode  NVARCHAR(100) NOT NULL,
        PeriodMonth DATE          NOT NULL,
        TargetsJson NVARCHAR(MAX) NOT NULL
      );
    `);

    const table = new sql.Table('#StagingTargets');
    table.create = false;
    table.columns.add('Domain', sql.VarChar(50), { nullable: false });
    table.columns.add('EntityCode', sql.NVarChar(100), { nullable: false });
    table.columns.add('PeriodMonth', sql.Date, { nullable: false });
    table.columns.add('TargetsJson', sql.NVarChar(sql.MAX), { nullable: false });
    for (const r of rows) {
      table.rows.add(domain, r.entityCode, r.periodMonth, JSON.stringify(r.targets));
    }
    await new sql.Request(tx).bulk(table);

    // TargetsJson = src.TargetsJson (ghi đè NGUYÊN VẸN) TRỪ TrangThai khi
    // preserveTrangThaiIfUnspecified=1: lượt nhập KHÔNG đề cập TrangThai
    // (file không có cột đó, hoặc ô trống ở dòng này — parseSalesTargetsFile()
    // không đưa key TrangThai vào targets trong 2 trường hợp đó), mà dòng
    // CŨ đang có TrangThai — GIỮ NGUYÊN giá trị cũ thay vì để mất theo
    // TargetsJson mới. Không có nhánh này, 1 lượt re-upload chỉ để sửa SỐ
    // LIỆU (không đụng gì tới TrangThai) sẽ ÂM THẦM MỞ LẠI 1 siêu thị đã
    // đánh dấu "DaDong" ở lượt nhập trước — đúng kịch bản "quên 1 cột" gây
    // sai lệch composite report (xem chú thích đầu file). Upload MỚI có ghi
    // rõ TrangThai (kể cả 'HoatDong' để chủ động mở lại) vẫn LUÔN thắng —
    // chỉ giữ giá trị cũ khi upload không nói gì tới trường này.
    const mergeResult = await new sql.Request(tx)
      .input('importedBy', sql.NVarChar(50), importedBy || null)
      .input('preserveTrangThai', sql.Bit, preserveTrangThaiIfUnspecified ? 1 : 0)
      .query(`
        MERGE dwh.SalesTargets AS target
        USING #StagingTargets AS src
          ON  target.Domain = src.Domain
          AND target.EntityCode = src.EntityCode
          AND target.PeriodMonth = src.PeriodMonth
        WHEN MATCHED THEN
          UPDATE SET
            TargetsJson = CASE
              WHEN @preserveTrangThai = 1
                   AND JSON_VALUE(src.TargetsJson, '$.TrangThai') IS NULL
                   AND JSON_VALUE(target.TargetsJson, '$.TrangThai') IS NOT NULL
              THEN JSON_MODIFY(src.TargetsJson, '$.TrangThai', JSON_VALUE(target.TargetsJson, '$.TrangThai'))
              ELSE src.TargetsJson
            END,
            ImportedAt = SYSUTCDATETIME(),
            ImportedBy = @importedBy
        WHEN NOT MATCHED THEN
          INSERT (Domain, EntityCode, PeriodMonth, TargetsJson, ImportedAt, ImportedBy)
          VALUES (src.Domain, src.EntityCode, src.PeriodMonth, src.TargetsJson, SYSUTCDATETIME(), @importedBy)
        OUTPUT $action AS Action;
      `);

    await tx.commit();
    const actions = mergeResult.recordset.map(r => r.Action);
    return {
      inserted: actions.filter(a => a === 'INSERT').length,
      updated: actions.filter(a => a === 'UPDATE').length
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

module.exports = { parseSalesTargetsFile, upsertSalesTargets, PERIOD_RE, PERIOD_DATE_RE, TRANG_THAI_VALUES, HCRC_TARGET_TYPE_MAP };
