// lib/salesTargetsImport.js — Đọc file Excel chỉ tiêu (target/KPI) admin tải
// lên và ghi vào dwh.SalesTargets (bảng RIÊNG khỏi dwh.ReportFacts — xem
// dwh/schema.sql + dwh/grants.sql). Dùng RIÊNG pool "DWH_TARGET_IMPORTER"
// (KHÔNG dùng pool "DWH"/etl_writer) — xem routes/admin/salesTargets.js.
//
// Định dạng file (.xlsx): dòng 1 là header, 2 cột ĐẦU CỐ ĐỊNH tên
// "MaSieuThi" và "Thang" (dạng YYYY-MM). Các cột SAU tuỳ ý — TÊN CỘT trở
// thành đúng tên khoá trong TargetsJson của dòng đó, không cố định trước
// trong code danh sách chỉ tiêu nào phải có (giống tinh thần Measures của
// dwh.ReportFacts — linh hoạt theo từng báo cáo).
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

const REQUIRED_HEADERS = ['MaSieuThi', 'Thang'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
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

// Chặn sớm file .xlsx có QUÁ NHIỀU dòng — xem chú thích cùng tên trong
// lib/dataSourcesImport.js.
const MAX_IMPORT_ROWS = 5000;

// { rows: [{entityCode, periodMonth: Date, targets: {...}}], rowErrors: string[] }
async function parseSalesTargetsFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new Error(`File có ${sheet.rowCount} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng/lượt nhập — chia nhỏ file rồi nhập nhiều lượt`);
  }

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
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
    if (rowNumber === 1) return;
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

module.exports = { parseSalesTargetsFile, upsertSalesTargets, PERIOD_RE, TRANG_THAI_VALUES };
