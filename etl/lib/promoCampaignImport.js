// lib/promoCampaignImport.js — Đọc 2 file Excel "dữ liệu gốc" của 1 chiến
// dịch khuyến mãi ("BRG Weekly Post") và ghi vào dwh.PromoCampaignSkus/
// dwh.PromoCampaignStoreWeights (xem chú thích đầy đủ tại CREATE TABLE
// trong dwh/schema.sql + "bc-brg-weekly-post.md").
//
// 2 file RIÊNG (admin tự chuẩn bị, KHÔNG phải sheet "By items"/"By Store"
// trong file báo cáo MKT gửi — đó là báo cáo ĐẦU RA, không phải khuôn
// nhập liệu của hệ thống này):
//   1. "Mã hàng" — 1 dòng/SKU, chỉ tiêu CẢ CHUỖI (xem buildSkuTemplate()).
//   2. "Trọng số siêu thị" — 1 dòng/mã Điểm, 1 số trọng số dùng để CHIA
//      chỉ tiêu cả chuỗi của mỗi SKU về từng siêu thị theo tỉ lệ
//      StoreWeight(X) / TỔNG StoreWeight mọi siêu thị trong chiến dịch.
const ExcelJS = require('exceljs');
const { sql } = require('../db');
const { guardZipBombSize } = require('./fileSignature');

const MAX_IMPORT_ROWS = 5000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const APPLY_SCOPE_HOP_LE = ['All', 'Mart', 'MiniMart'];

function sqlNStr(value) { return `N'${String(value).replace(/'/g, "''")}'`; }
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}
// Số — KHÔNG được quote (SQL hiểu nhầm là chuỗi), nhưng PHẢI qua Number()
// validate hữu hạn trước khi ghép thẳng vào câu SQL (chặn injection qua
// giá trị không phải số, vd công thức/chuỗi lạ trong ô Excel).
function sqlNumOrNull(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'NULL';
  return String(n);
}

// resolveCellValue (bản 11.38, SỬA LỖI THẬT — "Mã hiển thị" hiện
// "[object Object]" trên etl-admin, báo cáo người dùng; đồng thời làm BÁO
// CÁO "Tồn kho khuyến mãi" của Weekly Post LUÔN RA 0, vì "SkuCode" lưu
// SAI thành chuỗi "[object Object]" không khớp được mã hàng thật nào khi
// JOIN sang tồn kho) — ExcelJS trả `cell.value` là 1 OBJECT (không phải
// chuỗi/số thường) cho CÔNG THỨC (`{formula, result}`, vd cột "Mã sản
// phẩm" dùng =RIGHT(A2,6) — ĐÚNG file người dùng đã upload) và cho Ô RICH
// TEXT nhiều định dạng trong 1 ô (`{richText: [{text,...}, ...]}`) — gọi
// thẳng `String(cellValue)` trên các object này ra "[object Object]" (JS
// mặc định), KHÔNG BAO GIỜ ra đúng giá trị hiển thị. Giải nén đúng giá trị
// THẬT trước khi dùng — áp dụng NGAY tại hàm `cell()` (1 chỗ DUY NHẤT mỗi
// hàm parse) để MỌI cột dùng `str()`/số thô phía sau đều tự động được bảo
// vệ, không cần sửa riêng từng cột.
function resolveCellValue(v) {
  if (v && typeof v === 'object') {
    if (Object.prototype.hasOwnProperty.call(v, 'result')) return v.result; // công thức: {formula, result}
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join(''); // rich text nhiều định dạng
    if (Object.prototype.hasOwnProperty.call(v, 'text')) return v.text; // hyperlink: {text, hyperlink}
  }
  return v;
}

function normalizeApplyScope(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { value: 'All', error: null };
  const matched = APPLY_SCOPE_HOP_LE.find(v => v.toLowerCase() === trimmed.toLowerCase());
  if (!matched) {
    return { value: null, error: `"Áp dụng" = "${trimmed}" không hợp lệ — chỉ nhận "All", "Mart" hoặc "MiniMart"` };
  }
  return { value: matched, error: null };
}

