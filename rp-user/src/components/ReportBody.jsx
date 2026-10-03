// components/ReportBody.jsx — Chọn hiện DataTable/PivotTable/ReportChart theo
// definition.visualization — TÁCH RIÊNG khỏi modules/reports/ReportsPage.jsx
// (trước đây là hàm nội bộ renderReportBody()) để DÙNG CHUNG với
// modules/dashboard/DashboardTile.jsx (Giai đoạn C — xem VERSION.md): mỗi ô
// dashboard hiện đúng 1 báo cáo, cùng luật hiện bảng/biểu đồ/pivot như trang
// Báo cáo, không viết lại logic 2 nơi.
import { lazy, Suspense } from 'react';
import DataTable from './DataTable';
import PivotTable from './PivotTable';
import { formatCellValue } from '../lib/formatCell';

// recharts tách chunk riêng — xem lý do đầy đủ ở modules/reports/ReportsPage.jsx
// (bản gốc trước khi tách file này).
const ReportChart = lazy(() => import('./ReportChart'));

// showTable=true LUÔN thắng (giống Power BI: 1 visual bất kỳ luôn xem lại
// được dạng bảng) — bất kể visualization.type là gì.
export default function ReportBody({ visualization, showTable, result, onPointClick }) {
  if (!visualization || showTable) {
    // Cột 1 đúng quy ước "TT" (key "stt" — xem compositeReportRunner.js) mới
    // ép width cố định để cố định luôn cột 2 (tên chi nhánh) khi cuộn ngang;
    // báo cáo không theo quy ước này chỉ cố định cột 1 theo width tự nhiên.
    const scrollClassName = result.columns[0]?.key === 'stt'
      ? 'table-scroll--report table-scroll--report-numbered'
      : 'table-scroll--report';
    // Làm tròn + dấu phẩy ngăn cách hàng nghìn — KHỚP đúng cách
    // lib/reportCellFormat.js:formatCellText() đã dùng lúc xuất Excel/PDF,
    // tránh bảng web hiện số thập phân thô (vd "61268083.26") khác hẳn số
    // đã xuất ("61,268,083").
    const formattedColumns = result.columns.map(col => ({ ...col, render: (row) => formatCellValue(row[col.key], col) }));
    return <DataTable columns={formattedColumns} rows={result.rows} scrollClassName={scrollClassName} columnGroups={result.columnGroups} />;
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
