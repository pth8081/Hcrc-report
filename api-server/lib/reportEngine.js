// lib/reportEngine.js — Đọc định nghĩa báo cáo (dwh.ReportCatalog) và chạy
// truy vấn tham số hoá trên dwh.ReportFacts. KHÔNG dựng SELECT động theo từng
// cột — luôn lấy nguyên dòng (EntityCode, EventDate, Dimensions, Measures) rồi
// projectColumns() ở tầng JS chọn đúng cột cần trả về theo definition.columns.
//
// definition.columns có 2 dạng phần tử: chuỗi (tên field thô, hành vi cũ) hoặc
// object { key, label, formula } — CỘT TÍNH TOÁN, đánh giá bằng
// lib/formulaEngine.js (bộ đánh giá biểu thức giới hạn, không eval()) SAU khi
// đã có đủ dữ liệu thô của dòng. Đây là nơi công thức nghiệp vụ THẬT SỰ chạy
// khi SourceType='apiReport' (báo cáo đó do api.ReportCatalog định nghĩa) —
// rp-server ở luồng này chỉ forward JSON đã tính sẵn, không tính lại.
//
// Bản sao CÙNG NỘI DUNG cũng có ở rp-server/lib/reportEngine.js — cố ý
// trùng lặp, không dùng chung qua thư mục "shared/", để mỗi server tự chứa đủ
// code khi copy riêng lên máy chủ triển khai (xem tài liệu kiến trúc, mục 08).
const { sql } = require('../db');
const { evaluateFormula } = require('./formulaEngine');

const FIELD_NAME_RE = /^[a-zA-Z0-9_]+$/;

// Field Dimensions nào đã có CỘT TRÍCH XUẤT PERSISTED + INDEX thật trong
// dwh.ReportFacts (xem dwh/schema.sql mục "Tối ưu lọc theo Dimensions") —
// resolveColumn() ưu tiên dùng cột thật (SQL Server seek được qua index)
// thay vì JSON_VALUE(...) (luôn phải quét + parse JSON từng dòng trong
// Domain, không index được). RỖNG mặc định — chỉ thêm dòng ở đây SAU KHI đã
// thực sự chạy ALTER TABLE thêm đúng cột đó trên CSDL thật; một cột
// persisted không ai dùng vẫn tốn chỗ lưu + chi phí tính lại mỗi lần ETL
// upsert, nên KHÔNG thêm "phòng khi cần" — chỉ khi đã xác định rõ 1 báo cáo
// lọc chậm vì field cụ thể nào. Bản sao CÙNG NỘI DUNG cũng có ở
// rp-server/lib/reportEngine.js — sửa cả 2 nơi khi thêm cột mới.
const PERSISTED_DIMENSION_COLUMNS = {
  // deptCode: 'DeptCode', // ví dụ — xem hướng dẫn đầy đủ trong dwh/schema.sql
};

function resolveColumn(field) {
  if (field === 'entityCode') return 'EntityCode';
  if (field === 'eventDate') return 'EventDate';
  if (field === 'sourceSystem') return 'SourceSystem';
  if (PERSISTED_DIMENSION_COLUMNS[field]) return `[${PERSISTED_DIMENSION_COLUMNS[field]}]`;
  if (!FIELD_NAME_RE.test(field)) {
    throw new Error(`Tên field không hợp lệ trong định nghĩa báo cáo: "${field}"`);
  }
  // RTRIM (bản 10.67, SỬA LỖI THẬT — đối tác "ton-kho" báo mã Điểm luôn
  // null dù "Ánh xạ Điểm - STK_ID" đã khai đúng, kiểm tra log thật cho
  // thấy field `MaChiNhanh` (nguồn `STK_ID AS MaChiNhanh` trong
  // "bc-ton-kho-0.md" — STK_ID là CHAR CÓ ĐỘ DÀI CỐ ĐỊNH ở DSMART16, không
  // RTRIM khi SELECT) mang theo DẤU CÁCH THỪA phía sau khi lưu vào
  // Dimensions JSON, trong khi giá trị STK_ID admin gõ tay vào "Ánh xạ
  // Điểm - STK_ID" (etl.DiemStkMapping.MaStkMoi) KHÔNG có dấu cách thừa —
  // so khớp (`stkLookup.get()` ở routes/v1/reports.js, VÀ điều kiện
  // forcedConditions ở đây) LUÔN trượt. RTRIM ở ĐÂY xử lý ĐƯỢC NGAY cho
  // mọi dữ liệu ĐÃ đồng bộ (không cần resync lại), nhưng gốc rễ vẫn nên
  // sửa VIEW nguồn (`RTRIM(STK_ID) AS MaChiNhanh`) khi DBA rảnh — xem
  // "bc-ton-kho-0.md"/"bc-ton-kho-chi-tiet.md".
  return `RTRIM(JSON_VALUE(Dimensions, '$.${field}'))`;
}