async function readSheet(buffer) {
  guardZipBombSize(buffer, MAX_UNCOMPRESSED_BYTES);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new Error(`File có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
  }
  return sheet;
}

// readHeaders — `fields` = [{key, label}], tìm cột theo ĐÚNG `label` (chữ
// hiển thị trên file Excel, tiếng Việt thân thiện — bản 11.28, theo yêu
// cầu người dùng: "tôi muốn file mẫu với các trường thông tin giống như
// trong file excel [mẫu MKT gốc]... để người dùng có thể xử lý được
// ngay"), trả về `col[key]` (tên trường NỘI BỘ, giữ NGUYÊN không đổi —
// toàn bộ code parse/MERGE phía dưới vẫn dùng đúng `col.MaHang`/
// `col.GiaBanLe`/... như cũ, chỉ ĐỔI CÁCH TÌM CỘT, không đổi field nào).
function readHeaders(sheet, fields) {
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(resolveCellValue(cell.value) ?? '').trim();
  });
  const col = {};
  for (const f of fields) col[f.key] = headers.indexOf(f.label);
  return { headers, col };
}

// SKU_FIELDS — `label` lấy ĐÚNG tên cột đã dùng trong sheet "By items" của
// file báo cáo MKT thật ("BRG_Weekly_Post_T6K1_BC1.xlsx") cho các cột
// NGƯỜI DÙNG ĐÃ QUEN MẮT — CHỈ gồm cột ĐẦU VÀO (giá/scope/chỉ tiêu CẢ
// CHUỖI), KHÔNG gồm 12 cột ĐẦU RA của sheet đó (Số lượng/Doanh thu thực
// tế/dự kiến, % Thực hiện, Tồn kho, Giá trị tồn — báo cáo TỰ TÍNH từ dữ
// liệu đã đồng bộ, không phải thứ tải lên) — xem sheet "Hướng dẫn" trong
// chính file mẫu (buildPromoCampaignSkuTemplate()) để người nhập không
// nhầm dán nguyên cả 23 cột từ file báo cáo gốc vào đây.
const SKU_FIELDS = [
  { key: 'MaHang', label: 'Mã 10 số' },
  { key: 'SkuCode', label: 'Mã sản phẩm' },
  { key: 'SkuName', label: 'Tên sản phẩm' },
  { key: 'DeptName', label: 'Ngành hàng' },
  { key: 'GiaBanLe', label: 'Giá bán lẻ' },
  { key: 'GiaKmMart', label: 'Giá khuyến mại MART' },
  { key: 'GiaKmMini', label: 'Giá khuyến mại Mini' },
  { key: 'PromoNote', label: 'Note' },
  { key: 'PercentKm', label: 'Total KM' },
  { key: 'TaxRate', label: 'Thuế' },
  { key: 'ApplyScope', label: 'Áp dụng' },
  { key: 'SoLuongKeHoachTotal', label: 'Số lượng kế hoạch (cả chuỗi)' },
  { key: 'DoanhThuKeHoachTotal', label: 'Doanh thu kế hoạch (cả chuỗi)' }
];

// { rows: [{maHang, skuCode, ...}], rowErrors: string[] }
async function parsePromoCampaignSkuFile(buffer) {
  const sheet = await readSheet(buffer);
  const { col } = readHeaders(sheet, SKU_FIELDS);
  if (col.MaHang === -1) throw new Error('File thiếu cột bắt buộc "Mã 10 số"');

  const rows = [];
  const rowErrors = [];
  const seenInFile = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : resolveCellValue(row.getCell(colIndex).value));
    const str = (v) => (v != null ? String(v).trim() : '');

    const maHang = str(cell(col.MaHang));
    if (!maHang) return; // dòng trống bỏ qua
    if (seenInFile.has(maHang)) { rowErrors.push(`Dòng ${rowNumber}: MaHang "${maHang}" đã xuất hiện ở dòng khác trong CHÍNH file này`); return; }
    seenInFile.add(maHang);

    const { value: applyScope, error: applyScopeError } = normalizeApplyScope(str(cell(col.ApplyScope)));
    if (applyScopeError) { rowErrors.push(`Dòng ${rowNumber}: ${applyScopeError}`); return; }

    // CẢNH BÁO (bản 11.35, theo yêu cầu người dùng — audit "BRG Weekly
    // Post" phát hiện rủi ro: công thức Giá trị tồn dùng `taxRate` dưới
    // dạng PHÂN SỐ, vd 0.1 = 10%, xem lib/brgWeeklyPostCore.js) — nhập số
    // NGUYÊN (vd "10" thay vì "0.1"/"10%") làm Giá trị tồn sai lệch ~9 lần,
    // KHÔNG có cách nào phân biệt chắc chắn 100% đây là lỗi hay thuế thật
    // sự ≥100% (không có trong thực tế bán lẻ VN), nên CHỈ CẢNH BÁO (không
    // chặn dòng — vẫn nhập, admin tự xem lại nếu thấy cảnh báo này).
    const taxRate = cell(col.TaxRate);
    if (typeof taxRate === 'number' && taxRate >= 1) {
      rowErrors.push(`Dòng ${rowNumber}: Thuế = ${taxRate} — có vẻ nhập SỐ NGUYÊN (vd "10") thay vì PHÂN SỐ ("0.1" = 10%), kiểm tra lại định dạng ô này (dòng VẪN ĐƯỢC NHẬP, chỉ là cảnh báo).`);
    }

    rows.push({
      maHang,
      skuCode: str(cell(col.SkuCode)) || null,
      skuName: str(cell(col.SkuName)) || null,
      deptName: str(cell(col.DeptName)) || null,
      giaBanLe: cell(col.GiaBanLe),
      giaKmMart: cell(col.GiaKmMart),
      giaKmMini: cell(col.GiaKmMini),
      promoNote: str(cell(col.PromoNote)) || null,
      percentKm: cell(col.PercentKm),
      taxRate,
      applyScope,
      soLuongKeHoachTotal: cell(col.SoLuongKeHoachTotal),
      doanhThuKeHoachTotal: cell(col.DoanhThuKeHoachTotal)
    });
  });

  return { rows, rowErrors };
}

const STORE_WEIGHT_FIELDS = [
  { key: 'MaDiem', label: 'Mã điểm' },
  { key: 'StoreWeight', label: 'Trọng số' }
];

async function parsePromoCampaignStoreWeightFile(buffer) {
  const sheet = await readSheet(buffer);
  const { col } = readHeaders(sheet, STORE_WEIGHT_FIELDS);
  if (col.MaDiem === -1) throw new Error('File thiếu cột bắt buộc "Mã điểm"');
  if (col.StoreWeight === -1) throw new Error('File thiếu cột bắt buộc "Trọng số"');

  const rows = [];
  const rowErrors = [];
  const seenInFile = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (colIndex) => (colIndex === -1 ? null : resolveCellValue(row.getCell(colIndex).value));
    const str = (v) => (v != null ? String(v).trim() : '');

    const maDiem = str(cell(col.MaDiem));
    const weightRaw = cell(col.StoreWeight);
    if (!maDiem && (weightRaw === null || weightRaw === undefined || weightRaw === '')) return; // dòng trống
    if (!maDiem) { rowErrors.push(`Dòng ${rowNumber}: thiếu MaDiem`); return; }
    if (seenInFile.has(maDiem)) { rowErrors.push(`Dòng ${rowNumber}: MaDiem "${maDiem}" đã xuất hiện ở dòng khác trong CHÍNH file này`); return; }
    seenInFile.add(maDiem);

    const weight = Number(weightRaw);
    if (!Number.isFinite(weight)) { rowErrors.push(`Dòng ${rowNumber}: StoreWeight "${weightRaw}" không phải số hợp lệ`); return; }

    rows.push({ maDiem, storeWeight: weight });
  });

  return { rows, rowErrors };
}

// ---- Staging + MERGE (mirror lib/diemStkMappingImport.js).
const ROWS_PER_TRANSACTION = 2000;
const INSERT_BATCH_SIZE = 500;

function buildSkuInsertBatches(campaignId, rows, importedBy) {
  const batches = [];
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${campaignId}, ${sqlNStr(r.maHang)}, ${sqlNStrOrNull(r.skuCode)}, ${sqlNStrOrNull(r.skuName)}, ${sqlNStrOrNull(r.deptName)}, ${sqlNumOrNull(r.giaBanLe)}, ${sqlNumOrNull(r.giaKmMart)}, ${sqlNumOrNull(r.giaKmMini)}, ${sqlNStrOrNull(r.promoNote)}, ${sqlNumOrNull(r.percentKm)}, ${sqlNumOrNull(r.taxRate)}, ${sqlNStr(r.applyScope)}, ${sqlNumOrNull(r.soLuongKeHoachTotal)}, ${sqlNumOrNull(r.doanhThuKeHoachTotal)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
    batches.push(`INSERT INTO #StagingPromoSkus (CampaignId, MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini, PromoNote, PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal, DoanhThuKeHoachTotal, ImportedBy) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_SKU_SQL = `
IF OBJECT_ID('tempdb..#StagingPromoSkus') IS NOT NULL DROP TABLE #StagingPromoSkus;
CREATE TABLE #StagingPromoSkus (
  CampaignId           INT NOT NULL,
  MaHang               NVARCHAR(50) NOT NULL,
  SkuCode              NVARCHAR(50) NULL,
  SkuName              NVARCHAR(300) NULL,
  DeptName             NVARCHAR(100) NULL,
  GiaBanLe             DECIMAL(18,2) NULL,
  GiaKmMart            DECIMAL(18,2) NULL,
  GiaKmMini            DECIMAL(18,2) NULL,
  PromoNote            NVARCHAR(300) NULL,
  PercentKm            DECIMAL(9,6) NULL,
  TaxRate              DECIMAL(9,6) NULL,
  ApplyScope           VARCHAR(20) NOT NULL,
  SoLuongKeHoachTotal  DECIMAL(18,3) NULL,
  DoanhThuKeHoachTotal DECIMAL(18,2) NULL,
  ImportedBy           NVARCHAR(50) NULL
);`;

const MERGE_SKU_SQL = `
MERGE dwh.PromoCampaignSkus AS target
USING #StagingPromoSkus AS src
  ON target.CampaignId = src.CampaignId AND target.MaHang = src.MaHang
WHEN MATCHED THEN
  UPDATE SET
    SkuCode = src.SkuCode, SkuName = src.SkuName, DeptName = src.DeptName,
    GiaBanLe = src.GiaBanLe, GiaKmMart = src.GiaKmMart, GiaKmMini = src.GiaKmMini,
    PromoNote = src.PromoNote, PercentKm = src.PercentKm, TaxRate = src.TaxRate,
    ApplyScope = src.ApplyScope, SoLuongKeHoachTotal = src.SoLuongKeHoachTotal,
    DoanhThuKeHoachTotal = src.DoanhThuKeHoachTotal,
    ImportedAt = SYSUTCDATETIME(), ImportedBy = src.ImportedBy
WHEN NOT MATCHED THEN
  INSERT (CampaignId, MaHang, SkuCode, SkuName, DeptName, GiaBanLe, GiaKmMart, GiaKmMini, PromoNote, PercentKm, TaxRate, ApplyScope, SoLuongKeHoachTotal, DoanhThuKeHoachTotal, ImportedAt, ImportedBy)
  VALUES (src.CampaignId, src.MaHang, src.SkuCode, src.SkuName, src.DeptName, src.GiaBanLe, src.GiaKmMart, src.GiaKmMini, src.PromoNote, src.PercentKm, src.TaxRate, src.ApplyScope, src.SoLuongKeHoachTotal, src.DoanhThuKeHoachTotal, SYSUTCDATETIME(), src.ImportedBy)
OUTPUT $action AS Action;`;

async function upsertChunked(pool, rows, buildBatches, mergeSql, createStagingSql) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  let inserted = 0, updated = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_TRANSACTION) {
    const chunk = rows.slice(i, i + ROWS_PER_TRANSACTION);
    const setupSql = [createStagingSql, ...buildBatches(chunk)].join('\n');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const mergeResult = await new sql.Request(tx).query([setupSql, mergeSql].join('\n'));
      await tx.commit();
      const actions = mergeResult.recordset.map(r => r.Action);
      inserted += actions.filter(a => a === 'INSERT').length;
      updated += actions.filter(a => a === 'UPDATE').length;
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }
  return { inserted, updated };
}

async function upsertPromoCampaignSkus(pool, campaignId, rows, importedBy) {
  return upsertChunked(pool, rows, (chunk) => buildSkuInsertBatches(campaignId, chunk, importedBy), MERGE_SKU_SQL, CREATE_STAGING_SKU_SQL);
}

function buildStoreWeightInsertBatches(campaignId, rows, importedBy) {
  const batches = [];
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    const values = chunk.map(r => `(${campaignId}, ${sqlNStr(r.maDiem)}, ${sqlNumOrNull(r.storeWeight)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
    batches.push(`INSERT INTO #StagingPromoStoreWeights (CampaignId, MaDiem, StoreWeight, ImportedBy) VALUES\n${values};`);
  }
  return batches;
}

const CREATE_STAGING_STORE_WEIGHT_SQL = `
IF OBJECT_ID('tempdb..#StagingPromoStoreWeights') IS NOT NULL DROP TABLE #StagingPromoStoreWeights;
CREATE TABLE #StagingPromoStoreWeights (
  CampaignId  INT NOT NULL,
  MaDiem      NVARCHAR(50) NOT NULL,
  StoreWeight DECIMAL(18,4) NOT NULL,
  ImportedBy  NVARCHAR(50) NULL
);`;

const MERGE_STORE_WEIGHT_SQL = `
MERGE dwh.PromoCampaignStoreWeights AS target
USING #StagingPromoStoreWeights AS src
  ON target.CampaignId = src.CampaignId AND target.MaDiem = src.MaDiem
WHEN MATCHED THEN
  UPDATE SET StoreWeight = src.StoreWeight, ImportedAt = SYSUTCDATETIME(), ImportedBy = src.ImportedBy
WHEN NOT MATCHED THEN
  INSERT (CampaignId, MaDiem, StoreWeight, ImportedAt, ImportedBy)
  VALUES (src.CampaignId, src.MaDiem, src.StoreWeight, SYSUTCDATETIME(), src.ImportedBy)
OUTPUT $action AS Action;`;

async function upsertPromoCampaignStoreWeights(pool, campaignId, rows, importedBy) {
  return upsertChunked(pool, rows, (chunk) => buildStoreWeightInsertBatches(campaignId, chunk, importedBy), MERGE_STORE_WEIGHT_SQL, CREATE_STAGING_STORE_WEIGHT_SQL);
}

// ---- Template files ("Tải file mẫu").
//
// guideLines (TUỲ CHỌN, bản 11.28) — thêm 1 sheet "Hướng dẫn" THỨ 2 (SAU
// sheet dữ liệu — readSheet() ở trên CHỈ đọc `workbook.worksheets[0]`, nên
// thêm sheet này KHÔNG ảnh hưởng gì tới việc đọc file lúc nhập lại) giải
// thích rõ cột nào cần điền/cột nào KHÔNG — vì tên cột trong sheet dữ liệu
// giờ CỐ Ý đặt giống hệt sheet "By items"/"By Store" của file báo cáo MKT
// gốc (theo yêu cầu người dùng, cho quen mắt), dễ khiến người nhập liệu
// tưởng nhầm có thể dán NGUYÊN VẸN dữ liệu từ sheet báo cáo gốc (có thêm
// nhiều cột TÍNH SẴN như Số lượng/Doanh thu thực tế, Tồn kho...) vào đây.
async function buildWorkbook(sheetName, headers, dataRows, guideLines) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((col) => { col.width = 22; });
  if (guideLines && guideLines.length) {
    const guideSheet = workbook.addWorksheet('Hướng dẫn');
    guideSheet.getColumn(1).width = 100;
    for (const line of guideLines) guideSheet.addRow([line]);
  }
  return workbook.xlsx.writeBuffer();
}

