// routes/v1/reports.js — Báo cáo tổng hợp, đọc từ Data Warehouse (KHÔNG
// realtime — độ trễ bằng độ trễ ETL, xem tài liệu kiến trúc). Trả JSON,
// không xuất file — bên gọi tự xử lý theo nhu cầu.
//
// ĐỊNH NGHĨA báo cáo (bộ lọc/cột) đọc từ api.ReportCatalog (CSDL HCRC_API,
// pool ADMIN) — CSDL RIÊNG của API Server, KHÔNG phải app.ReportCatalog bên
// HCRC_RP: API Server không đọc được CSDL của Report Server (cô lập DB), và
// 2 hệ này tự quyết định độc lập báo cáo nào của mình cần lộ ra. Dữ liệu
// THẬT (dwh.ReportFacts) vẫn đọc qua pool DWH.
//
// Endpoint này phục vụ CẢ hệ thống ngoài lẫn rp-server (Report Server) khi
// một báo cáo của rp-server cấu hình SourceType='apiReport' — cùng 1 đường,
// phân biệt bằng scope của API key (xem lib/apiAuth.js).
//
// 3 lớp tuỳ biến CHO TỪNG ĐỐI TÁC (không đổi được nhau, bổ sung nhau):
//   - api.ConsumerReportAccess — ai được gọi report nào (mặc định KHÔNG được
//     gọi report nào cho tới khi admin gán rõ ràng qua api-admin/, xem
//     routes/admin/consumers.js).
//   - api.ConsumerStoreAccess (bản 10.54) — CHỈ áp dụng cho report có khai
//     `translateStkToStore` (có khái niệm "siêu thị") — đối tác được gọi
//     report rồi CÒN bị giới hạn CHỈ thấy đúng những siêu thị nào (mặc định
//     NGƯỢC LẠI 2 lớp còn lại: rỗng = KHÔNG giới hạn/thấy TOÀN BỘ, xem
//     api-db/schema.sql — lý do khác nhau vì đây là ràng buộc THÊM lên 1
//     tính năng đã chạy thật, không phải gate 1 tính năng mới).
//   - ?fields=a,b,c — trong report họ ĐƯỢC gọi, chỉ lấy đúng cột cần, không
//     bắt phải nhận hết cột đã định nghĩa. Xin cột không có trong định nghĩa
//     -> 400 rõ ràng, không âm thầm bỏ qua.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireApiKey } = require('../../lib/apiAuth');
const { runReport, projectColumns, describeColumns } = require('../../lib/reportEngine');
const reportResultCache = require('../../lib/reportResultCache');
const { loadDiemStkMapping } = require('../../lib/diemStkMapping');
const { loadZoneLookup } = require('../../lib/zoneLookup');
const { loadBarcodeLookup, loadAltBarcodesBySku } = require('../../lib/barcodeLookup');

const router = express.Router();
router.use(requireApiKey('reports'));

