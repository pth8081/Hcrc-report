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
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import ReportBody from '../../components/ReportBody';

export default function DashboardTile({ tile, crossFilters, onPointClick }) {
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
    api.post(`/reports/${tile.reportId}/run`, { filters: crossFilters, page: 1, pageSize: 200 })
      .then(setResult)
      .catch(err => setError(err.message));
  }, [definition, tile.reportId, crossFilters]);

  return (
    <div className="dashboard-tile">
      <div className="dashboard-tile-header">
        <h3 className="dashboard-tile-title">{tile.title || definition?.title || tile.reportId}</h3>
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
          onPointClick={(field, value) => onPointClick(field, value)}
        />
      )}
    </div>
  );
}
