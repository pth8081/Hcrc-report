// modules/dashboard/RealtimeReportTile.jsx (bản 8.24) — Ô Dashboard hiện
// NGUYÊN báo cáo đã có sẵn (vd "bc-doanh-thu-hcrc", xem
// scripts/seedLdtdHcrcReports.js) theo đúng khuôn gốc (Diện tích/Chỉ tiêu/
// Lãi gộp/Giao dịch/Trung bình GD/Doanh thu per m2, nhóm MART/MINIMART có
// dòng "Tổng cộng"), KHÔNG viết lại logic báo cáo — chỉ:
//   - LUÔN ép filters.cheDoSoSanh='past' (ẩn hẳn cột Cùng kỳ/LFL, đúng yêu
//     cầu "bỏ so sánh cùng kỳ").
//   - mode='table': hiện bảng ĐẦY ĐỦ như báo cáo gốc.
//   - mode='chart': hiện biểu đồ CHỈ ĐÚNG 1 cột "Doanh thu - Thực đạt"
//     (dt_thucDat) — visualization dựng TẠM Ở ĐÂY (client), KHÔNG đụng vào
//     definition.visualization của báo cáo gốc trên CSDL (báo cáo gốc vẫn
//     xem/xuất bình thường như cũ, không ảnh hưởng gì). Tên siêu thị nằm
//     NGANG theo trục X (mặc định của Recharts BarChart, xem
//     ReportChart.jsx), mỗi cột hiện số ngay phía trên quy đổi theo đơn vị
//     1 triệu (unitDivisor + showValueLabels, bản 8.29) kèm ghi chú
//     "ĐVT: 1.000.000" phía trên biểu đồ để không nhầm đơn vị.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import ReportBody from '../../components/ReportBody';
import { computeEventDateRange } from '../../lib/dateRange';

const CHART_VISUALIZATION = {
  type: 'bar', xField: 'tenCuaHang', valueFields: ['dt_thucDat'],
  unitDivisor: 1_000_000, showValueLabels: true, unitNote: 'ĐVT: 1.000.000'
};

export default function RealtimeReportTile({ reportId, title, dateMode, mode, fromDate, toDate, refreshTick }) {
  const [definition, setDefinition] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports/${reportId}`).then(setDefinition).catch(err => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  useEffect(() => {
    if (!definition) return;
    const filters = { cheDoSoSanh: 'past', eventDate: computeEventDateRange(dateMode, fromDate, toDate) };
    api.post(`/reports/${reportId}/run`, { filters, page: 1, pageSize: 200 })
      .then(setResult)
      .catch(err => setError(err.message));
  }, [definition, reportId, dateMode, fromDate, toDate, refreshTick]);

  return (
    <div className="dashboard-tile dashboard-tile--wide">
      <div className="dashboard-tile-header">
        <h3 className="dashboard-tile-title">{title}</h3>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!error && !result && <p>Đang tải...</p>}
      {result && (
        <ReportBody
          visualization={mode === 'chart' ? CHART_VISUALIZATION : null}
          showTable={mode === 'table'}
          result={result}
          onPointClick={() => {}}
        />
      )}
    </div>
  );
}