async function buildPromoCampaignSkuTemplate() {
  return buildWorkbook(
    'Ma hang',
    SKU_FIELDS.map(f => f.label),
    [
      ['2002216367', '216367', 'Bia 333 lon 330ml', 'Đồ uống', 12500, 12000, 12000, '', 0.04, 0.1, 'All', 37037, 404040390],
      ['2006330931', '330931', 'Combo 2 túi nước giặt MAXK 3kg', 'Hóa mỹ phẩm', 265000, 205000, '', '', 0.226415, 0.08, 'Mart', 0, 0]
    ],
    [
      'XOÁ 2 dòng ví dụ (Bia 333/Combo nước giặt) trước khi nhập — chỉ giữ lại để minh hoạ đúng khuôn cột.',
      'Tên cột ở sheet "Ma hang" cố ý đặt GIỐNG HỆT sheet "By items" trong file báo cáo MKT gửi hàng tuần, cho quen mắt — NHƯNG CHỈ gồm 13 cột ĐẦU VÀO (giá/scope/chỉ tiêu CẢ CHUỖI), KHÔNG dán nguyên cả sheet "By items" vào đây.',
      'TUYỆT ĐỐI KHÔNG tự thêm/dán các cột: "Số lượng thực tế", "Số lượng dự kiến", "Doanh thu thực tế", "doanh thu dự kiến", "% Thực hiện doanh số...", "Tồn kho", "Giá trị tồn" — đây là CỘT ĐẦU RA, báo cáo TỰ TÍNH từ dữ liệu bán hàng/tồn kho đã đồng bộ sẵn trong hệ thống, không phải thứ admin cung cấp.',
      '"Mã 10 số" = mã hàng (SKU_CODE trên DSMART16, dbo.SKU_DEF.SKU_CODE — KHÔNG PHẢI SKU_ID đầy đủ dù tên cột ghi "10 số", xem VERSION.md bản 11.49) — BẮT BUỘC, là khoá chính của mỗi dòng.',
      '"Áp dụng" chỉ nhận ĐÚNG 1 trong 3 giá trị: "All" (áp dụng cả Mart và Mini Mart), "Mart" (chỉ Mart), "MiniMart" (chỉ Mini Mart, viết liền không dấu cách) — viết khác đi sẽ bị báo lỗi khi nhập.',
      '"Total KM"/"Thuế" là tỷ lệ PHẦN THẬP PHÂN (vd 4% ghi là 0.04, 10% ghi là 0.1), KHÔNG ghi "4"/"10".',
      '"Số lượng kế hoạch (cả chuỗi)"/"Doanh thu kế hoạch (cả chuỗi)" = CHỈ TIÊU CỦA CẢ CHUỖI cho đúng SKU đó trong CTKM này — báo cáo "Theo siêu thị" tự chia về từng siêu thị theo "Trọng số siêu thị" (file mẫu riêng), KHÔNG điền chỉ tiêu riêng từng siêu thị ở đây.'
    ]
  );
}

