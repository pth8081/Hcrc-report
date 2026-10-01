// modules/dashboard/DashboardTile.jsx — 1 ô trong Dashboard (Giai đoạn C —
// xem VERSION.md). Gọi ĐÚNG endpoint /api/reports/:reportId(/run) đã có sẵn
// (không có API "chạy dashboard" riêng) — quyền xem từng ô vì vậy tự động
// thừa hưởng đúng app.RoleReportAccess hiện có, không cần logic quyền riêng
// ở đây (routes/dashboards.js đã lọc bớt ô không có quyền trước khi tới đây).
//
// Lọc chéo (cross-filter): KHÔNG có cấu hình "tile trỏ field nào" riêng —
// tile luôn gửi TOÀN BỘ crossFilters (do DashboardPage giữ, đến từ việc bấm
// vào điểm/cột/lát trên 1 biểu đồ khác) làm filters khi chạy báo cáo. Field
// nào report này không khai trong definition.filters thì rp-server tự bỏ
// qua (xem reportEngine.js:runReport()) — không lỗi, không cần khai gì thêm
// ở phía tile.
//
// tile.dateMode (TUỲ CHỌN — Dashboard "Top 5 chi nhánh", bản 8.20-8.22, xem
// scripts/seedTop5ChiNhanhReports.js) — field RIÊNG của tile (không phải
// trường chuẩn của definition.tiles, đi xuyên qua routes/dashboards.js
// nguyên vẹn): 'day' -> eventDate = {from: fromDate, to: toDate} (ĐÚNG
// khoảng đã chọn ở bộ lọc "Từ ngày — đến ngày"), 'month' -> eventDate =
// NGUYÊN THÁNG chứa toDate (xem lib/dateRange.js:computeEventDateRange()).
// Cho phép 2 Ô CÙNG 1 reportId (vd "Top 5 MART Doanh thu cao nhất") hiện
// "Trong ngày"/"Trong tháng" song song từ ĐÚNG 1 bộ lọc ngày ở
// DashboardPage.jsx, không cần tạo 2 báo cáo riêng chỉ khác khoảng ngày
// cứng. Tile không khai dateMode (mọi dashboard khác) -> hành vi CŨ, không
// đổi gì (không tự thêm eventDate vào filters, tiêu đề không có nhãn ngày
// động).
//
// tile.title (seedTop5ChiNhanhReports.js, bản 8.22) giờ là TÊN GỐC KHÔNG
// kèm "(Trong ngày)"/"(Trong tháng)" tĩnh nữa — component này tự GHÉP THÊM
// nhãn ngày/tháng ĐỘNG vào cuối theo đúng fromDate/toDate đang chọn (xem
// periodLabelFor()), để đổi ngày là tiêu đề tự cập nhật theo, không lưu
// cứng ngày lúc tạo báo cáo.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import ReportBody from '../../components/ReportBody';
import { computeEventDateRange, periodLabelFor } from '../../lib/dateRange';

export default function DashboardTile({ tile, crossFilters, fromDate, toDate, refreshTick, onPointClick }) {
  const [definition, setDefinition] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  // Cùng luật với trang Báo cáo (ReportsPage.jsx): showTable=true LUÔN xem
  // được, bất kể tile có khai visualization hay không — bảng số KHÔNG bị
  // bớt đi khi thêm biểu đồ, chỉ thêm lựa chọn xem khác.
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    api.get(`/reports/${tile.reportId}`).then(setDefinition).catch(err => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.reportId]);

  useEffect(() => {
    if (!definition) return;
    const filters = tile.dateMode
      ? { ...crossFilters, eventDate: computeEventDateRange(tile.dateMode, fromDate, toDate) }
      : crossFilters;
    api.post(`/reports/${tile.reportId}/run`, { filters, page: 1, pageSize: 200 })
      .then(setResult)
      .catch(err => setError(err.message));
  }, [definition, tile.reportId, tile.dateMode, crossFilters, fromDate, toDate, refreshTick]);

  // tile.tone (TUỲ CHỌN — "high"/"low") — viền trên màu xanh/cam, xem
  // styles.css. Tile không khai tone -> không thêm class gì, giao diện như
  // trước.
  const toneClass = tile.tone ? ` dashboard-tile--${tile.tone}` : '';
  const baseTitle = tile.title || definition?.title || tile.reportId;
  const periodLabel = tile.dateMode ? periodLabelFor(tile.dateMode, fromDate, toDate) : null;
  const displayTitle = periodLabel ? `${baseTitle} (${periodLabel})` : baseTitle;
  return (
    <div className={`dashboard-tile${toneClass}`}>
      <div className="dashboard-tile-header">
        <h3 className="dashboard-tile-title">{displayTitle}</h3>
        {/* Chỉ hiện nút chuyển đổi khi tile THẬT SỰ có biểu đồ để chuyển
            sang/về — tile không khai visualization luôn là bảng sẵn (xem
            ReportBody.jsx), không có gì để bấm. */}
        {definition?.visualization && (
          <button type="button" className="dashboard-tile-toggle" onClick={() => setShowTable(v => !v)}>
            {showTable ? '📊 Xem biểu đồ' : '📋 Xem bảng'}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {!error && !result && <p>Đang tải...</p>}
      {result && (
        <ReportBody
          visualization={definition.visualization}
          showTable={showTable}
          result={result}
          onPointClick={(row, xField) => onPointClick(xField, row[xField])}
        />
      )}
    </div>
  );
}
