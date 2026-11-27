// lib/chartImage.js — Vẽ biểu đồ cột nhóm (grouped bar chart) ra ẢNH PNG
// (bản 11.26, theo yêu cầu người dùng — "Báo cáo khách hàng theo tuần" file
// mẫu MKT gốc có 1 sheet "Biểu đồ" RIÊNG với 3 biểu đồ cột minh hoạ Tổng số
// Bill/AOV Mart/AOV Mini Mart, đối chiếu Model (LFL)/Tuần này/Tuần trước).
//
// Dùng `@napi-rs/canvas` (Canvas 2D, build sẵn theo nền tảng — KHÔNG cần
// công cụ build hệ thống như Cairo/Pango của gói `canvas` cũ, an toàn khi
// triển khai lên server khác không có sẵn công cụ biên dịch) để vẽ TRỰC
// TIẾP, KHÔNG dùng thư viện chart ngoài (chartjs-node-canvas...) — chỉ cần
// đúng 1 kiểu biểu đồ cột nhóm đơn giản, tự vẽ rẻ hơn và không thêm phụ
// thuộc nặng.
//
// Font tiếng Việt: TÁI DÙNG NGUYÊN font đã có sẵn trong repo cho xuất PDF
// (gói `@openfonts/inter_vietnamese`, xem lib/exportPdf.js) — KHÔNG phụ
// thuộc font hệ thống (server có thể không cài font tiếng Việt). Đăng ký
// 2 TÊN HỌ font RIÊNG cho 2 độ đậm (Regular/Bold) — ĐÃ THỬ đăng ký 2 file
// khác độ đậm CÙNG 1 tên họ ("Inter") rồi chọn qua `ctx.font = 'bold ...'`
// nhưng KHÔNG ra đúng độ đậm (luôn vẽ ra đúng 1 kiểu, không rõ do hạn chế
// bản @napi-rs/canvas 1.2.1 đang dùng) — đặt tên họ RIÊNG cho mỗi độ đậm
// (xem ensureFonts()) là cách THẬT SỰ chạy đúng, đã kiểm chứng bằng ảnh.
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', 'node_modules', '@openfonts', 'inter_vietnamese', 'files');
const FONT_REGULAR = 'HcrcChartInterRegular';
const FONT_BOLD = 'HcrcChartInterBold';
let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'inter-vietnamese-400.woff'), FONT_REGULAR);
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'inter-vietnamese-700.woff'), FONT_BOLD);
  fontsRegistered = true;
}

// SỬA bản 11.35 (theo yêu cầu người dùng, đối chiếu ảnh mẫu thật "BÁO CÁO
// THẺ BRG ELITE") — bảng màu CŨ (lfl=xám, w1=cam nhạt, w=xanh lá) KHÔNG
// khớp quy ước thật đang dùng ở báo cáo giấy/PDF của MKT: LFL=XANH LÁ,
// Tuần này (W)=CAM, Tuần trước (W-1)=XANH DƯƠNG — đổi lại đúng 3 màu này,
// và lib/khachHangTuanRunner.js:buildChartImages() đổi THỨ TỰ series tương
// ứng (lfl, w, w1 — KHÔNG còn lfl, w1, w) để cột vẽ ra đúng thứ tự trái→
// phải như ảnh mẫu.
const SERIES_COLORS = { lfl: '#6FA83D', w: '#F2A93C', w1: '#4A90D2' };

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}

