// components/ReportBody.jsx — Chọn hiện DataTable/PivotTable/ReportChart theo
// definition.visualization — TÁCH RIÊNG khỏi modules/reports/ReportsPage.jsx
// (trước đây là hàm nội bộ renderReportBody()) để DÙNG CHUNG với
// modules/dashboard/DashboardTile.jsx (Giai đoạn C — xem VERSION.md): mỗi ô
// dashboard hiện đúng 1 báo cáo, cùng luật hiện bảng/biểu đồ/pivot như trang
// Báo cáo, không viết lại logic 2 nơi.
import { lazy, Suspense } from 'react';
import DataTable from './DataTable';
import PivotTable from './PivotTable';

// recharts tách chunk riêng — xem lý do đầy đủ ở modules/reports/ReportsPage.jsx
// (bản gốc trước khi tách file này).
const ReportChart = lazy(() => import('./ReportChart'));

// showTable=true LUÔN thắng (giống Power BI: 1 visual bất kỳ luôn xem lại
// được dạng bảng) — bất kể visualization.type là gì.
export default function ReportBody({ visualization, showTable, result, onPointClick }) {
  if (!visualization || showTable) {
    return <DataTable columns={result.columns} rows={result.rows} />;
  }
  if (visualization.type === 'pivot') {
    return <PivotTable columns={result.columns} rows={result.rows} visualization={visualization} />;
  }
  return (
    <Suspense fallback={<p>Đang tải biểu đồ...</p>}>
      <ReportChart columns={result.columns} rows={result.rows} visualization={visualization} onPointClick={onPointClick} />
    </Suspense>
  );
}