// singleLookup (bản 10.71+, theo yêu cầu người dùng — API "Giá bán" tra
// ĐÚNG 1 mã hàng tại ĐÚNG 1 siêu thị mỗi lần quét, KHÔNG phân trang/tải
// trọn gói như "ton-kho" — xem "api-gia-ban-cho-doi-tac.md") — HOÀN TOÀN
// TÁCH RIÊNG khỏi nhánh phân trang bên dưới (không dùng chung
// definition.filters/forcedConditions/translateStkToStore, để không đụng
// hành vi của các báo cáo khác đang chạy ổn định). `definition.singleLookup`
// = { maHangField, zoneField } — tên field THÔ trong Dimensions JSON
// (khác `columns[].key`, giống quy ước rawStkField ở translateStkToStore).
//
// maHang HOẶC maVach (bản 10.72/10.75) — CHO PHÉP tra bằng BẤT KỲ cái nào
// app đang có trong tay. SỬA bản 10.75, SỬA LỖI THẬT: trước đây `maVach`
// được khớp TRỰC TIẾP trên domain `giaban_zone_sku` — domain đó chỉ mang
// ĐÚNG 1 mã vạch MẶC ĐỊNH mỗi SKU (từ `SKU_DEF.BARCODE`), trong khi 1 mã
// hàng THẬT có thể có 2-3 mã vạch đăng ký trong `dbo.BARCODE` (xác nhận
// bằng dữ liệu thật — đối tác quét đúng 1 mã vạch PHỤ hợp lệ vẫn bị báo
// "Không tìm thấy giá"). SỬA: dịch `maVach` -> `maHang` TRƯỚC qua domain
// RIÊNG `mavach_mahang` (mang ĐỦ mọi mã vạch, xem lib/barcodeLookup.js),
// rồi LUÔN tra theo `maHang` ở domain giá — không còn khớp trực tiếp
// `maVach` trên domain giá nữa.
//
// SỬA bản 10.77, theo yêu cầu người dùng ("tra bằng mã hàng, mã barcode,
// mã vạch đều phải ra giá") — SỬA LỖI THẬT: app "Giỏ hàng" (BRG Scan and
// Checkout) báo "chưa có giá" cho 5 mã dạng "200xxxxxxx" — xác nhận bằng
// dữ liệu thật CẢ 5 mã đều LÀ MÃ HÀNG THẬT, có giá đầy đủ ở MỌI vùng giá
// trên DSMART16 — không thiếu giá, chỉ do app gửi các mã này lên dưới tham
// số `maVach` (không phải `maHang`) nên `loadBarcodeLookup()` không dịch
// được (giá trị đó không phải mã vạch đăng ký trong dbo.BARCODE). THÊM lớp
// dự phòng: khi `maVach` KHÔNG khớp được mã vạch nào, THỬ LẠI coi nguyên
// giá trị đó NHƯ 1 `maHang` trước khi báo lỗi — đối tác gọi đúng HAY nhầm
// loại tham số vẫn ra giá như nhau, không cần tự phân biệt mã hàng/mã vạch.
async function handleSingleLookup(req, res, definition, columns) {
  let maHang = req.query.maHang;
  const maVach = req.query.maVach;
  const maDiem = req.query.maDiem;
  const inputLabel = maHang ? 'mã hàng' : 'mã vạch'; // nhãn lỗi theo ĐÚNG tham số đối tác đã gửi lên, không đổi sau khi dịch maVach -> maHang bên dưới
  if (!maDiem || (!maHang && !maVach)) {
    return res.status(400).json({ error: 'Thiếu tham số bắt buộc: maDiem, và ít nhất 1 trong 2 tham số maHang hoặc maVach' });
  }

  if (!maHang) {
    const barcodeLookup = await loadBarcodeLookup();
    // Không khớp được mã vạch nào -> THỬ LẠI coi nguyên giá trị như 1
    // maHang (bản 10.77, xem chú thích đầy đủ ở trên hàm) — nếu maHang đó
    // cũng không tồn tại, nhánh tra giá bên dưới vẫn báo lỗi 404 "Không tìm
    // thấy giá..." như cũ, không im lặng bỏ qua lỗi thật.
    maHang = barcodeLookup.get(maVach) || maVach;
  }

  const diemMapping = await loadDiemStkMapping();
  const diemInfo = diemMapping.get(maDiem);
  if (!diemInfo || !diemInfo.maStkMoi.length) {
    return res.status(404).json({ error: `Không tìm thấy siêu thị với mã Điểm "${maDiem}"` });
  }

  const zoneLookup = await loadZoneLookup();
  const zones = [...new Set(diemInfo.maStkMoi.map(stk => zoneLookup.get(stk)).filter(Boolean))];
  if (!zones.length) {
    return res.status(404).json({ error: `Chưa xác định được vùng giá cho siêu thị với mã Điểm "${maDiem}" — kiểm tra lại job đồng bộ "Vùng giá theo siêu thị"` });
  }

  const t = definition.singleLookup;
  const matchField = t.maHangField;
  const matchValue = maHang;

  const cacheKey = ['gia-ban-singleLookup', req.params.reportId, matchField, matchValue, zones.sort(), req.query.fields || ''];
  let payload = reportResultCache.get(cacheKey);
  if (!payload) {
    const dwhPool = await getPool('DWH');
    const request = dwhPool.request().input('domain', sql.VarChar(50), definition.domain).input('matchValue', sql.NVarChar(200), matchValue);
    const zoneParams = zones.map((z, i) => { request.input(`zone${i}`, sql.NVarChar(50), z); return `@zone${i}`; });
    const result = await request.query(`
      SELECT TOP 1 Id, SourceSystem, EntityCode, EventDate, Dimensions, Measures, SyncedAt
      FROM dwh.ReportFacts
      WHERE Domain = @domain
        AND RTRIM(JSON_VALUE(Dimensions, '$.${matchField}')) = @matchValue
        AND RTRIM(JSON_VALUE(Dimensions, '$.${t.zoneField}')) IN (${zoneParams.join(', ')})
      ORDER BY EventDate DESC, Id DESC
    `);
    if (!result.recordset.length) {
      return res.status(404).json({ error: `Không tìm thấy giá cho ${inputLabel} "${maVach || matchValue}" ở vùng giá của siêu thị "${maDiem}"` });
    }
    const row = { id: result.recordset[0].Id, sourceSystem: result.recordset[0].SourceSystem, entityCode: result.recordset[0].EntityCode, eventDate: result.recordset[0].EventDate, dimensions: JSON.parse(result.recordset[0].Dimensions || '{}'), measures: result.recordset[0].Measures ? JSON.parse(result.recordset[0].Measures) : {}, syncedAt: result.recordset[0].SyncedAt };
    payload = { reportId: req.params.reportId, ...projectColumns(row, columns) };

    // attachAltBarcodes (bản 10.78, theo yêu cầu người dùng — "gửi cả 3 mã
    // để app xử lý được") — ÁP DỤNG TƯƠNG TỰ nhánh phân trang (xem chú
    // thích đầy đủ ở router.get('/:reportId/run') bên dưới): app đối tác
    // (vd "Giỏ hàng"/BRG Scan and Checkout) tự lưu/đối chiếu dữ liệu phía
    // họ, cần ĐỦ cả 3: `maHang`, `maVach` (mặc định), VÀ `dsMaVach` (TOÀN
    // BỘ mã vạch) để không lặp lại đúng lớp lỗi đã gặp ở "Tồn kho" (bản
    // 10.76) — chỉ gắn thêm khi definition khai rõ VÀ cột đó được xin qua
    // ?fields=, dùng CHUNG domain mavach_mahang, không ảnh hưởng gì khác.
    const altB = definition.attachAltBarcodes;
    if (altB) {
      const requestedKeys = new Set(columns.map(c => (c && typeof c === 'object' ? c.key : c)));
      if (requestedKeys.has(altB.targetField)) {
        const bySku = await loadAltBarcodesBySku();
        let allBarcodes = bySku.get(maHang) || [];
        if (!allBarcodes.length && payload[altB.fallbackVachField]) allBarcodes = [payload[altB.fallbackVachField]];
        payload[altB.targetField] = allBarcodes;
      }
    }

    reportResultCache.set(cacheKey, payload);
  }
  res.json(payload);
}