async function buildPromoCampaignStoreWeightTemplate() {
  return buildWorkbook(
    'Trong so sieu thi',
    STORE_WEIGHT_FIELDS.map(f => f.label),
    [
      ['001', 1985833112],
      ['002', 1012926484]
    ],
    [
      'XOÁ 2 dòng ví dụ trước khi nhập.',
      '"Mã điểm" = mã Điểm chuẩn (khai ở etl-admin → "Ánh xạ Điểm - STK_ID"), KHÔNG phải mã kho STK_ID thô.',
      '"Trọng số" là 1 con số BẤT KỲ cho từng siêu thị — dùng để CHIA chỉ tiêu cả chuỗi của mỗi SKU về siêu thị đó theo tỉ lệ Trọng số(siêu thị này) / TỔNG Trọng số mọi siêu thị ÁP DỤNG ĐƯỢC SKU đó trong chiến dịch. Điền tạm số nào cũng được (vd 1) rồi dùng nút "Tính tự động" trên etl-admin để hệ thống TỰ TÍNH lại theo doanh thu thật gần đây của từng siêu thị — KHÔNG bắt buộc gõ tay (xem "bc-brg-weekly-post.md" mục "Trọng số siêu thị").',
      'KHÔNG cần điền đủ MỌI siêu thị đang hoạt động — siêu thị không có dòng ở đây coi như Trọng số = 0 (không nhận phân bổ chỉ tiêu).'
    ]
  );
}

