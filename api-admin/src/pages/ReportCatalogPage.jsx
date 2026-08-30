// pages/ReportCatalogPage.jsx — Trang "Báo cáo": CRUD api.ReportCatalog —
// danh mục báo cáo tổng hợp lộ qua GET /api/v1/reports/{ReportId}/run (đọc
// dwh.ReportFacts). Định nghĩa (filters/columns) sửa dạng textarea JSON thô,
// cùng khuôn dạng với app.ReportCatalog bên rp-server — xem rp-server/README.md
// mục "Thêm một báo cáo mới" cho ví dụ JSON. Chỉ vai trò admin sửa được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { reportId: '', title: '', domain: '', definitionJson: '' };

export default function ReportCatalogPage() {
  const { isAdmin } = useAuth();
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/report-catalog').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createReport(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/report-catalog', form);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteReport(r) {
    if (!confirm(`Xoá báo cáo "${r.Title}"?`)) return;
    try {
      await api.del(`/report-catalog/${r.ReportId}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Báo cáo</h1>
      <p>
        Danh mục báo cáo tổng hợp lộ ra qua <code>GET /api/v1/reports/&#123;ReportId&#125;/run</code>
        {' '}(hệ thống ngoài gọi bằng API key scope <code>reports</code>, Report Server nội bộ gọi khi cấu hình
        một báo cáo &quot;Qua API Server&quot;). Danh mục này ĐỘC LẬP với danh mục báo cáo bên Report Server.
      </p>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createReport}>
          <input placeholder="Mã báo cáo (reportId)" value={form.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value })} required />
          <input placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input placeholder="Domain (dwh.ReportFacts.Domain)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
          <textarea
            placeholder='{"domain": "...", "filters": [...], "columns": ["entityCode", "measures.doanhThu", {"key": "tyLeLoiNhuan", "label": "Tỷ lệ lợi nhuận (%)", "formula": "ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)"}]}'
            rows={8}
            value={form.definitionJson}
            onChange={(e) => setForm({ ...form, definitionJson: e.target.value })}
            required
          />
          <button type="submit">Tạo báo cáo</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Title', label: 'Tiêu đề' },
          { key: 'ReportId', label: 'Mã' },
          { key: 'Domain', label: 'Domain' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          isAdmin && { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => deleteReport(r)}>Xoá</button> }
        ].filter(Boolean)}
        rows={reports}
      />
    </div>
  );
}
