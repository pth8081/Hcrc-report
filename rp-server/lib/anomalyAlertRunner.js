// lib/anomalyAlertRunner.js — So sánh kỳ hiện tại vs kỳ so sánh của MỘT báo
// cáo đã có (app.ReportCatalog), theo từng "thực thể" (EntityColumnKey) trên
// 1 cột số (MetricColumnKey) — lệch quá ThresholdPercent thì coi là bất
// thường. Chạy LẠI đúng báo cáo đó 2 lần (lib/reportRunner.js — dùng chung
// logic với rp-user/lịch gửi email, không viết lại), chỉ khác {from,to} của
// ĐÚNG 1 field lọc kiểu 'dateRangePreset' trong FilterValuesJson (xem
// lib/reportEmailFilters.js) — các field lọc khác (cố định) giữ nguyên cho
// cả 2 lần chạy.
const { loadDefinition, runDefinition } = require('./reportRunner');
const { resolvePreset } = require('./reportEmailFilters');

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Kỳ so sánh TỪ kỳ hiện tại đã tính (không tính lại preset gốc).
// 'previousPeriod' — cùng ĐỘ DÀI ngày, liền ngay TRƯỚC kỳ hiện tại.
// 'samePeriodLastYear' — lùi đúng 1 năm dương lịch (giữ nguyên ngày/tháng).
function resolveComparisonRange(range, mode) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  if (mode === 'samePeriodLastYear') {
    const f = new Date(from); f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to); t.setFullYear(t.getFullYear() - 1);
    return { from: toDateStr(f), to: toDateStr(t) };
  }
  const lengthDays = Math.round((to - from) / 86400000) + 1;
  const newTo = new Date(from); newTo.setDate(newTo.getDate() - 1);
  const newFrom = new Date(newTo); newFrom.setDate(newFrom.getDate() - lengthDays + 1);
  return { from: toDateStr(newFrom), to: toDateStr(newTo) };
}

// filterValuesJson: CHUỖI JSON đúng khuôn app.ReportEmailSchedules.FilterValuesJson
// { field: {kind:'dateRangePreset',preset} | {kind:'fixed',value} } — TÌM
// đúng 1 field 'dateRangePreset' làm "kỳ hiện tại", còn lại (nếu có) coi là
// lọc cố định, áp y hệt cho cả 2 lần chạy. KHÔNG có field nào -> lỗi rõ ràng
// (báo cáo phải có đúng 1 bộ lọc khoảng ngày mới dùng được tính năng này).
function resolvePeriods(filterValuesJson, filters) {
  const config = filterValuesJson ? JSON.parse(filterValuesJson) : {};
  const dateField = Object.keys(config).find(k => config[k]?.kind === 'dateRangePreset');
  if (!dateField) {
    throw new Error('Cảnh báo bất thường cần đúng 1 bộ lọc khoảng ngày dùng preset tương đối (vd "Hôm qua"/"7 ngày gần nhất") — chưa cấu hình');
  }
  const currentRange = resolvePreset(config[dateField].preset);

  const fixedValues = {};
  for (const filterDef of filters) {
    const entry = config[filterDef.field];
    if (!entry || filterDef.field === dateField) continue;
    if (entry.kind === 'fixed' && entry.value !== '' && entry.value != null) {
      fixedValues[filterDef.field] = filterDef.type === 'multiSelect'
        ? String(entry.value).split(',').map(v => v.trim()).filter(Boolean)
        : entry.value;
    }
  }
  return { dateField, currentRange, fixedValues };
}

function numberOf(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Trả { definitionTitle, currentRange, baselineRange, compared, anomalies }.
// compared: MỌI thực thể xuất hiện ở ít nhất 1 trong 2 kỳ, dạng
// {Entity, GiaTriKyNay, GiaTriKySoSanh, ChenhLechPhanTram, GhiChu}. Thực thể
// không có ở 1 trong 2 kỳ -> coi giá trị bên thiếu là 0 (mới phát sinh/mất
// hẳn), ChenhLechPhanTram cố định ±100 (luôn vượt ngưỡng — không tính % thật
// với mẫu số 0), có GhiChu giải thích. anomalies: lọc lại compared, CHỈ dòng
// |ChenhLechPhanTram| >= ThresholdPercent, sắp xếp lệch nhiều nhất lên đầu.
// Dòng "Tổng cộng" (composite report, row.__isSubtotal) bị loại — không phải
// 1 thực thể thật, so sánh sẽ sai nghĩa.
async function runAnomalyCheck(alert) {
  const definition = await loadDefinition(alert.ReportId);
  if (!definition || !definition.isActive) {
    throw new Error(`Báo cáo "${alert.ReportId}" không còn tồn tại hoặc đã tắt`);
  }
  const { dateField, currentRange, fixedValues } = resolvePeriods(alert.FilterValuesJson, definition.filters || []);
  const baselineRange = resolveComparisonRange(currentRange, alert.CompareMode);

  const currentValues = { ...fixedValues, [dateField]: currentRange };
  const baselineValues = { ...fixedValues, [dateField]: baselineRange };

  const [current, baseline] = await Promise.all([
    runDefinition(definition, currentValues, { page: 1, pageSize: 5000 }),
    runDefinition(definition, baselineValues, { page: 1, pageSize: 5000 })
  ]);

  const toEntityMap = (rows) => new Map(
    rows.filter(r => !r.__isSubtotal).map(r => [String(r[alert.EntityColumnKey]), r])
  );
  const currentByEntity = toEntityMap(current.rows);
  const baselineByEntity = toEntityMap(baseline.rows);
  const allEntities = new Set([...currentByEntity.keys(), ...baselineByEntity.keys()]);

  const compared = [];
  for (const entity of allEntities) {
    const currentVal = numberOf(currentByEntity.get(entity)?.[alert.MetricColumnKey]) ?? 0;
    const baselineVal = numberOf(baselineByEntity.get(entity)?.[alert.MetricColumnKey]) ?? 0;

    let deltaPercent, note;
    if (baselineVal === 0 && currentVal === 0) {
      continue; // cả 2 kỳ đều 0 -> không có tín hiệu gì, bỏ qua
    } else if (baselineVal === 0) {
      deltaPercent = 100; note = 'Mới phát sinh (không có ở kỳ so sánh)';
    } else if (currentVal === 0) {
      deltaPercent = -100; note = 'Về 0 ở kỳ này (có ở kỳ so sánh)';
    } else {
      deltaPercent = ((currentVal - baselineVal) / Math.abs(baselineVal)) * 100;
      note = '';
    }

    compared.push({
      Entity: entity,
      GiaTriKyNay: currentVal,
      GiaTriKySoSanh: baselineVal,
      ChenhLechPhanTram: Math.round(deltaPercent * 10) / 10,
      GhiChu: note
    });
  }

  const anomalies = compared
    .filter(r => Math.abs(r.ChenhLechPhanTram) >= Number(alert.ThresholdPercent))
    .sort((a, b) => Math.abs(b.ChenhLechPhanTram) - Math.abs(a.ChenhLechPhanTram));

  return { definitionTitle: definition.title, currentRange, baselineRange, compared, anomalies };
}

module.exports = { resolveComparisonRange, resolvePeriods, runAnomalyCheck };