// ---- Xuất file ("Xuất file") — bản 11.39, theo yêu cầu người dùng: xuất
// lại ĐÚNG danh sách SKU/trọng số siêu thị ĐANG LƯU trong CSDL cho 1 chiến
// dịch, dùng để xem lại/lưu trữ/gửi người khác đối chiếu — KHÁC "Tải file
// mẫu" (2 dòng ví dụ CỐ ĐỊNH, dùng để BIẾT KHUÔN CỘT trước khi nhập lần
// đầu). CÙNG KHUÔN CỘT với file mẫu/file nhập (SKU_FIELDS/STORE_WEIGHT_FIELDS)
// — file xuất ra có thể NHẬP LẠI THẲNG qua "Nhập file SKU"/"Nhập file
// trọng số" nếu cần sửa rồi tải lên lại (upsert theo đúng khoá
// MaHang/MaDiem, không tạo trùng dòng).
async function buildPromoCampaignSkuExport(rows) {
  return buildWorkbook(
    'Ma hang',
    SKU_FIELDS.map(f => f.label),
    rows.map(r => [
      r.maHang, r.skuCode, r.skuName, r.deptName, r.giaBanLe, r.giaKmMart, r.giaKmMini,
      r.promoNote, r.percentKm, r.taxRate, r.applyScope, r.soLuongKeHoachTotal, r.doanhThuKeHoachTotal
    ])
  );
}

