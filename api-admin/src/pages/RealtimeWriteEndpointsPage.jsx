// pages/RealtimeWriteEndpointsPage.jsx — Trang "Endpoint ghi": tạo/xoá định
// nghĩa endpoint GHI ngược lại nguồn dữ liệu vận hành (api.RealtimeWriteEndpointDefs)
// — chọn nguồn đã có ở "Nguồn dữ liệu", duyệt bảng/cột THẬT (không gõ tay),
// chọn cột khoá + cột trạng thái + giá trị đánh dấu "đã dùng". Sau khi lưu,
// endpoint hoạt động ngay qua POST /api/v1/realtime-write/{endpoint}/{key}
// — không cần code mới.
//
// KHÁC HẲN "Endpoint realtime" (chỉ đọc) — đây là chỗ DUY NHẤT trong toàn
// hệ thống UPDATE ngược lại nguồn (vd voucher dùng 1 lần là thu luôn), nên
// chỉ hỗ trợ đúng 1 thao tác đơn giản: đổi 1 cột trạng thái của 1 dòng
// sang 1 giá trị cố định — không JOIN, không nhiều cột.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { endpoint: '', label: '', dataSourceId: '', schemaName: '', tableName: '', keyColumn: '', statusColumn: '', usedValue: '' };

export default function RealtimeWriteEndpointsPage() {
  const { isAdmin } = useAuth();
  const [endpoints, setEndpoints] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/realtime-write-endpoints').then(setEndpoints).catch(err => setError(err.message));
  }
  useEffect(() => {
    reload();
    api.get('/data-sources').then(setDataSources).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!form.dataSourceId) { setTables([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables`).then(setTables).catch(err => setError(err.message));
  }, [form.dataSourceId]);

  useEffect(() => {
    if (!form.schemaName || !form.tableName) { setColumns([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.schemaName}/${form.tableName}/columns`).then(setColumns).catch(err => setError(err.message));
  }, [form.dataSourceId, form.schemaName, form.tableName]);

  function pickTable(value) {
    const [schemaName, tableName] = value.split('.');
    setForm({ ...form, schemaName, tableName, keyColumn: '', statusColumn: '' });
  }

  async function createEndpoint(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/realtime-write-endpoints', { ...form, dataSourceId: Number(form.dataSourceId) });
      setForm(EMPTY_FORM);
      setTables([]);
      setColumns([]);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function checkSchema(ep) {
    try {
      const result = await api.post(`/realtime-write-endpoints/${ep.Endpoint}/check-schema`);
      if (result.ok) alert(`✅ "${ep.Endpoint}": schema khớp với nguồn hiện tại.`);
      else alert(`⛔ "${ep.Endpoint}": ${result.error}`);
    } catch (err) { setError(err.message); }
  }

  async function deleteEndpoint(ep) {
    if (!confirm(`Xoá endpoint "${ep.Endpoint}"? Mọi lời gọi POST /api/v1/realtime-write/${ep.Endpoint}/... sẽ lỗi 404 ngay sau đó.`)) return;
    try {
      await api.del(`/realtime-write-endpoints/${ep.Endpoint}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Endpoint ghi</h1>
      <p>
        Mỗi dòng dưới đây phục vụ qua{' '}
        <code>POST /api/v1/realtime-write/&#123;endpoint&#125;/&#123;key&#125;</code> — đối tác gọi để BÁO đã
        dùng 1 mã (vd voucher), server GHI THẲNG "Cột trạng thái" = "Giá trị đã dùng" cho đúng dòng khớp
        "Cột khoá", ngay trên bảng nguồn (KHÔNG qua Data Warehouse, KHÔNG qua bảng riêng nào khác). Gọi
        trùng (đối tác thử lại) không báo lỗi, chỉ báo "đã sử dụng trước đó" — không ghi đè lần 2.
      </p>
      <p className="form-warning">
        ⚠️ Đây là endpoint DUY NHẤT trong toàn hệ thống được phép ghi ngược lại nguồn dữ liệu vận hành —
        kiểm tra kỹ đúng bảng/cột/giá trị trước khi lưu, và chỉ cấp quyền gọi (trang "Đối tác" → "Ghi
        được gọi") cho đối tác thật sự cần.
      </p>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="stacked-form wizard-form" onSubmit={createEndpoint}>
          <input placeholder="Tên endpoint (vd vouchers-redeem)" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required />
          <input placeholder="Nhãn hiển thị (vd Đánh dấu voucher đã dùng)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />

          <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value, schemaName: '', tableName: '', keyColumn: '', statusColumn: '' })} required>
            <option value="">— Nguồn dữ liệu —</option>
            {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
          </select>

          {form.dataSourceId && (
            <select value={form.schemaName && form.tableName ? `${form.schemaName}.${form.tableName}` : ''} onChange={(e) => pickTable(e.target.value)} required>
              <option value="">— Bảng —</option>
              {tables.map(t => <option key={`${t.schemaName}.${t.tableName}`} value={`${t.schemaName}.${t.tableName}`}>{t.schemaName}.{t.tableName} ({t.tableType === 'VIEW' ? 'view' : 'bảng'})</option>)}
            </select>
          )}

          {columns.length > 0 && (
            <fieldset>
              <legend>Cột khoá (giá trị đối tác gửi trong URL, vd mã voucher)</legend>
              <select value={form.keyColumn} onChange={(e) => setForm({ ...form, keyColumn: e.target.value })} required>
                <option value="">— Chọn cột —</option>
                {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName} ({c.dataType})</option>)}
              </select>

              <legend>Cột trạng thái (sẽ bị GHI ĐÈ)</legend>
              <select value={form.statusColumn} onChange={(e) => setForm({ ...form, statusColumn: e.target.value })} required>
                <option value="">— Chọn cột —</option>
                {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName} ({c.dataType})</option>)}
              </select>

              <label>Giá trị đánh dấu "đã dùng" (gán vào cột trạng thái ở trên)
                <input placeholder="vd X, 9, DONE..." value={form.usedValue} onChange={(e) => setForm({ ...form, usedValue: e.target.value })} required />
              </label>
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
          { key: 'table', label: 'Bảng', render: (r) => `${r.SchemaName}.${r.TableName}` },
          { key: 'KeyColumn', label: 'Cột khoá' },
          { key: 'status', label: 'Trạng thái -> đã dùng', render: (r) => `${r.StatusColumn} = "${r.UsedValue}"` },
          { key: 'IsActive', label: 'Hoạt động', render: (r) => (r.IsActive ? 'Có' : 'Tắt') },
          { key: 'checkSchema', label: '', render: (r) => <button type="button" onClick={() => checkSchema(r)}>Kiểm tra schema</button> },
          isAdmin && { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => deleteEndpoint(r)}>Xoá</button> }
        ].filter(Boolean)}
        rows={endpoints}
      />
    </div>
  );
}
