// pages/ConsumersPage.jsx — Trang "Đối tác": CRUD api.ApiConsumers. API key
// gốc chỉ hiện MỘT LẦN lúc tạo/luân chuyển (xem api-server/routes/admin/consumers.js)
// — hiện trong banner, không lưu lại ở đâu trên trình duyệt.
//
// "Báo cáo được gọi" (api.ConsumerReportAccess) — MẶC ĐỊNH một đối tác mới
// KHÔNG gọi được báo cáo nào dù có scope "reports" hợp lệ, phải gán rõ ràng ở
// đây (xem routes/v1/reports.js). Khác GET/PUT report-access bên rp-server
// (app.RoleReportAccess) ở CHỦ THỂ (đối tác API thay vì vai trò người dùng),
// cùng cơ chế XOÁ HẾT + GÁN LẠI.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const SCOPE_OPTIONS = ['reports', 'realtime'];
const EMPTY_FORM = { name: '', scopes: [], rateLimitPerMinute: 120, allowedIps: '' };

export default function ConsumersPage() {
  const { isAdmin } = useAuth();
  const [consumers, setConsumers] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // consumer đang sửa, hoặc null
  const [accessFor, setAccessFor] = useState(null); // consumer đang gán báo cáo, hoặc null
  const [accessReportIds, setAccessReportIds] = useState([]);
  const [revealedKey, setRevealedKey] = useState(''); // key vừa tạo/luân chuyển
  const [error, setError] = useState('');

  function reload() {
    api.get('/consumers').then(setConsumers).catch(err => setError(err.message));
    api.get('/report-catalog').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function openReportAccess(consumer) {
    setError('');
    try {
      const { reportIds } = await api.get(`/consumers/${consumer.Id}/report-access`);
      setAccessReportIds(reportIds);
      setAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleReportAccess(reportId) {
    setAccessReportIds(list => (list.includes(reportId) ? list.filter(r => r !== reportId) : [...list, reportId]));
  }

  async function saveReportAccess() {
    try {
      await api.put(`/consumers/${accessFor.Id}/report-access`, { reportIds: accessReportIds });
      setAccessFor(null);
    } catch (err) { setError(err.message); }
  }

  function toggleScope(scopeList, scope) {
    return scopeList.includes(scope) ? scopeList.filter(s => s !== scope) : [...scopeList, scope];
  }

  async function createConsumer(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await api.post('/consumers', form);
      setRevealedKey(result.apiKey);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function rotateKey(consumer) {
    if (!confirm(`Luân chuyển key mới cho "${consumer.Name}"? Key cũ sẽ ngừng hoạt động ngay.`)) return;
    try {
      const result = await api.post(`/consumers/${consumer.Id}/rotate`);
      setRevealedKey(result.apiKey);
    } catch (err) { setError(err.message); }
  }

  async function saveEdit() {
    try {
      await api.put(`/consumers/${editing.Id}`, {
        name: editing.Name,
        scopes: editing.Scopes,
        rateLimitPerMinute: editing.RateLimitPerMinute,
        allowedIps: editing.AllowedIps || '',
        isActive: editing.IsActive
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteConsumer(consumer) {
    if (!confirm(`Xoá đối tác "${consumer.Name}"? Không hoàn tác được.`)) return;
    try {
      await api.del(`/consumers/${consumer.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Đối tác API</h1>
      {error && <p className="form-error">{error}</p>}

      {revealedKey && (
        <div className="key-banner">
          <p><strong>API key mới — chỉ hiện đúng một lần, sao chép ngay:</strong></p>
          <code>{revealedKey}</code>
          <button type="button" onClick={() => setRevealedKey('')}>Đã lưu, đóng lại</button>
        </div>
      )}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createConsumer}>
          <input placeholder="Tên đối tác" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="scope-picker">
            {SCOPE_OPTIONS.map(scope => (
              <label key={scope} className="checkbox-row">
                <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => setForm({ ...form, scopes: toggleScope(form.scopes, scope) })} />
                {scope}
              </label>
            ))}
          </div>
          <input type="number" placeholder="Giới hạn/phút" value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: Number(e.target.value) })} />
          <input
            placeholder="IP cho phép, phân tách dấu phẩy (để trống = không giới hạn), vd 203.0.113.10,198.51.100.0/24"
            value={form.allowedIps}
            onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
          />
          <button type="submit">Tạo đối tác</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Scopes', label: 'Phạm vi', render: (c) => c.Scopes.join(', ') },
          { key: 'RateLimitPerMinute', label: 'Giới hạn/phút' },
          { key: 'AllowedIps', label: 'IP cho phép', render: (c) => c.AllowedIps || 'Không giới hạn' },
          { key: 'IsActive', label: 'Trạng thái', render: (c) => (c.IsActive ? 'Hoạt động' : 'Đã tắt') },
          { key: 'LastUsedAt', label: 'Dùng gần nhất', render: (c) => (c.LastUsedAt ? new Date(c.LastUsedAt).toLocaleString('vi-VN') : '—') },
          isAdmin && {
            key: 'actions', label: '', render: (c) => (
              <>
                <button type="button" onClick={() => setEditing({ ...c })}>Sửa</button>{' '}
                <button type="button" onClick={() => openReportAccess(c)}>Báo cáo được gọi</button>{' '}
                <button type="button" onClick={() => rotateKey(c)}>Luân chuyển key</button>{' '}
                <button type="button" onClick={() => deleteConsumer(c)}>Xoá</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={consumers}
      />

      {editing && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa — {editing.Name}</h3>
            <input value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
            <div className="scope-picker">
              {SCOPE_OPTIONS.map(scope => (
                <label key={scope} className="checkbox-row">
                  <input type="checkbox" checked={editing.Scopes.includes(scope)} onChange={() => setEditing({ ...editing, Scopes: toggleScope(editing.Scopes, scope) })} />
                  {scope}
                </label>
              ))}
            </div>
            <input type="number" value={editing.RateLimitPerMinute} onChange={(e) => setEditing({ ...editing, RateLimitPerMinute: Number(e.target.value) })} />
            <input
              placeholder="IP cho phép, phân tách dấu phẩy (để trống = không giới hạn)"
              value={editing.AllowedIps || ''}
              onChange={(e) => setEditing({ ...editing, AllowedIps: e.target.value })}
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.IsActive} onChange={(e) => setEditing({ ...editing, IsActive: e.target.checked })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit}>Lưu</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {accessFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Báo cáo được gọi — {accessFor.Name}</h3>
            <p>
              Mặc định đối tác KHÔNG gọi được báo cáo nào dù có scope <code>reports</code> — chỉ những
              báo cáo tick dưới đây mới gọi được qua <code>GET /api/v1/reports/:reportId/run</code>.
            </p>
            {!reports.length && <p className="empty-message">Chưa có báo cáo nào trong danh mục — thêm ở trang "Báo cáo" trước.</p>}
            <div className="scope-picker">
              {reports.map(r => (
                <label key={r.ReportId} className="checkbox-row">
                  <input type="checkbox" checked={accessReportIds.includes(r.ReportId)} onChange={() => toggleReportAccess(r.ReportId)} />
                  {r.Title} ({r.ReportId})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveReportAccess}>Lưu</button>
              <button type="button" onClick={() => setAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
