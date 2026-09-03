// components/ReportChart.jsx — Vẽ biểu đồ cho báo cáo có khai
// definition.visualization (xem hướng_dẫn_báo_cáo.md mục "Biểu đồ") — KHÔNG
// bắt buộc, báo cáo không khai key này vẫn dùng DataTable như cũ
// (ReportsPage.jsx tự quyết định render cái nào).
//
// visualization = { type: 'bar'|'line'|'pie'|'kpi', xField, valueFields: [...] }
//   - xField/valueFields dùng ĐÚNG "key" đã khai trong definition.columns —
//     KHÔNG phải path thô (dimensions.x/measures.y) — vì rows nhận được ở
//     đây đã được rp-server chiếu phẳng theo columns (projectColumns()/
//     projectCompositeRow(), xem reportEngine.js/compositeReportRunner.js),
//     admin không cần biết field nằm ở Dimensions hay Measures.
//   - 'kpi': không cần xField (mỗi valueField vẽ 1 thẻ số tổng) — cộng dồn
//     TOÀN BỘ dòng, TRỪ dòng "Tổng cộng" chính (__isGrandTotal, xem
//     compositeReportRunner.js) nếu có sẵn (dùng thẳng, khỏi cộng lại).
//   - 'pie': chỉ dùng valueFields[0] (1 chuỗi số duy nhất, đúng ngữ nghĩa
//     biểu đồ tròn — nhiều chuỗi không có ý nghĩa "phần trăm của tổng").
//
// onPointClick(field, value) — TUỲ CHỌN, chưa dùng ở bản này (không có nơi
// gọi truyền vào) — chừa sẵn để tái dùng cho lọc chéo dashboard/drill-through
// sau này mà không phải đổi lại chữ ký component.
//
// isAnimationActive={false} ở mọi biểu đồ — Recharts mặc định "vẽ dần" hình
// (đặc biệt Pie: sector bắt đầu từ góc 0 rồi quét dần ra) khi mount; test
// chụp màn hình gặp đúng trường hợp chụp giữa lúc animation chưa xong (Pie
// gần như trống trơn) — tắt hẳn animation để biểu đồ LUÔN hiện đúng trạng
// thái cuối cùng ngay khi vẽ, không phụ thuộc thời điểm/tốc độ máy.
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const PALETTE = ['#1c7566', '#c0622a', '#3a6ea5', '#a54e6e', '#7a8c3f', '#8a5a00'];
const numberFmt = (v) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : v);
// Trục Y hiện số rút gọn ("120 Tr" thay vì "120000000") — số liệu doanh thu/
// chỉ tiêu thường có nhiều chữ số, không rút gọn thì nhãn trục bị Recharts
// cắt lề trái (đã thấy khi chụp demo thật, xem margin bên dưới) hoặc chữ
// chồng lên nhau. Tooltip (numberFmt ở trên) vẫn hiện ĐẦY ĐỦ số khi rê chuột
// vào — rút gọn chỉ áp dụng cho nhãn trục.
const compactNumberFmt = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format;

function labelFor(columns, key) {
  return columns.find(c => c.key === key)?.label || key;
}

function sumField(rows, field) {
  return rows.reduce((total, row) => total + (typeof row[field] === 'number' ? row[field] : 0), 0);
}

function KpiTiles({ columns, rows, visualization }) {
  const grandTotal = rows.find(r => r.__isGrandTotal);
  const dataRows = rows.filter(r => !r.__isSubtotal);
  return (
    <div className="kpi-row">
      {(visualization.valueFields || []).map(field => (
        <div className="kpi-tile" key={field}>
          <div className="kpi-tile-label">{labelFor(columns, field)}</div>
          <div className="kpi-tile-value">{numberFmt(grandTotal ? grandTotal[field] : sumField(dataRows, field))}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReportChart({ columns, rows, visualization, onPointClick }) {
  const { type, xField, valueFields = [] } = visualization;
  if (type === 'kpi') return <KpiTiles columns={columns} rows={rows} visualization={visualization} />;

  // Dòng "Tổng cộng"/"Tổng nhóm" (__isSubtotal) chỉ có ý nghĩa trong bảng số
  // — lẫn vào biểu đồ sẽ vẽ thêm 1 cột/điểm "ảo" làm méo trục và tỷ lệ.
  const chartRows = rows.filter(r => !r.__isSubtotal);
  if (!chartRows.length) return <p className="empty-message">Không có dữ liệu.</p>;

  const handleClick = (field, value) => { if (onPointClick && value !== undefined) onPointClick(field, value); };

  if (type === 'pie') {
    const field = valueFields[0];
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie
            data={chartRows}
            dataKey={field}
            nameKey={xField}
            outerRadius={130}
            label={(d) => d[xField]}
            isAnimationActive={false}
            onClick={(d) => handleClick(xField, d?.[xField])}
          >
            {chartRows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip formatter={numberFmt} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent = type === 'line' ? LineChart : BarChart;
  const SeriesComponent = type === 'line' ? Line : Bar;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ChartComponent
        data={chartRows}
        margin={{ left: 12, right: 12, top: 8, bottom: 8 }}
        onClick={(e) => handleClick(xField, e?.activePayload?.[0]?.payload?.[xField])}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xField} />
        <YAxis tickFormatter={compactNumberFmt} width={56} />
        <Tooltip formatter={numberFmt} />
        <Legend />
        {valueFields.map((field, i) => (
          <SeriesComponent
            key={field}
            dataKey={field}
            name={labelFor(columns, field)}
            fill={PALETTE[i % PALETTE.length]}
            stroke={PALETTE[i % PALETTE.length]}
            isAnimationActive={false}
          />
        ))}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
