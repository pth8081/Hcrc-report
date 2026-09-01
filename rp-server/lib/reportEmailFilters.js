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

// "Hôm nay"/"Hôm qua"/... PHẢI hiểu theo giờ Việt Nam — admin cấu hình
// preset này luôn với ý định lịch VN, nhưng toàn bộ hàm bên dưới dùng getter
// LOCAL (getFullYear/getMonth/getDate) của Date, vốn phụ thuộc timezone của
// TIẾN TRÌNH chạy rp-server (server production thường đặt UTC — cùng rủi ro
// đã ghi nhận ở jobs/scheduler.js). Nếu lịch chạy vào khung 00:00–06:59 giờ
// VN (=17:00–23:59 UTC hôm trước), "today" tính theo UTC sẽ ra NGÀY HÔM
// TRƯỚC theo lịch VN — nguồn lệch trực tiếp cho anomalyAlertRunner.js
// (periodComparison đọc preset qua hàm này). Dựng "now" từ ĐÚNG các thành
// phần lịch giờ VN (qua Intl, không phụ thuộc timezone tiến trình) rồi mọi
// getter LOCAL phía sau tự động đúng theo lịch VN, bất kể server chạy ở
// timezone nào.
function nowInVietnamTimezone() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find(p => p.type === type).value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

function resolvePreset(preset) {
  const now = nowInVietnamTimezone();
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
