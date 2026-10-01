// modules/dashboard/Top5ChartTile.jsx — Biểu đồ cột ngang ghép Top 5 MART +
// Top 5 MINIMART của ĐÚNG 1 giai đoạn (vd "Cao nhất - Trong ngày"), tô màu
// riêng theo chuỗi (MART/MINIMART) + nhãn số trên mỗi cột — dùng cho 2 tab
// "Biểu đồ doanh thu"/"Biểu đồ giao dịch" ở Dashboard "Top 5 chi nhánh" (bản
// 8.21 — xem DashboardPage.jsx:buildChartGroups()). KHÔNG dùng chung
// ReportChart.jsx vì component đó tô màu theo TỪNG CỘT GIÁ TRỊ (nhiều
// valueFields khác màu, vd Doanh thu/Giao dịch), còn ở đây cần tô màu theo
// TỪNG DÒNG DỮ LIỆU (chuỗi MART khác màu chuỗi MINIMART) — dùng <Cell> của
// Recharts bên trong 1 <Bar> duy nhất, giống PieChart.
import { useEffect, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import { formatCellValue } from '../../lib/formatCell';
import { computeEventDateRange } from '../../lib/dateRange';

const COLOR_MART = '#1c7566';
const COLOR_MINIMART = '#c0622a';

export default function Top5ChartTile({ title, martTile, minimartTile, valueField, fromDate, toDate, refreshTick }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // KHÔNG setRows(null) trước khi gọi lại — giữ nguyên biểu đồ CŨ trong
    // lúc chờ số MỚI (refreshTick mỗi 30s) để không nhấp nháy "Đang tải...";
    // chỉ reset về null khi đổi SANG giai đoạn khác hẳn (martTile/minimartTile
    // đổi — xem key={g.key} ở DashboardPage.jsx, React tự remount component
    // mới nên state rows=null ban đầu vẫn đúng, không cần tự xoá tay ở đây).
    Promise.all([martTile, minimartTile].map(tile => {
      const filters = { eventDate: computeEventDateRange(tile.dateMode, fromDate, toDate) };
      return api.post(`/reports/${tile.reportId}/run`, { filters, page: 1, pageSize: 200 });
    }))
      .then(([martResult, minimartResult]) => {
        setRows([
          ...martResult.rows.map(r => ({ ...r, chain: 'MART' })),
          ...minimartResult.rows.map(r => ({ ...r, chain: 'MINIMART' }))
        ]);
      })
      .catch(err => setError(err.message));
  }, [martTile.reportId, minimartTile.reportId, fromDate, toDate, refreshTick]);

  return (
    <div className="dashboard-tile">
      <div className="dashboard-tile-header">
        <h3 className="dashboard-tile-title">{title}</h3>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!error && !rows && <p>Đang tải...</p>}
      {rows && (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 90, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => formatCellValue(v)} domain={[0, (max) => Math.ceil(max * 1.2)]} />
            <YAxis type="category" dataKey="tenCuaHang" width={160} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => formatCellValue(v)} />
            <Bar dataKey={valueField} isAnimationActive={false}>
              {rows.map((row, i) => (
                <Cell key={i} fill={row.chain === 'MART' ? COLOR_MART : COLOR_MINIMART} />
              ))}
              <LabelList dataKey={valueField} position="right" formatter={(v) => formatCellValue(v)} style={{ fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="dashboard-chart-legend">
        <span><i style={{ background: COLOR_MART }} /> MART</span>
        <span><i style={{ background: COLOR_MINIMART }} /> MINIMART</span>
      </div>
    </div>
  );
}
