// pages/RealtimeEndpointsPage.jsx — Trang "Endpoint realtime": tạo/xoá định
// nghĩa endpoint (api.RealtimeEndpointDefs) — chọn nguồn đã có ở "Nguồn dữ
// liệu", DUYỆT bảng/cột THẬT của nguồn đó (không gõ tay tên bảng/cột — xem
// api-server/lib/schemaBrowser.js), chọn cột khoá + cột sắp xếp + các cột
// hiển thị. Sau khi lưu, endpoint hoạt động ngay qua 2 route dùng chung
// GET /api/v1/realtime/{endpoint}/{key} và .../list — không cần code mới.
//
// Bảng liên kết TUỲ CHỌN, TỐI ĐA 1 (cùng nguồn dữ liệu) — dùng khi dữ liệu
// trả về cần ghép từ 2 bảng (vd Vouchers.CustomerId -> Customers.CustomerName)
// mà không muốn báo cáo/đối tác tự ghép — api-server JOIN sẵn, trả về 1 dòng
// phẳng. Cần ghép nhiều hơn 1 bảng thì tạo VIEW phía nguồn thay vì dùng ô
// này — xem hướng_dẫn_báo_cáo.md.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';

const EMPTY_FORM = {
  endpoint: '', label: '', dataSourceId: '',
  schemaName: '', tableName: '', keyColumn: '', orderColumn: '', columns: [],
  useJoin: false, joinSchema: '', joinTable: '', joinType: 'LEFT',
  mainJoinColumn: '', lookupJoinColumn: '', joinColumns: [], isActive: true,
  keyStripLeadingChar: '', useFilter: false, filterColumn: '', filterOperator: '=', filterValue: ''
};