// renderGroupedBarChart — vẽ 1 biểu đồ cột nhóm ra buffer PNG.
//   title: chuỗi tiêu đề (vẽ đậm, góc trên trái).
//   categories: [{ label }] — mỗi phần tử 1 NHÓM cột trên trục X (vd "Mart"/
//     "Mini Mart", hoặc "AOV tổng"/"AOV qua thẻ").
//   series: [{ key, label, color? }] — mỗi phần tử 1 CỘT trong từng nhóm
//     (vd Model/Tuần trước/Tuần này), CÙNG THỨ TỰ cho MỌI nhóm.
//   values: Map/object [categoryIndex][seriesKey] -> number — ĐƯA QUA
//     categories[].values = { [seriesKey]: number } (gắn sẵn ở lời gọi).
function renderGroupedBarChart({ title, categories, series, width = 860, height = 420 }) {
  ensureFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padding = { top: 56, right: 24, bottom: 56, left: 24 };
  const legendH = 28;
  const plotTop = padding.top + legendH;
  const plotLeft = padding.left;
  const plotRight = width - padding.right;
  const plotBottom = height - padding.bottom;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  ctx.fillStyle = '#1a1a1a';
  ctx.font = `20px ${FONT_BOLD}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, plotLeft, 30);

  // Legend — 1 hàng ngang, mỗi series 1 ô màu + nhãn.
  let legendX = plotLeft;
  const legendY = padding.top;
  ctx.font = `13px ${FONT_REGULAR}`;
  series.forEach((s) => {
    const color = s.color || '#9BCC1E';
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY, 14, 14);
    ctx.fillStyle = '#333333';
    const label = s.label;
    ctx.fillText(label, legendX + 20, legendY + 12);
    legendX += 20 + ctx.measureText(label).width + 28;
  });

  const maxValue = Math.max(
    1,
    ...categories.flatMap(c => series.map(s => Number(c.values[s.key]) || 0))
  );
  const yMax = maxValue * 1.2;

  // Đường trục ngang (baseline).
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  const groupW = plotW / categories.length;
  const barGap = 6;
  const groupInnerPad = groupW * 0.12;
  const barW = (groupW - groupInnerPad * 2 - barGap * (series.length - 1)) / series.length;

  ctx.textAlign = 'center';
  categories.forEach((cat, ci) => {
    const groupX0 = plotLeft + ci * groupW + groupInnerPad;
    series.forEach((s, si) => {
      const value = Number(cat.values[s.key]) || 0;
      const barH = yMax > 0 ? (value / yMax) * plotH : 0;
      const x = groupX0 + si * (barW + barGap);
      const y = plotBottom - barH;
      ctx.fillStyle = s.color || '#9BCC1E';
      ctx.fillRect(x, y, barW, barH);

      ctx.fillStyle = '#333333';
      ctx.font = `11px ${FONT_REGULAR}`;
      ctx.fillText(formatNumber(value), x + barW / 2, y - 6);
    });

    ctx.fillStyle = '#1a1a1a';
    ctx.font = `14px ${FONT_BOLD}`;
    ctx.fillText(cat.label, plotLeft + ci * groupW + groupW / 2, plotBottom + 22);
  });
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// PIE_COLORS (bản 11.47) — bảng màu CỐ ĐỊNH, đủ phân biệt cho tối đa 14
// lát (14 khoảng giá trị hoá đơn) — lặp lại nếu nhiều lát hơn (không xảy
// ra ở đây, chỉ phòng hờ).
const PIE_COLORS = [
  '#4A90D2', '#F2A93C', '#6FA83D', '#D24A6E', '#9B59B6', '#1ABC9C', '#E67E22',
  '#34495E', '#F1C40F', '#2ECC71', '#E74C3C', '#3498DB', '#95A5A6', '#C0392B'
];

// renderPieChart (bản 11.47, theo yêu cầu người dùng — sheet "Biểu đồ HĐ"
// của "Báo cáo khách hàng theo tuần", 6 biểu đồ TRÒN so sánh Số lượng/Giá
// trị hoá đơn theo khoảng giá trị + theo Thẻ/Tổng, xem
// lib/khachHangTuanRunner.js:buildHoaDonChartImages()).
//   title: chuỗi tiêu đề.
//   slices: [{ label, value, color? }] — mỗi phần tử 1 lát; lát value<=0
//     bị BỎ QUA (không vẽ lát rỗng/chú thích rối mắt) — nếu TẤT CẢ lát
//     đều 0 (chưa có dữ liệu), vẽ 1 vòng tròn xám + chữ "Chưa có dữ liệu"
//     thay vì chia 0 ra lỗi `NaN`.
function renderPieChart({ title, slices, width = 860, height = 480 }) {
  ensureFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#1a1a1a';
  ctx.font = `20px ${FONT_BOLD}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 24, 30);

  const usable = (slices || []).filter(s => Number(s.value) > 0);
  const total = usable.reduce((sum, s) => sum + Number(s.value), 0);

  const cx = width * 0.34, cy = height / 2 + 10, r = Math.min(cx - 24, height / 2 - 40);

  if (!usable.length || total <= 0) {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#999999';
    ctx.font = `14px ${FONT_REGULAR}`;
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu', cx, cy);
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
  }

  let angleStart = -Math.PI / 2;
  const legendItems = [];
  usable.forEach((s, i) => {
    const value = Number(s.value);
    const fraction = value / total;
    const angleEnd = angleStart + fraction * Math.PI * 2;
    const color = s.color || PIE_COLORS[i % PIE_COLORS.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angleStart, angleEnd);
    ctx.closePath();
    ctx.fill();
    legendItems.push({ label: s.label, value, fraction, color });
    angleStart = angleEnd;
  });

  // Legend — cột dọc bên phải vòng tròn, mỗi lát 1 dòng (ô màu + nhãn +
  // giá trị + %).
  const legendX = width * 0.58;
  let legendY = 56;
  ctx.textAlign = 'left';
  legendItems.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, legendY, 14, 14);
    ctx.fillStyle = '#333333';
    ctx.font = `13px ${FONT_REGULAR}`;
    const pct = (item.fraction * 100).toFixed(1);
    ctx.fillText(`${item.label}: ${formatNumber(item.value)} (${pct}%)`, legendX + 20, legendY + 12);
    legendY += 22;
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderGroupedBarChart, renderPieChart, SERIES_COLORS, formatNumber };