function parseRow(row) {
  return {
    id: row.Id,
    sourceSystem: row.SourceSystem,
    entityCode: row.EntityCode,
    eventDate: row.EventDate,
    dimensions: JSON.parse(row.Dimensions || '{}'),
    measures: row.Measures ? JSON.parse(row.Measures) : {},
    syncedAt: row.SyncedAt
  };
}

// Cách đọc field TỪ DÒNG DỮ LIỆU ĐÃ LẤY VỀ (khác resolveColumn — đó là đọc
// field để dựng SQL) — dùng chung cho cột thường (chuỗi) lẫn công thức.
function resolveField(row, path) {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    if (head === 'entityCode') return row.entityCode;
    if (head === 'eventDate') return row.eventDate;
    if (head === 'sourceSystem') return row.sourceSystem;
    // syncedAt (bản 10.46, theo yêu cầu người dùng — API Tồn kho cho đối
    // tác cần hiện "Tồn kho cập nhật lúc HH:mm") — cột hệ thống ĐÃ CÓ SẴN
    // trên mọi dòng (parseRow() đã gán), chỉ CHƯA từng expose được qua
    // columns/formula trước bản này. Thuần tuý ĐỌC THÊM, không đổi hành vi
    // field nào khác. Mirror đúng rp-server/lib/reportEngine.js.
    if (head === 'syncedAt') return row.syncedAt;
    return row.dimensions ? row.dimensions[head] : undefined;
  }
  if (head === 'measures' && rest.length === 1) return row.measures ? row.measures[rest[0]] : undefined;
  throw new Error(`Đường dẫn field không hợp lệ: "${path.join('.')}"`);
}

function projectColumns(row, columns) {
  const out = {};
  for (const col of columns) {
    if (col && typeof col === 'object' && col.formula) {
      out[col.key] = evaluateFormula(col.formula, (path) => resolveField(row, path));
      continue;
    }
    if (col === 'entityCode') out[col] = row.entityCode;
    else if (col === 'eventDate') out[col] = row.eventDate;
    else if (col === 'sourceSystem') out[col] = row.sourceSystem;
    else if (col === 'syncedAt') out[col] = row.syncedAt; // bản 10.46, xem resolveField()
    else if (col.startsWith('measures.')) out[col] = row.measures[col.slice('measures.'.length)];
    else out[col] = row.dimensions[col];
  }
  return out;
}

// Chuẩn hoá definition.columns (chuỗi HOẶC object công thức) thành
// [{key, label}] — hình dạng DUY NHẤT trả về cho bên gọi (hệ ngoài qua API
// key, hoặc rp-server khi SourceType='apiReport'), để nơi hiển thị không cần
// biết cột nào là field thô hay cột tính toán.
function describeColumns(columns) {
  return columns.map(col => (
    col && typeof col === 'object'
      ? { key: col.key, label: col.label || col.key }
      : { key: col, label: col }
  ));
}

