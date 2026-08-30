// modules/reports/ReportsModulePage.jsx — MỘT component dùng chung cho cả 3
// trang báo cáo (kinh doanh/vận hành/Mua hàng), chỉ khác menuCode truyền vào
// từ route (xem App.jsx). Không viết riêng UI cho từng module báo cáo.
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import FilterForm from '../../components/FilterForm';
import DataTable from '../../components/DataTable';

export default function ReportsModulePage({ menuCode, title }) {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [definition, setDefinition] = useState(null);
  const [filterValues, setFilterValues] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports?menuCode=${encodeURIComponent(menuCode)}`).then(setReports).catch(err => setError(err.message));
    setSelectedId('');
    setDefinition(null);
    setResult(null);
  }, [menuCode]);

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

  return (
    <div className="page">
      <h1>{title}</h1>
      {error && <p className="form-error">{error}</p>}

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
              <DataTable
                columns={result.columns.map(c => ({ key: c, label: c }))}
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
