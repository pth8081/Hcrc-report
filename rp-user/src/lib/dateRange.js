// lib/dateRange.js — Tiện ích ngày DÙNG CHUNG cho Dashboard "Top 5 chi
// nhánh" (DashboardPage.jsx/DashboardTile.jsx/Top5ChartTile.jsx) — tính
// khoảng ngày theo tile.dateMode + định dạng nhãn hiển thị động (vd
// "09/10/2026", "Tháng 10/2026") thay cho nhãn tĩnh "(Trong ngày)"/"(Trong
// tháng)" trước đây. MIRROR đúng lastOfMonth()/computeEventDateRange() ở
// rp-server/routes/dashboards.js (2 runtime khác nhau — Node/trình duyệt —
// không dùng chung 1 file được, sửa đồng thời cả 2 nơi nếu đổi công thức).
// LỖI THẬT đã gặp (bản 8.26): "hôm nay" trước đây tính bằng
// `new Date().toISOString().slice(0,10)` — `.toISOString()` LUÔN quy đổi về
// giờ UTC, không phải giờ Việt Nam của người xem. Múi giờ Việt Nam
// (UTC+7) đi TRƯỚC UTC 7 tiếng, nên suốt khoảng 00:00-06:59 giờ Việt Nam mỗi
// ngày, UTC vẫn còn ở NGÀY HÔM TRƯỚC — "hôm nay"/nút "Hôm nay"/max ngày được
// chọn trong khoảng giờ đó bị lùi mất 1 ngày so với lịch thật ở Việt Nam
// (phát hiện lúc người dùng test đúng 06:11 sáng). Dùng Intl.DateTimeFormat
// với timeZone cố định 'Asia/Ho_Chi_Minh' — ĐÚNG bất kể múi giờ máy/trình
// duyệt người xem đang đặt (vd quản lý xem báo cáo lúc đang ở nước ngoài vẫn
// phải thấy "hôm nay" theo giờ Việt Nam, vì toàn bộ nghiệp vụ/dữ liệu đều
// tính theo ngày làm việc Việt Nam) — 'en-CA' cho sẵn định dạng "YYYY-MM-DD".
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

// Cộng/trừ N ngày vào 1 ngày ISO — dùng Date.UTC (như lastOfMonth() dưới
// đây) để tránh lệch ngày do giờ mùa hè/timezone trình duyệt, KHÔNG liên
// quan gì tới giờ Việt Nam thật (todayISO() ở trên đã lo phần đó) — chỉ
// cộng/trừ số ngày nguyên trên 1 chuỗi ngày đã có sẵn.
export function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function lastOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

export function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDayRangeLabel(fromDate, toDate) {
  return fromDate === toDate ? formatDateVN(fromDate) : `${formatDateVN(fromDate)} - ${formatDateVN(toDate)}`;
}

export function formatMonthLabel(dateStr) {
  const [y, m] = dateStr.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

// tile.dateMode ('day'/'month', TUỲ CHỌN) -> {from,to} truyền vào
// filters.eventDate — 'month' LUÔN lấy NGUYÊN THÁNG chứa toDate (không dừng
// ở toDate — chọn 1 ngày bất kỳ thuộc tháng nào thì tính đủ CẢ tháng đó,
// xem VERSION.md bản 8.22).
export function computeEventDateRange(dateMode, fromDate, toDate) {
  if (dateMode === 'month') return { from: firstOfMonth(toDate), to: lastOfMonth(toDate) };
  return { from: fromDate, to: toDate };
}

// Nhãn hiển thị động thay cho "(Trong ngày)"/"(Trong tháng)" tĩnh — 'day'
// hiện đúng ngày/khoảng ngày đã chọn, 'month' hiện đúng tháng/năm (suy từ
// toDate, khớp đúng tháng mà computeEventDateRange() ở trên tính cho khối
// 'month'). dateMode khác hoặc rỗng -> không có nhãn (tile không dùng cơ chế
// này, xem DashboardTile.jsx).
export function periodLabelFor(dateMode, fromDate, toDate) {
  if (dateMode === 'month') return formatMonthLabel(toDate);
  if (dateMode === 'day') return formatDayRangeLabel(fromDate, toDate);
  return null;
}
