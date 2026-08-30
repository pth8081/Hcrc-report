// lib/reportEmailFilters.js — Áp FilterValuesJson (app.ReportEmailSchedules)
// khi CHẠY TỰ ĐỘNG theo lịch. Lọc kiểu 'dateRange' KHÔNG lưu ngày cố định —
// vô nghĩa với báo cáo gửi lặp lại hàng ngày (hôm nay chạy ra khác hôm sau) —
// mà lưu PRESET tương đối, tính lại thành {from,to} MỖI LẦN chạy. Các loại
// lọc khác (multiSelect/select/text — xem lib/reportEngine.js) dùng giá trị
// CỐ ĐỊNH thật (vd luôn chỉ gửi phòng ban X), hợp lý vì không đổi theo ngày.
const DATE_RANGE_PRESETS = ['today', 'yesterday', 'last7days', 'last30days', 'thisWeek', 'thisMonth', 'lastMonth'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function resolvePreset(preset) {
  const now = new Date();
  switch (preset) {
    case 'today': {
      const d = startOfDay(now);
      return { from: toDateStr(d), to: toDateStr(d) };
    }
    case 'yesterday': {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 1);
      return { from: toDateStr(d), to: toDateStr(d) };
    }
    case 'last7days': {
      const to = startOfDay(now);
      const from = new Date(to);
      from.setDate(from.getDate() - 6);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
    case 'last30days': {
      const to = startOfDay(now);
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
    case 'thisWeek': {
      const d = startOfDay(now);
      const diffToMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const from = new Date(d);
      from.setDate(from.getDate() - diffToMonday);
      return { from: toDateStr(from), to: toDateStr(d) };
    }
    case 'thisMonth': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(startOfDay(now)) };
    }
    case 'lastMonth': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(from), to: toDateStr(to) };
    }
    default:
      throw new Error(`Preset khoảng thời gian không hợp lệ: "${preset}"`);
  }
}

// filterValuesJson: chuỗi JSON { "<field>": {kind:'dateRangePreset',preset} | {kind:'fixed',value} }
// filters: definition.filters của báo cáo (để biết field nào là multiSelect — tách chuỗi thành mảng).
function resolveFilterValues(filterValuesJson, filters = []) {
  const config = filterValuesJson ? JSON.parse(filterValuesJson) : {};
  const out = {};
  for (const filterDef of filters) {
    const entry = config[filterDef.field];
    if (!entry) continue;
    if (entry.kind === 'dateRangePreset') {
      out[filterDef.field] = resolvePreset(entry.preset);
    } else if (entry.kind === 'fixed' && entry.value !== '' && entry.value != null) {
      out[filterDef.field] = filterDef.type === 'multiSelect'
        ? String(entry.value).split(',').map(v => v.trim()).filter(Boolean)
        : entry.value;
    }
  }
  return out;
}

module.exports = { DATE_RANGE_PRESETS, resolvePreset, resolveFilterValues };