// forcedConditions (bản 10.54, theo yêu cầu người dùng — đối tác CHỈ được
// lấy tồn kho của NHỮNG SIÊU THỊ cụ thể, xem api.ConsumerStoreAccess) —
// [{ field, values: [...] }], ÁP DỤNG BẮT BUỘC, HOÀN TOÀN TÁCH BIỆT khỏi
// `filterValues`/`definition.filters` ở trên. KHÔNG được gộp chung cơ chế
// với `filterValues` — nhánh đó dựng TỪ `req.query` (xem routes/v1/
// reports.js), nếu forcedConditions cũng đi qua field do CLIENT khai trong
// `definition.filters` thì 1 đối tác tò mò có thể tự truyền `?<field>=...`
// GHI ĐÈ đúng field đó, VÔ HIỆU HOÁ giới hạn siêu thị — forcedConditions
// CHẠY RIÊNG, route gọi KHÔNG lấy field/values này từ bất kỳ input nào của
// client, luôn tự tính từ CSDL (api.ConsumerStoreAccess + "Ánh xạ Điểm -
// STK_ID") ở tầng server. values RỖNG (đối tác bị giới hạn nhưng danh sách
// siêu thị KHÔNG dịch ra được mã kho thật nào) -> ép `1 = 0` (không dòng
// nào khớp), KHÔNG được bỏ qua điều kiện (bỏ qua = coi như KHÔNG giới hạn,
// sai hẳn ý "giới hạn nhưng rỗng").
// latestEventDateOnly (bản 10.60, theo sự cố thật — đối tác gọi API "Tồn
// kho toàn hệ thống" (ton-kho) báo "Failed to fetch"/HTTP 500, đo được qua
// api-admin "Lịch sử" mỗi lần gọi mất 7-16 GIÂY, có lần vượt timeout SQL
// 15s (api-server/db.js REQUEST_TIMEOUT_MS) -> 500. Nguyên nhân: domain
// `tonkho_chitiet_sku` GIỮ LỊCH SỬ MỖI NGÀY, 5-11 TRIỆU dòng (xem
// dwh/schema.sql/bc-core-ton-kho-0.md — ĐÚNG domain từng gây sự cố thật
// tương tự ở bản 9.87, lúc đó là báo cáo NỘI BỘ, lần này là API đối tác),
// nhưng definition CŨ không giới hạn EventDate — ORDER BY EventDate DESC,
// Id DESC + OFFSET/FETCH phải cân nhắc XUYÊN SUỐT lịch sử nhiều ngày của
// domain mỗi lần gọi dù nghiệp vụ "tồn kho LIVE" chỉ cần ĐÚNG 1 NGÀY gần
// nhất. Cờ này (definition.latestEventDateOnly=true, xem
// scripts/seedTonKhoReport.js) thu hẹp WHERE về đúng ngày đồng bộ gần nhất
// của domain đó — seek qua ĐÚNG index đã có sẵn (IX_ReportFacts_Domain_Date
// trên (Domain, EventDate DESC)), KHÔNG cần tạo index mới. Mặc định
// false/không khai — KHÔNG đổi hành vi báo cáo nào khác đang chạy ổn định
// (báo cáo nào thật sự cần đọc nhiều ngày, vd xuất lịch sử, KHÔNG được bật
// cờ này).
async function runReport(pool, definition, filterValues = {}, { page = 1, pageSize = 200 } = {}, forcedConditions = []) {
  const request = pool.request();
  const conditions = ['Domain = @domain'];
  request.input('domain', sql.VarChar(50), definition.domain);

  if (definition.latestEventDateOnly) {
    conditions.push('EventDate = (SELECT MAX(EventDate) FROM dwh.ReportFacts WHERE Domain = @domain)');
  }

  forcedConditions.forEach((fc, idx) => {
    const column = resolveColumn(fc.field);
    if (!fc.values || !fc.values.length) {
      conditions.push('1 = 0');
      return;
    }
    const paramNames = fc.values.map((v, i) => {
      const name = `forced${idx}_${i}`;
      request.input(name, sql.NVarChar(200), String(v));
      return `@${name}`;
    });
    conditions.push(`${column} IN (${paramNames.join(', ')})`);
  });

  (definition.filters || []).forEach((filterDef, idx) => {
    const value = filterValues[filterDef.field];
    if (value === undefined || value === null || value === '') return;
    const column = resolveColumn(filterDef.field);
    const p = `f${idx}`;

    if (filterDef.type === 'dateRange') {
      if (value.from) {
        request.input(`${p}From`, sql.Date, value.from);
        conditions.push(`${column} >= @${p}From`);
      }
      if (value.to) {
        request.input(`${p}To`, sql.Date, value.to);
        conditions.push(`${column} <= @${p}To`);
      }
    } else if (filterDef.type === 'multiSelect' && Array.isArray(value) && value.length) {
      const paramNames = value.map((v, i) => {
        const name = `${p}_${i}`;
        request.input(name, sql.NVarChar(200), String(v));
        return `@${name}`;
      });
      conditions.push(`${column} IN (${paramNames.join(', ')})`);
    } else {
      request.input(p, sql.NVarChar(200), String(value));
      conditions.push(`${column} = @${p}`);
    }
  });

  const offset = Math.max(0, (page - 1) * pageSize);
  request.input('offset', sql.Int, offset);
  request.input('pageSize', sql.Int, pageSize);

  const result = await request.query(`
    SELECT Id, SourceSystem, EntityCode, EventDate, Dimensions, Measures, SyncedAt
    FROM dwh.ReportFacts
    WHERE ${conditions.join(' AND ')}
    ORDER BY EventDate DESC, Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return result.recordset.map(parseRow);
}

module.exports = { runReport, projectColumns, describeColumns };