function toggleInList(list, value) {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function RealtimeEndpointsPage() {
  const { canEdit } = useAuth();
  const isAdmin = canEdit('realtime-endpoints');
  const [endpoints, setEndpoints] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);
  const [joinColumnsList, setJoinColumnsList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  // Sửa (bản 9.08) — TÁI DÙNG nguyên form tạo mới (cascading chọn
  // nguồn/bảng/cột đã có sẵn) thay vì viết modal riêng: editingEndpoint =
  // tên endpoint gốc (KHÔNG đổi được qua PUT, xem backend) khi đang sửa,
  // null khi đang tạo mới. Điền form từ dòng đang sửa -> các useEffect nạp
  // bảng/cột TỰ ĐỘNG chạy theo (đã theo dõi form.dataSourceId/schemaName/
  // tableName/joinSchema/joinTable từ trước), không cần state/effect riêng.
  const [editingEndpoint, setEditingEndpoint] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Chọn nhiều + xoá hàng loạt (bản 8.62) — khoá dòng là Endpoint (string),
  // khớp đúng field dùng trong URL xoá 1 dòng hiện có.
  const selection = useRowSelection(row => row.Endpoint);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/realtime-endpoints').then(setEndpoints).catch(err => setError(err.message));
  }
  useEffect(() => {
    reload();
    api.get('/data-sources').then(setDataSources).catch(err => setError(err.message));
  }, []);

  // Chọn nguồn -> nạp danh sách bảng/view thật (dùng chung cho bảng chính LẪN bảng liên kết, cùng 1 nguồn).
  useEffect(() => {
    if (!form.dataSourceId) { setTables([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables`).then(setTables).catch(err => setError(err.message));
  }, [form.dataSourceId]);

  // Chọn bảng chính -> nạp cột thật.
  useEffect(() => {
    if (!form.schemaName || !form.tableName) { setColumns([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.schemaName}/${form.tableName}/columns`).then(setColumns).catch(err => setError(err.message));
  }, [form.dataSourceId, form.schemaName, form.tableName]);

  // Chọn bảng liên kết -> nạp cột thật của bảng đó.
  useEffect(() => {
    if (!form.useJoin || !form.joinSchema || !form.joinTable) { setJoinColumnsList([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.joinSchema}/${form.joinTable}/columns`).then(setJoinColumnsList).catch(err => setError(err.message));
  }, [form.useJoin, form.dataSourceId, form.joinSchema, form.joinTable]);

  function pickTable(value) {
    const [schemaName, tableName] = value.split('.');
    setForm({ ...form, schemaName, tableName, keyColumn: '', orderColumn: '', columns: [] });
  }

  function pickJoinTable(value) {
    const [joinSchema, joinTable] = value.split('.');
    setForm({ ...form, joinSchema, joinTable, mainJoinColumn: '', lookupJoinColumn: '', joinColumns: [] });
  }

  // Điền form từ dòng đang sửa — parse 2 cột JSON (ColumnsJson/
  // JoinColumnsJson), suy useJoin từ JoinTable có/không. Các useEffect theo
  // dõi form.dataSourceId/schemaName/tableName/joinSchema/joinTable ở trên
  // TỰ ĐỘNG nạp bảng/cột thật ngay sau khi set form, không cần gọi tay.
  function openEdit(ep) {
    setError('');
    setEditingEndpoint(ep.Endpoint);
    setForm({
      endpoint: ep.Endpoint, label: ep.Label || '', dataSourceId: String(ep.DataSourceId),
      schemaName: ep.SchemaName, tableName: ep.TableName, keyColumn: ep.KeyColumn,
      orderColumn: ep.OrderColumn, columns: JSON.parse(ep.ColumnsJson || '[]'),
      useJoin: !!ep.JoinTable, joinSchema: ep.JoinSchema || '', joinTable: ep.JoinTable || '',
      joinType: ep.JoinType || 'LEFT', mainJoinColumn: ep.MainJoinColumn || '',
      lookupJoinColumn: ep.LookupJoinColumn || '', joinColumns: JSON.parse(ep.JoinColumnsJson || '[]'),
      isActive: !!ep.IsActive,
      keyStripLeadingChar: ep.KeyStripLeadingChar || '',
      useFilter: !!ep.FilterColumn, filterColumn: ep.FilterColumn || '',
      filterOperator: ep.FilterOperator || '=', filterValue: ep.FilterValue || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingEndpoint(null);
    setForm(EMPTY_FORM);
    setTables([]);
    setColumns([]);
    setJoinColumnsList([]);
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const body = { ...form, dataSourceId: Number(form.dataSourceId) };
      if (!body.useJoin) {
        body.joinSchema = null; body.joinTable = null; body.joinType = null;
        body.mainJoinColumn = null; body.lookupJoinColumn = null; body.joinColumns = [];
      }
      body.keyStripLeadingChar = body.keyStripLeadingChar || null;
      if (!body.useFilter) { body.filterColumn = null; body.filterOperator = null; body.filterValue = null; }
      const result = editingEndpoint
        ? await api.put(`/realtime-endpoints/${editingEndpoint}`, body)
        : await api.post('/realtime-endpoints', body);
      cancelEdit();
      reload();
      // Cột nối không unique trên nguồn -> lookup theo khoá có thể trả nhầm
      // dòng (xem lib/schemaBrowser.js isUniqueSingleColumn) — vẫn lưu bình
      // thường (không chặn), chỉ cảnh báo để admin tự quyết định.
      if (result.warning) alert(`⚠️ ${result.warning}`);
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  // Đối chiếu LẠI endpoint đã lưu với schema THẬT hiện tại của nguồn — bắt
  // được trường hợp bảng/cột nguồn bị đổi/xoá SAU khi endpoint đã tạo,
  // không đợi tới lúc đối tác ngoài gọi thật mới báo lỗi. Đọc-only nên
  // KHÔNG gói trong isAdmin.
  async function checkSchema(ep) {
    setCheckingId(ep.Endpoint);
    try {
      const result = await api.post(`/realtime-endpoints/${ep.Endpoint}/check-schema`);
      if (result.ok) alert(`✅ "${ep.Endpoint}": schema khớp với nguồn hiện tại.`);
      else alert(`⛔ "${ep.Endpoint}": ${result.error}`);
    } catch (err) { setError(err.message); } finally { setCheckingId(null); }
  }

  async function deleteEndpoint(ep) {
    if (!confirm(`Xoá endpoint "${ep.Endpoint}"? Mọi lời gọi /api/v1/realtime/${ep.Endpoint}/... sẽ lỗi 404 ngay sau đó.`)) return;
    setDeletingId(ep.Endpoint);
    try {
      await api.del(`/realtime-endpoints/${ep.Endpoint}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} endpoint đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/realtime-endpoints/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
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
        <form className="stacked-form wizard-form" onSubmit={submitForm}>
          {editingEndpoint && <p className="hint">Đang sửa endpoint "{editingEndpoint}" — tên endpoint không đổi được.</p>}
          <input placeholder="Tên endpoint (vd inventory, don-hang-dang-xu-ly)" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} disabled={!!editingEndpoint} required />
          <input placeholder="Nhãn hiển thị (vd Tồn kho)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />

          <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value, schemaName: '', tableName: '', keyColumn: '', orderColumn: '', columns: [], useJoin: false, joinSchema: '', joinTable: '', mainJoinColumn: '', lookupJoinColumn: '', joinColumns: [] })} required>
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

              <label className="checkbox-row">
                <input type="checkbox" checked={form.useJoin} onChange={(e) => setForm({ ...form, useJoin: e.target.checked })} />
                Thêm bảng/view liên kết (cùng nguồn) — vd lấy tên khách hàng từ mã khách hàng
              </label>

              {form.useJoin && (
                <fieldset>
                  <legend>Bảng/view liên kết</legend>
                  <select value={form.joinSchema && form.joinTable ? `${form.joinSchema}.${form.joinTable}` : ''} onChange={(e) => pickJoinTable(e.target.value)}>
                    <option value="">— Chọn bảng/view liên kết —</option>
                    {tables.map(t => <option key={`${t.schemaName}.${t.tableName}`} value={`${t.schemaName}.${t.tableName}`}>{t.schemaName}.{t.tableName} ({t.tableType === 'VIEW' ? 'view' : 'bảng'})</option>)}
                  </select>
                  <select value={form.joinType} onChange={(e) => setForm({ ...form, joinType: e.target.value })}>
                    <option value="LEFT">LEFT JOIN (không thấy dòng liên kết vẫn hiện, cột liên kết để trống)</option>
                    <option value="INNER">INNER JOIN (bắt buộc phải có dòng liên kết mới hiện kết quả)</option>
                  </select>
                  <label>Cột nối (bảng chính)
                    <select value={form.mainJoinColumn} onChange={(e) => setForm({ ...form, mainJoinColumn: e.target.value })}>
                      <option value="">—</option>
                      {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                    </select>
                  </label>
                  <label>Cột nối (bảng liên kết)
                    <select value={form.lookupJoinColumn} onChange={(e) => setForm({ ...form, lookupJoinColumn: e.target.value })}>
                      <option value="">—</option>
                      {joinColumnsList.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                    </select>
                  </label>
                  {joinColumnsList.length > 0 && (
                    <div className="column-picker">
                      <span>Cột lấy từ bảng liên kết (thêm vào kết quả)</span>
                      {joinColumnsList.map(c => (
                        <label key={c.columnName} className="checkbox-row">
                          <input type="checkbox" checked={form.joinColumns.includes(c.columnName)} onChange={() => setForm({ ...form, joinColumns: toggleInList(form.joinColumns, c.columnName) })} />
                          {c.columnName} ({c.dataType})
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}

              <fieldset>
                <legend>Mã quét/gửi lên thừa 1 ký tự đầu so với dữ liệu lưu? (tuỳ chọn)</legend>
                <input
                  placeholder={`Ký tự cần bỏ (vd "C") — để trống nếu không cần`}
                  value={form.keyStripLeadingChar}
                  maxLength={1}
                  onChange={(e) => setForm({ ...form, keyStripLeadingChar: e.target.value })}
                />
                <p className="hint">Vd mã quét "CE34000089252" nhưng CSDL lưu "E34000089252" — điền "C", hệ thống tự bỏ ký tự này (không phân biệt hoa/thường) trước khi tra, không cần đối tác tự xử lý.</p>
              </fieldset>

              <fieldset>
                <label className="checkbox-row">
                  <input type="checkbox" checked={form.useFilter} onChange={(e) => setForm({ ...form, useFilter: e.target.checked })} />
                  Chỉ cho xem các dòng thoả 1 điều kiện (vd chỉ voucher ĐÃ DÙNG)
                </label>
                {form.useFilter && (
                  <>
                    <p className="hint">Dòng KHÔNG thoả điều kiện sẽ báo "không tìm thấy" ở CẢ tra 1 khoá lẫn danh sách — không lộ ra dù biết đúng khoá.</p>
                    <select value={form.filterColumn} onChange={(e) => setForm({ ...form, filterColumn: e.target.value })} required>
                      <option value="">— Cột điều kiện —</option>
                      {columns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName} ({c.dataType})</option>)}
                    </select>
                    <select value={form.filterOperator} onChange={(e) => setForm({ ...form, filterOperator: e.target.value })}>
                      <option value="=">bằng (=)</option>
                      <option value="<>">khác (&lt;&gt;)</option>
                    </select>
                    <input placeholder="Giá trị (vd 0)" value={form.filterValue} onChange={(e) => setForm({ ...form, filterValue: e.target.value })} required />
                  </>
                )}
              </fieldset>
            </fieldset>
          )}

          {editingEndpoint && (
            <label className="checkbox-row">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Hoạt động
            </label>
          )}

          <div className="inline-actions">
            <button type="submit" disabled={creating}>
              {creating ? 'Đang lưu...' : (editingEndpoint ? 'Cập nhật endpoint' : 'Tạo endpoint')}
            </button>
            {editingEndpoint && <button type="button" onClick={cancelEdit}>Huỷ</button>}
          </div>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Label', label: 'Nhãn' },
          { key: 'Endpoint', label: 'Endpoint' },
          { key: 'DataSourceName', label: 'Nguồn' },
          { key: 'table', label: 'Bảng/view', render: (r) => `${r.SchemaName}.${r.TableName}` },
          { key: 'join', label: 'Bảng liên kết', render: (r) => (r.JoinTable ? `${r.JoinSchema}.${r.JoinTable}` : '—') },
          { key: 'KeyColumn', label: 'Cột khoá' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          { key: 'checkSchema', label: '', render: (r) => <button type="button" onClick={() => checkSchema(r)} disabled={checkingId === r.Endpoint}>{checkingId === r.Endpoint ? 'Đang kiểm tra...' : 'Kiểm tra schema'}</button> },
          isAdmin && {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => openEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => deleteEndpoint(r)} disabled={deletingId === r.Endpoint}>
                  {deletingId === r.Endpoint ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={endpoints}
        selection={isAdmin ? selection : null}
      />

      {isAdmin && selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}
    </div>
  );
}
