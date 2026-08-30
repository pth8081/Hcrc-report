// modules/system/report-catalog/ReportCatalogPanel.jsx — CRUD app.ReportCatalog.
// DefinitionJson sửa dạng textarea (JSON thô) — chưa có form có cấu trúc cho
// từng loại filter, đủ dùng ở bước khung này (xem rp-server/README.md
// mục "Thêm một báo cáo mới" cho ví dụ JSON). SourceType quyết định báo cáo
// lấy dữ liệu ở đâu — "directDb" (mặc định, chọn Nguồn dữ liệu bổ sung như
// trước) hoặc "apiReport"/"apiRealtime" (chọn Kết nối API Server + mã đích ở
// bên đó, xem tab "Kết nối API Server").
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const EMPTY_FORM = {
  reportId: '', title: '', domain: '', menuItemId: '', dataSourceId: '', definitionJson: '',
  sourceType: 'directDb', apiConnectionId: '', apiTarget: ''
};
const REPORT_MENU_CODES = new Set(['reports-kinh-doanh', 'reports-van-hanh', 'reports-mua-hang']);
const SOURCE_TYPE_LABELS = {
  directDb: 'Trực tiếp CSDL',
  apiReport: 'Qua API Server — Báo cáo tổng hợp',
  apiRealtime: 'Qua API Server — Realtime'
};

export default function ReportCatalogPanel() {
  const [reports, setReports] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [apiConnections, setApiConnections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/system/report-catalog').then(setReports).catch(err => setError(err.message));
    api.get('/system/menu-items').then(rows => setMenuItems(rows.filter(m => REPORT_MENU_CODES.has(m.Code)))).catch(err => setError(err.message));
    api.get('/system/data-sources').then(setDataSources).catch(err => setError(err.message));
    api.get('/system/api-connections').then(setApiConnections).catch(err => setError(err.message));
    api.get('/system/report-catalog/templates').then(setTemplates).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createReport(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/report-catalog', {
        ...form,
        menuItemId: Number(form.menuItemId),
        dataSourceId: form.sourceType === 'directDb' && form.dataSourceId ? Number(form.dataSourceId) : null,
        apiConnectionId: form.sourceType !== 'directDb' && form.apiConnectionId ? Number(form.apiConnectionId) : null,
        apiTarget: form.sourceType !== 'directDb' ? form.apiTarget : null
      });
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

        <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
          {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        {form.sourceType === 'directDb' ? (
          <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value })}>
            <option value="">Data Warehouse mặc định</option>
            {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
          </select>
        ) : (
          <>
            <select value={form.apiConnectionId} onChange={(e) => setForm({ ...form, apiConnectionId: e.target.value })} required>
              <option value="">— Kết nối API Server —</option>
              {apiConnections.map(c => <option key={c.Id} value={c.Id}>{c.Name}</option>)}
            </select>
            <input
              placeholder={form.sourceType === 'apiReport' ? 'ReportId đã đăng ký bên api.ReportCatalog' : 'Endpoint realtime (vd inventory, loyalty, vouchers)'}
              value={form.apiTarget}
              onChange={(e) => setForm({ ...form, apiTarget: e.target.value })}
              required
            />
          </>
        )}

        <textarea
          placeholder={
            form.sourceType === 'directDb'
              ? '{"id": "...", "title": "...", "domain": "...", "filters": [...], "columns": ["entityCode", "measures.doanhThu", {"key": "tyLeLoiNhuan", "label": "Tỷ lệ lợi nhuận (%)", "formula": "ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)"}], "export": ["excel","pdf"]}'
              : '{"id": "...", "title": "...", "domain": "...", "filters": [...]} — cột hiển thị lấy từ API Server, không cần khai "columns" ở đây'
          }
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
          { key: 'SourceType', label: 'Nguồn', render: (r) => SOURCE_TYPE_LABELS[r.SourceType] || r.SourceType },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => deleteReport(r)}>Xoá</button> }
        ]}
        rows={reports}
      />
    </div>
  );
}
