// lib/dateRange.js — Tiện ích ngày DÙNG CHUNG cho Dashboard "Top 5 chi
// nhánh" (DashboardPage.jsx/DashboardTile.jsx/Top5ChartTile.jsx) — tính
// khoảng ngày theo tile.dateMode + định dạng nhãn hiển thị động (vd
// "09/10/2026", "Tháng 10/2026") thay cho nhãn tĩnh "(Trong ngày)"/"(Trong
// tháng)" trước đây. MIRROR đúng lastOfMonth()/computeEventDateRange() ở
// rp-server/routes/dashboards.js (2 runtime khác nhau — Node/trình duyệt —
// không dùng chung 1 file được, sửa đồng thời cả 2 nơi nếu đổi công thức).
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
