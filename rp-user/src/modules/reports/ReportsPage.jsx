// modules/reports/ReportsPage.jsx — MỘT trang "Báo cáo" duy nhất, thay 3
// trang riêng (kinh doanh/vận hành/Mua hàng) trước đây — gộp điều hướng cho
// gọn nhưng KHÔNG đổi phân quyền: nhóm nghiệp vụ vẫn đọc từ đúng
// app.MenuItems (mã bắt đầu "reports-") + me.menu đã lọc quyền sẵn ở server
// (GET /api/me — xem lib/permissions.js), báo cáo trong từng nhóm vẫn lọc
// riêng theo app.RoleReportAccess (GET /api/reports?menuCode=...). Vẽ thành
// TAB bên trong 1 trang thay vì 3 route/3 mục sidebar riêng.
import { useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import FilterForm from '../../components/FilterForm';
import DataTable from '../../components/DataTable';

export default function ReportsPage() {
  const { me } = useAuth();
  const groups = useMemo(
    () => (me?.menu || []).filter(m => m.code.startsWith('reports-')),
    [me]
  );

  const [activeCode, setActiveCode] = useState('');
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [definition, setDefinition] = useState(null);
  const [filterValues, setFilterValues] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Vào trang lần đầu (hoặc quyền vừa đổi) -> tự chọn tab ĐẦU TIÊN còn hợp lệ.
  useEffect(() => {
    if (groups.length && !groups.some(g => g.code === activeCode)) {
      setActiveCode(groups[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  useEffect(() => {
    if (!activeCode) return;
    api.get(`/reports?menuCode=${encodeURIComponent(activeCode)}`).then(setReports).catch(err => setError(err.message));
    setSelectedId('');
    setDefinition(null);
    setResult(null);
  }, [activeCode]);

  useEffect(() => {
    if (!selectedId) return;
    setFilterValues({});
    setResult(null);
    api.get(`/reports/${selectedId}`).then(setDefinition).catch(err => setError(err.message));
  }, [selectedId]);

  async function runReport() {
    setLoading(true);
    setError('');
    try {
      const data = await api.post(`/reports/${selectedId}/run`, { filters: filterValues, page: 1, pageSize: 200 });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function exportAs(format) {
    try {
      await downloadFile(`/reports/${selectedId}/export`, { filters: filterValues, format }, `${definition?.title || 'bao-cao'}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!groups.length) {
    return (
      <div className="page">
        <h1>Báo cáo</h1>
        <p className="empty-message">Bạn chưa được cấp quyền xem nhóm báo cáo nào.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Báo cáo</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {groups.map(g => (
          <button key={g.code} type="button" className={g.code === activeCode ? 'active' : ''} onClick={() => setActiveCode(g.code)}>
            {g.label}
          </button>
        ))}
      </div>

      <label className="report-picker">
        <span>Chọn báo cáo</span>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— Chọn —</option>
          {reports.map(r => <option key={r.ReportId} value={r.ReportId}>{r.Title}</option>)}
        </select>
      </label>

      {definition && (
        <>
          <FilterForm filters={definition.filters} values={filterValues} onChange={setFilterValues} onSubmit={runReport} />
          {result && (
            <>
              <div className="export-actions">
                <button type="button" onClick={() => exportAs('excel')}>Xuất Excel</button>
                <button type="button" onClick={() => exportAs('pdf')}>Xuất PDF</button>
              </div>
              {/* warnings — CHỈ có ở báo cáo composite (xem
                  rp-server/lib/compositeReportRunner.js), khi 1 khối nguồn
                  trả nhiều hơn 1 dòng cho cùng thực thể — thực thể đó đã bị
                  LOẠI khỏi kết quả bên dưới (không hiện số liệu có thể sai),
                  báo ở đây để người dùng biết báo cáo đang THIẾU vài dòng,
                  không phải "hết dữ liệu". */}
              {result.warnings?.map((w, i) => <p key={i} className="form-warning">⚠️ {w}</p>)}
              {/* result.columns đã là [{key,label}] — rp-server chuẩn hoá sẵn
                  (kể cả cột công thức), xem rp-server/lib/reportEngine.js:describeColumns(). */}
              <DataTable
                columns={result.columns}
                rows={result.rows}
              />
            </>
          )}
          {loading && <p>Đang tải...</p>}
        </>
      )}
    </div>
  );
}
