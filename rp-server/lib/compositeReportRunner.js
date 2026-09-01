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
//   apiConnectionId, apiTarget, // apiReport/apiRealtime
//   isTarget, targetDomain  // true -> đọc dwh.SalesTargets (lib/salesTargetsReader.js)
// }]
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
//
// Bộ lọc filterValues.eventDate (YYYY-MM-DD) là ngày "hôm nay" của báo cáo
// — mặc định ngày hiện tại của máy chủ nếu không truyền. Các khối
// dateOffsetYears dịch theo đúng ngày này (dương lịch, khớp câu trả lời đã
// chốt — "28/08 <-> 28/08"), khối target tính PeriodMonth = ngày 1 của
// tháng chứa ngày đó.
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
const { evaluateFormula } = require('./formulaEngine');
const { runSalesTargetsBlock } = require('./salesTargetsReader');

function formatDateISO(d) {
  return d.toISOString().slice(0, 10);
}

function shiftYears(dateStr, years) {
  if (!years) return dateStr;
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return formatDateISO(d);
}

function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

async function runBlock(block, requestedEventDate, filterValues) {
  if (block.isTarget) {
    const dwhPool = await getPool('DWH');
    return runSalesTargetsBlock(dwhPool, block.targetDomain, firstOfMonth(requestedEventDate));
  }
  if (block.sourceType === 'directDb') {
    const pool = block.dataSourceId ? await getPoolForDataSource(block.dataSourceId) : await getPool('DWH');
    const eventDate = shiftYears(requestedEventDate, block.dateOffsetYears || 0);
    const blockDefinition = { domain: block.domain, filters: [{ field: 'eventDate' }, ...(block.filters || [])] };
    const blockFilterValues = { ...filterValues, eventDate };
    return runReport(pool, blockDefinition, blockFilterValues, { page: 1, pageSize: 5000 });
  }
  if (block.sourceType === 'apiReport' || block.sourceType === 'apiRealtime') {
    const { rows } = await runApiReport(block, filterValues, { page: 1, pageSize: 5000 });
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

async function runCompositeReport(definition, filterValues = {}) {
  if (!Array.isArray(definition.blocks) || !definition.blocks.length) {
    throw new Error('Báo cáo composite thiếu "blocks"');
  }
  const requestedEventDate = filterValues.eventDate || formatDateISO(new Date());

  // Chạy TẤT CẢ khối song song — Promise.all giữ nguyên đúng thứ tự kết quả
  // theo definition.blocks (không phải thứ tự khối nào resolve trước), nên
  // vòng ghép bên dưới vẫn duyệt đúng thứ tự cấu hình như trước, KHÔNG đổi
  // hành vi merge — chỉ khác ở chỗ mọi khối bắt đầu chạy CÙNG LÚC thay vì
  // đợi khối trước xong mới bắt đầu khối sau.
  const blockRowsList = await Promise.all(
    definition.blocks.map(block => runBlock(block, requestedEventDate, filterValues))
  );

  // Map giữ thứ tự chèn -> thứ tự dòng trả về ổn định, khớp thứ tự khối
  // ĐẦU TIÊN gặp mỗi entityCode (thường là khối "hôm nay").
  const merged = new Map();
  definition.blocks.forEach((block, i) => {
    for (const row of blockRowsList[i]) {
      const entityCode = row.entityCode;
      if (!entityCode) continue;
      if (!merged.has(entityCode)) merged.set(entityCode, { entityCode });
      const target = merged.get(entityCode);
      // Khối trả về >1 dòng cho CÙNG entityCode (vd cấu hình filters của
      // khối lỏng hơn dự kiến, hoặc nguồn có nhiều dòng/thực thể mà báo cáo
      // đang giả định 1 dòng/thực thể) khiến dòng SAU âm thầm ghi đè dòng
      // TRƯỚC — không có lỗi nào ném ra, chỉ số liệu sai lặng lẽ. Cảnh báo
      // ra log để phát hiện sớm, KHÔNG chặn chạy báo cáo (vẫn trả kết quả,
      // dùng dòng cuối cùng gặp — giữ nguyên hành vi cũ).
      if (target[block.key] !== undefined) {
        console.warn(`⚠️  [composite] khối "${block.key}" trả về NHIỀU HƠN 1 dòng cho entityCode "${entityCode}" — chỉ giữ dòng cuối cùng, kiểm tra lại cấu hình filters của khối này`);
      }
      target[block.key] = row;
    }
  });

  // Loại HẲN thực thể có TrangThai='DaDong' ở BẤT KỲ khối target nào (xem
  // etl/lib/salesTargetsImport.js) — CHỈ loại khi có đánh dấu TƯỜNG MINH.
  // Thực thể THIẾU dòng chỉ tiêu (chưa kịp nhập) vẫn phải hiện ra như bình
  // thường — không suy luận "thiếu dòng = đã đóng cửa", tránh mất siêu thị
  // khỏi báo cáo chỉ vì ai đó quên nhập 1 dòng.
  const targetBlockKeys = definition.blocks.filter(b => b.isTarget).map(b => b.key);
  const mergedRows = [...merged.values()].filter(
    r => !targetBlockKeys.some(key => r[key]?.TrangThai === 'DaDong')
  );
  const columns = describeColumns(definition.columns);

  if (!definition.groupBy) {
    return { columns, rows: mergedRows.map(r => projectCompositeRow(r, definition.columns)) };
  }

  const { field, groups = [], grandTotalLabel, labelColumn } = definition.groupBy;
  const groupPath = field.split('.');
  const blockKeys = definition.blocks.map(b => b.key);
  const rows = [];
  const matchedValues = new Set();

  for (const g of groups) {
    matchedValues.add(g.value);
    const groupRows = mergedRows.filter(r => resolveCompositeField(r, groupPath) === g.value);
    if (!groupRows.length) continue;
    rows.push(...groupRows.map(r => projectCompositeRow(r, definition.columns)));
    const subtotalRow = projectCompositeRow(sumMergedRows(groupRows, blockKeys), definition.columns);
    if (labelColumn) subtotalRow[labelColumn] = g.label;
    subtotalRow.__isSubtotal = true;
    rows.push(subtotalRow);
  }
  // Dòng không khớp nhóm nào đã khai (dữ liệu ngoài dự kiến) — vẫn xuất
  // hiện ở cuối, KHÔNG âm thầm mất, để lộ ngay lỗi cấu hình "groups" thiếu.
  const unmatched = mergedRows.filter(r => !matchedValues.has(resolveCompositeField(r, groupPath)));
  rows.push(...unmatched.map(r => projectCompositeRow(r, definition.columns)));

  const grandRow = projectCompositeRow(sumMergedRows(mergedRows, blockKeys), definition.columns);
  if (labelColumn) grandRow[labelColumn] = grandTotalLabel || 'Tổng cộng';
  grandRow.__isSubtotal = true;
  grandRow.__isGrandTotal = true;
  rows.push(grandRow);

  return { columns, rows };
}

module.exports = { runCompositeReport };
