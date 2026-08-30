// pages/RealtimeEndpointsPage.jsx — Trang "Endpoint realtime": tạo/xoá định
// nghĩa endpoint (api.RealtimeEndpointDefs) — chọn nguồn đã có ở "Nguồn dữ
// liệu", DUYỆT bảng/cột THẬT của nguồn đó (không gõ tay tên bảng/cột — xem
// api-server/lib/schemaBrowser.js), chọn cột khoá + cột sắp xếp + các cột
// hiển thị. Sau khi lưu, endpoint hoạt động ngay qua 2 route dùng chung
// GET /api/v1/realtime/{endpoint}/{key} và .../list — không cần code mới.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = {
  endpoint: '', label: '', dataSourceId: '',
  schemaName: '', tableName: '', keyColumn: '', orderColumn: '', columns: []
};

function toggleInList(list, value) {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function RealtimeEndpointsPage() {
  const { isAdmin } = useAuth();
  const [endpoints, setEndpoints] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/realtime-endpoints').then(setEndpoints).catch(err => setError(err.message));
  }
  useEffect(() => {
    reload();
    api.get('/data-sources').then(setDataSources).catch(err => setError(err.message));
  }, []);

  // Chọn nguồn -> nạp danh sách bảng/view thật.
  useEffect(() => {
    if (!form.dataSourceId) { setTables([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables`).then(setTables).catch(err => setError(err.message));
  }, [form.dataSourceId]);

  // Chọn bảng -> nạp cột thật.
  useEffect(() => {
    if (!form.schemaName || !form.tableName) { setColumns([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.schemaName}/${form.tableName}/columns`).then(setColumns).catch(err => setError(err.message));
  }, [form.dataSourceId, form.schemaName, form.tableName]);

  function pickTable(value) {
    const [schemaName, tableName] = value.split('.');
    setForm({ ...form, schemaName, tableName, keyColumn: '', orderColumn: '', columns: [] });
  }

  async function createEndpoint(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/realtime-endpoints', { ...form, dataSourceId: Number(form.dataSourceId) });
      setForm(EMPTY_FORM);
      setTables([]);
      setColumns([]);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteEndpoint(ep) {
    if (!confirm(`Xoá endpoint "${ep.Endpoint}"? Mọi lời gọi /api/v1/realtime/${ep.Endpoint}/... sẽ lỗi 404 ngay sau đó.`)) return;
    try {
      await api.del(`/realtime-endpoints/${ep.Endpoint}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Endpoint realtime</h1>
      <p>
        Mỗi dòng dưới đây là một endpoint đang phục vụ qua{' '}
        <code>GET /api/v1/realtime/&#123;endpoint&#125;/&#123;key&#125;</code> (tra 1 khoá) và{' '}
        <code>GET /api/v1/realtime/&#123;endpoint&#125;/list</code> (danh sách phân trang) — thêm endpoint mới
        KHÔNG cần deploy lại, chỉ cần điền form bên dưới.
      </p>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="stacked-form wizard-form" onSubmit={createEndpoint}>
          <input placeholder="Tên endpoint (vd inventory, don-hang-dang-xu-ly)" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required />
          <input placeholder="Nhãn hiển thị (vd Tồn kho)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />

          <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value, schemaName: '', tableName: '', keyColumn: '', orderColumn: '', columns: [] })} required>
            <option value="">— Nguồn dữ liệu —</option>
            {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
          </select>

          {form.dataSourceId && (
            <select value={form.schemaName && form.tableName ? `${form.schemaName}.${form.tableName}` : ''} onChange={(e) => pickTable(e.target.value)} required>
              <option value="">— Bảng/view —</option>
              {tables.map(t => <option key={`${t.schemaName}.${t.tableName}`} value={`${t.schemaName}.${t.tableName}`}>{t.schemaName}.{t.tableName} ({t.tableType === 'VIEW' ? 'view' : 'bảng'})</option>)}
            </select>
          )}

          {columns.length > 0 && (
            <fieldset>
              <legend>Cột khoá tra cứu (KeyColumn)</legend>
              <select value={form.keyColumn} onChange={(e) => setForm({ ...form, keyColumn: e.target.value })} required>
                <option value="">— Chọn cột —</option>
                {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName} ({c.dataType})</option>)}
              </select>

              <legend>Cột sắp xếp cho danh sách (OrderColumn)</legend>
              <select value={form.orderColumn} onChange={(e) => setForm({ ...form, orderColumn: e.target.value })} required>
                <option value="">— Chọn cột —</option>
                {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName} ({c.dataType})</option>)}
              </select>

              <legend>Cột hiển thị trong kết quả</legend>
              <div className="column-picker">
                {columns.map(c => (
                  <label key={c.columnName} className="checkbox-row">
                    <input type="checkbox" checked={form.columns.includes(c.columnName)} onChange={() => setForm({ ...form, columns: toggleInList(form.columns, c.columnName) })} />
                    {c.columnName} ({c.dataType})
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <button type="submit">Tạo endpoint</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Label', label: 'Nhãn' },
          { key: 'Endpoint', label: 'Endpoint' },
          { key: 'DataSourceName', label: 'Nguồn' },
          { key: 'table', label: 'Bảng/view', render: (r) => `${r.SchemaName}.${r.TableName}` },
          { key: 'KeyColumn', label: 'Cột khoá' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          isAdmin && { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => deleteEndpoint(r)}>Xoá</button> }
        ].filter(Boolean)}
        rows={endpoints}
      />
    </div>
  );
}
