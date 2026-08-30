// modules/system/report-catalog/ReportCatalogPanel.jsx — CRUD app.ReportCatalog.
// DefinitionJson sửa dạng textarea (JSON thô) — chưa có form có cấu trúc cho
// từng loại filter, đủ dùng ở bước khung này (xem rp-server/README.md
// mục "Thêm một báo cáo mới" cho ví dụ JSON).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const EMPTY_FORM = { reportId: '', title: '', domain: '', menuItemId: '', dataSourceId: '', definitionJson: '' };
const REPORT_MENU_CODES = new Set(['reports-kinh-doanh', 'reports-van-hanh', 'reports-mua-hang']);

export default function ReportCatalogPanel() {
  const [reports, setReports] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/system/report-catalog').then(setReports).catch(err => setError(err.message));
    api.get('/system/menu-items').then(rows => setMenuItems(rows.filter(m => REPORT_MENU_CODES.has(m.Code)))).catch(err => setError(err.message));
    api.get('/system/data-sources').then(setDataSources).catch(err => setError(err.message));
    api.get('/system/report-catalog/templates').then(setTemplates).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createReport(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/report-catalog', { ...form, menuItemId: Number(form.menuItemId), dataSourceId: form.dataSourceId ? Number(form.dataSourceId) : null });
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteReport(r) {
    if (!confirm(`Xoá báo cáo "${r.Title}"?`)) return;
    try {
      await api.del(`/system/report-catalog/${r.ReportId}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function uploadTemplate(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.upload('/system/report-catalog/templates', formData);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={createReport}>
        <input placeholder="Mã báo cáo (reportId)" value={form.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value })} required />
        <input placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input placeholder="Domain (dwh.ReportFacts.Domain)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
        <select value={form.menuItemId} onChange={(e) => setForm({ ...form, menuItemId: e.target.value })} required>
          <option value="">— Trang báo cáo —</option>
          {menuItems.map(m => <option key={m.Id} value={m.Id}>{m.Label}</option>)}
        </select>
        <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value })}>
          <option value="">Data Warehouse mặc định</option>
          {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
        </select>
        <textarea
          placeholder='{"id": "...", "title": "...", "domain": "...", "filters": [...], "columns": [...], "export": ["excel","pdf"]}'
          rows={8}
          value={form.definitionJson}
          onChange={(e) => setForm({ ...form, definitionJson: e.target.value })}
          required
        />
        <button type="submit">Tạo báo cáo</button>
      </form>

      <div className="template-upload">
        <label>
          Tải mẫu .xlsx/.pptx lên: <input type="file" accept=".xlsx,.pptx" onChange={uploadTemplate} />
        </label>
        <p>Đã có: {templates.join(', ') || '(chưa có file nào)'}</p>
      </div>

      <DataTable
        columns={[
          { key: 'Title', label: 'Tiêu đề' },
          { key: 'ReportId', label: 'Mã' },
          { key: 'Domain', label: 'Domain' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => deleteReport(r)}>Xoá</button> }
        ]}
        rows={reports}
      />
    </div>
  );
}