async function assertConsumerCanAccessReport(consumerId, reportId) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request()
    .input('consumerId', sql.Int, consumerId)
    .input('reportId', sql.VarChar(80), reportId)
    .query('SELECT 1 FROM api.ConsumerReportAccess WHERE ConsumerId = @consumerId AND ReportId = @reportId');
  return result.recordset.length > 0;
}

// Rút gọn definition.columns theo ?fields= — validate TRƯỚC khi chạy query,
// để 1 field sai tên báo lỗi rõ ràng thay vì âm thầm trả thiếu cột.
function filterColumnsByFields(columns, fieldsParam) {
  if (!fieldsParam) return { columns, error: null };
  const requested = fieldsParam.split(',').map(f => f.trim()).filter(Boolean);
  const byKey = new Map(columns.map(col => [col && typeof col === 'object' ? col.key : col, col]));
  const missing = requested.filter(f => !byKey.has(f));
  if (missing.length) {
    return { columns: null, error: `Không có cột: ${missing.join(', ')} — xem GET /api/v1/reports/:reportId trước khi gọi run` };
  }
  return { columns: requested.map(f => byKey.get(f)), error: null };
}

router.get('/:reportId/run', async (req, res, next) => {
  try {
    // Kiểm tra QUYỀN TRƯỚC, tồn tại SAU (giống hệt routes/v1/realtime.js) —
    // đảo ngược thứ tự cũ (tồn tại trước, quyền sau) khiến bất kỳ đối tác
    // nào có scope 'reports' (dù ConsumerReportAccess rỗng, chưa được cấp
    // báo cáo nào) đều dò được TOÀN BỘ danh mục ReportId nội bộ bằng cách
    // thử lần lượt và phân biệt 404 (không tồn tại) với 403 (tồn tại nhưng
    // không có quyền) — không cần được cấp quyền gì. Giờ luôn 403 khi chưa
    // được cấp quyền, bất kể report có tồn tại hay không.
    if (!(await assertConsumerCanAccessReport(req.consumer.id, req.params.reportId))) {
      return res.status(403).json({ error: 'Đối tác chưa được cấp quyền gọi báo cáo này' });
    }

    const adminPool = await getPool('ADMIN');
    const catalog = await adminPool.request()
      .input('reportId', sql.VarChar(80), req.params.reportId)
      .query('SELECT DefinitionJson, IsActive FROM api.ReportCatalog WHERE ReportId = @reportId');
    if (!catalog.recordset.length || !catalog.recordset[0].IsActive) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }

    const definition = JSON.parse(catalog.recordset[0].DefinitionJson);

    const { columns, error } = filterColumnsByFields(definition.columns, req.query.fields);
    if (error) return res.status(400).json({ error });

    if (definition.singleLookup) {
      return handleSingleLookup(req, res, definition, columns);
    }

    // parseInt(...) || fallback (không phải "|| '1'" TRƯỚC KHI parseInt) —
    // giá trị không phải số (vd "abc") cho NaN, "NaN || fallback" mới đúng
    // rơi về fallback; nếu "|| '1'" áp TRƯỚC thì parseInt('abc') vẫn ra NaN
    // (chuỗi rỗng/undefined mới dùng được default kiểu đó). Math.max(1, ...)
    // chặn luôn giá trị âm/0.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 200), 1000);

    const filters = {};
    for (const f of definition.filters || []) {
      if (req.query[f.field] !== undefined) filters[f.field] = req.query[f.field];
    }

    // api.ConsumerStoreAccess (bản 10.54, theo yêu cầu người dùng — "tôi
    // muốn đối tác chỉ được lấy một tồn kho của một siêu thị") — CHỈ áp
    // dụng cho báo cáo có khai `translateStkToStore` (có khái niệm "siêu
    // thị" — hiện là "ton-kho"). Tính TRƯỚC khi gọi runReport() — PHẢI lọc
    // NGAY TRONG SQL (forcedConditions, xem lib/reportEngine.js), KHÔNG lọc
    // SAU khi đã phân trang, nếu không 1 trang có thể ra ÍT HƠN pageSize dù
    // CÒN dữ liệu ở trang sau (đối tác hiểu lầm là đã hết, dừng gọi tiếp
    // sớm, thiếu dữ liệu mà không biết).
    const t = definition.translateStkToStore;
    let diemMapping = null; // tái dùng cho CẢ forcedConditions lẫn dịch nhãn maDiem/tenSieuThi bên dưới — chỉ đọc "Ánh xạ Điểm - STK_ID" ĐÚNG 1 LẦN/request
    let forcedConditions = [];
    let storeScopeCacheKeyPart = null; // chỉ khác null khi ĐANG bị giới hạn — xem cacheKey bên dưới
    if (t) {
      const storeAccess = await adminPool.request().input('consumerId', sql.Int, req.consumer.id)
        .query('SELECT MaDiem FROM api.ConsumerStoreAccess WHERE ConsumerId = @consumerId');
      if (storeAccess.recordset.length) {
        const { loadDiemStkMapping } = require('../../lib/diemStkMapping');
        diemMapping = await loadDiemStkMapping();
        const maDiemList = storeAccess.recordset.map(r => r.MaDiem).sort();
        const stkIds = [];
        for (const maDiem of maDiemList) {
          const info = diemMapping.get(maDiem);
          if (info) stkIds.push(...info.maStkMoi);
        }
        forcedConditions = [{ field: t.rawStkField, values: stkIds }];
        storeScopeCacheKeyPart = maDiemList; // đã sort() ở trên — khoá cache ổn định bất kể thứ tự ghi trong CSDL
      }
    }

    // Cache TTL ngắn (lib/reportResultCache.js) — đối tác/hệ thống ngoài
    // thường gọi lại CÙNG báo cáo + CÙNG tham số nhiều lần liên tiếp (polling
    // định kỳ, dashboard), không cần chạy lại truy vấn dwh.ReportFacts mỗi
    // lần. Khoá cache gồm cả `fields` (cột yêu cầu) — khác cột trả về khác
    // response, không được dùng chung. `storeScopeCacheKeyPart` (bản 10.54)
    // — BẮT BUỘC đưa vào khoá khi báo cáo có giới hạn siêu thị theo đối
    // tác (khác NULL) — nếu không, đối tác A (bị giới hạn) và đối tác B
    // (không giới hạn, hoặc giới hạn khác) gọi CÙNG reportId/filters/trang
    // có thể ĐỌC NHẦM kết quả đã cache của nhau (rò rỉ dữ liệu siêu thị
    // ngoài phạm vi được cấp) — cache này vốn dùng CHUNG cho mọi đối tác
    // (xem lib/reportResultCache.js), chỉ an toàn khi kết quả KHÔNG phụ
    // thuộc danh tính đối tác, điều đó KHÔNG còn đúng với báo cáo loại này.
    const cacheKey = [req.params.reportId, filters, page, pageSize, req.query.fields || '', storeScopeCacheKeyPart];
    let payload = reportResultCache.get(cacheKey);
    if (!payload) {
      const dwhPool = await getPool('DWH');
      const rows = await runReport(dwhPool, definition, filters, { page, pageSize }, forcedConditions);
      let projected = rows.map(r => projectColumns(r, columns));
      // translateStkToStore (bản 10.46, theo yêu cầu người dùng — API "Tồn
      // kho" cho đối tác cần tên siêu thị CHUẨN, không phải tên kho gốc
      // DSMART/mã kho trần) — TUỲ CHỌN, CHỈ áp dụng khi definition khai rõ
      // (vd báo cáo "ton-kho"), KHÔNG ảnh hưởng báo cáo khác. Dịch SAU KHI
      // đã projectColumns (cần giá trị maKho THẬT của từng dòng để tra) —
      // cột đích (vd "maDiem"/"tenSieuThi") PHẢI khai formula trỏ tạm vào
      // đúng field nguồn trong definition.columns (projectColumns() yêu
      // cầu MỌI cột object phải có formula — xem lib/reportEngine.js), giá
      // trị đó bị GHI ĐÈ ở đây. Bỏ qua nếu cột đích bị loại bởi ?fields=
      // (đối tác không xin thì không cần tính).
      if (t) {
        const requestedKeys = new Set(columns.map(c => (c && typeof c === 'object' ? c.key : c)));
        if (requestedKeys.has(t.maDiemField) || requestedKeys.has(t.tenField)) {
          const { loadDiemStkMapping, buildStkIdLookup } = require('../../lib/diemStkMapping');
          if (!diemMapping) diemMapping = await loadDiemStkMapping(); // có thể đã đọc sẵn ở nhánh forcedConditions phía trên, không đọc lại
          const stkLookup = buildStkIdLookup(diemMapping);
          projected = projected.map((row) => {
            // .trim() (bản 10.67, SỬA LỖI THẬT — xem chú thích đầy đủ ở
            // lib/reportEngine.js:resolveColumn()) — `row[t.stkField]`
            // (maKho) đọc THẲNG từ Dimensions JSON, có thể mang dấu cách
            // thừa phía sau (STK_ID là CHAR cố định độ dài ở nguồn DSMART16)
            // trong khi khoá trong `stkLookup` (từ "Ánh xạ Điểm - STK_ID",
            // đã .trim() ở lib/diemStkMapping.js:parseStkList()) thì KHÔNG
            // — thiếu .trim() ở đây khiến MỌI dòng không khớp được, dù ánh
            // xạ đã khai đúng (đối tác xác nhận quét 835.111 dòng, 0 dòng
            // khớp). Gán lại vào `out[t.stkField]` LUÔN (không chỉ dùng để
            // tra) để chính cột "maKho" trả về cho đối tác cũng sạch dấu
            // cách thừa.
            const stkRaw = typeof row[t.stkField] === 'string' ? row[t.stkField].trim() : row[t.stkField];
            const info = stkLookup.get(stkRaw);
            const out = { ...row, [t.stkField]: stkRaw };
            if (requestedKeys.has(t.maDiemField)) out[t.maDiemField] = info ? info.maDiem : null;
            if (requestedKeys.has(t.tenField)) out[t.tenField] = (info && info.tenSieuThi) || `${stkRaw} (chưa khai tên)`;
            return out;
          });
        }
      }
      // attachAltBarcodes (bản 10.76, theo yêu cầu người dùng — SỬA LỖI
      // THẬT: màn "Ghi Nhận" HCRC Workspace đối chiếu mã vạch quét dựa trên
      // dữ liệu API "Tồn kho", vốn chỉ có 1 mã vạch MẶC ĐỊNH/mã hàng, trong
      // khi 1 mã hàng có thể có 2-3 mã vạch đăng ký thật trong
      // `dbo.BARCODE` — quét đúng mã vạch PHỤ bị báo sai "không khớp", GIỐNG
      // ĐÚNG lỗi đã sửa cho API "Giá bán" ở bản 10.75) — TUỲ CHỌN, CHỈ áp
      // dụng khi definition khai rõ (vd báo cáo "ton-kho"). Bỏ qua nếu cột
      // đích bị loại bởi ?fields= (đối tác không xin thì không cần tính).
      const altB = definition.attachAltBarcodes;
      if (altB) {
        const requestedKeys = new Set(columns.map(c => (c && typeof c === 'object' ? c.key : c)));
        if (requestedKeys.has(altB.targetField)) {
          const bySku = await loadAltBarcodesBySku();
          projected = projected.map((row) => {
            const maHang = row[altB.maHangField];
            let allBarcodes = (maHang && bySku.get(maHang)) || [];
            if (!allBarcodes.length && row[altB.fallbackVachField]) allBarcodes = [row[altB.fallbackVachField]];
            return { ...row, [altB.targetField]: allBarcodes };
          });
        }
      }

      payload = {
        reportId: req.params.reportId,
        page,
        pageSize,
        columns: describeColumns(columns),
        rows: projected
      };
      reportResultCache.set(cacheKey, payload);
    }
    res.json(payload);
  } catch (err) { next(err); }
});

module.exports = router;