async function buildPromoCampaignStoreWeightExport(rows) {
  return buildWorkbook(
    'Trong so sieu thi',
    STORE_WEIGHT_FIELDS.map(f => f.label),
    rows.map(r => [r.maDiem, r.storeWeight])
  );
}

// computeStoreRevenueByMaDiem (bản 11.44, theo yêu cầu người dùng — "nhập
// tay Trọng số mất thời gian, hệ thống có sẵn doanh thu rồi, tự tính giúp
// được không?") — TỔNG doanh thu domain `doanhthu_chinhanh` (domain NHỎ,
// 1 dòng/siêu thị/ngày — KHÁC HẲN domain SKU lớn `doanhthu_sku_nganhhang`,
// không có rủi ro hiệu năng như đã gặp ở fetchCurrentStock(), xem
// lib/brgWeeklyPostCore.js:fetchStoreWideTotals() bên rp-server — cùng
// domain, cùng tinh thần) trong [from, to], gộp theo mã Điểm qua
// `stkToMaDiem` (Map<STK_ID, MaDiem> — caller tự dựng từ
// etl.DiemStkMapping.MaStkMoi, domain CHỈ có kho HIỆN TẠI, không cần tách
// kỳ cũ/mới). STK_ID không khớp mã Điểm nào (chưa khai ở "Ánh xạ Điểm -
// STK_ID") bị bỏ qua, không tính nhầm.
//
// Đọc qua pool "DWH_PROMO_IMPORTER" (SELECT-ONLY dwh.ReportFacts, xem
// dwh/grants.sql) — KHÔNG mượn pool "DWH"/etl_writer quyền rộng hơn, giữ
// đúng tinh thần phòng thủ chiều sâu của cả file này.
async function computeStoreRevenueByMaDiem(dwhPool, stkToMaDiem, fromISO, toISO) {
  const result = await dwhPool.request()
    .input('domain', sql.VarChar(50), 'doanhthu_chinhanh')
    .input('from', sql.Date, fromISO)
    .input('to', sql.Date, toISO)
    .query('SELECT EntityCode, Measures FROM dwh.ReportFacts WHERE Domain = @domain AND EventDate BETWEEN @from AND @to');
  const revenueByMaDiem = new Map();
  for (const row of result.recordset) {
    const maDiem = stkToMaDiem.get(row.EntityCode);
    if (!maDiem) continue;
    const measures = row.Measures ? JSON.parse(row.Measures) : {};
    // SỬA LỖI THẬT (bản 11.46, báo cáo người dùng — "Tính tự động" ra 0
    // hết dù mã kho đã khớp đúng 100% qua etl.DiemStkMapping) — domain
    // `doanhthu_chinhanh` lưu measure "doanhThu" chữ "d" THƯỜNG (xem
    // measureColumns ở etl/scripts/seedLdtdHcrcSync.js), KHÔNG PHẢI
    // "DoanhThu" chữ "D" HOA — đọc nhầm khoá JSON khiến luôn ra `undefined`
    // -> về 0. Xem chú thích đầy đủ (lý do 2 domain khác quy ước viết hoa/
    // thường) ở lib/brgWeeklyPostCore.js:fetchStoreWideTotals() bên
    // rp-server, cùng lỗi, cùng đợt sửa.
    const doanhThu = measures.doanhThu || 0;
    revenueByMaDiem.set(maDiem, (revenueByMaDiem.get(maDiem) || 0) + doanhThu);
  }
  return revenueByMaDiem;
}

module.exports = {
  parsePromoCampaignSkuFile, parsePromoCampaignStoreWeightFile,
  upsertPromoCampaignSkus, upsertPromoCampaignStoreWeights,
  buildPromoCampaignSkuTemplate, buildPromoCampaignStoreWeightTemplate,
  buildPromoCampaignSkuExport, buildPromoCampaignStoreWeightExport,
  computeStoreRevenueByMaDiem,
  normalizeApplyScope, APPLY_SCOPE_HOP_LE
};
