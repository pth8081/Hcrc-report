// pages/ConsumersPage.jsx — Trang "Đối tác": CRUD api.ApiConsumers. Chọn
// AuthMethod lúc TẠO, không đổi được sau đó (đổi = tạo đối tác mới, xem
// api-server/routes/admin/consumers.js). Bí mật (apiKey/clientSecret/
// hmacSecret) chỉ hiện MỘT LẦN lúc tạo/luân chuyển (banner) — ClientId/
// HmacKeyId thì hiện thường xuyên trong bảng (định danh CÔNG KHAI, không
// phải bí mật).
//
// "Báo cáo được gọi" (api.ConsumerReportAccess) — MẶC ĐỊNH một đối tác mới
// KHÔNG gọi được báo cáo nào dù có scope "reports" hợp lệ, phải gán rõ ràng ở
// đây (xem routes/v1/reports.js). Khác GET/PUT report-access bên rp-server
// (app.RoleReportAccess) ở CHỦ THỂ (đối tác API thay vì vai trò người dùng),
// cùng cơ chế XOÁ HẾT + GÁN LẠI.
//
// "Realtime được gọi" (api.ConsumerRealtimeAccess) — CÙNG khuôn, cho endpoint
// realtime thay vì báo cáo (xem routes/v1/realtime.js). Quan trọng khi nhiều
// chi nhánh/siêu thị dùng chung API Server — không gán riêng, 1 đối tác có
// scope "realtime" đọc được TOÀN BỘ endpoint của MỌI chi nhánh.
//
// "Ghi được gọi" (api.ConsumerRealtimeWriteAccess) — CÙNG khuôn nhưng BẢNG
// RIÊNG hoàn toàn, cho endpoint GHI ngược lại nguồn (xem
// routes/v1/realtimeWrite.js, trang "Endpoint ghi") — có quyền đọc 1
// endpoint KHÔNG mặc nhiên ghi được endpoint cùng tên, phải gán riêng.
//
// "voucherCheck"/"voucherRedeem" — scope RIÊNG cho app "HCRC Voucher
// Redemption" (routes/v1/vouchers.js), KHÔNG dùng chung "realtime"/
// "realtimeWrite" (rà soát bảo mật phát hiện: cấp "realtime" cho MỘT MỤC
// ĐÍCH KHÁC (vd đọc endpoint doanh thu) vô tình cấp luôn quyền gọi
// /vouchers/check nếu dùng chung scope — 2 tính năng không liên quan lại
// chia sẻ cùng 1 cổng quyền). Đối tác voucher cần CẢ HAI (check trước,
// redeem sau) — đối tác dùng "realtime"/"realtimeWrite" cho mục đích khác
// (endpoint động qua api.RealtimeEndpointDefs) KHÔNG còn tự động gọi được
// voucher nữa kể từ bản này; đối tác voucher ĐANG hoạt động (được cấp
// "realtime"+"realtimeWrite" từ trước) cần admin vào đây tick thêm 2 scope
// mới TRƯỚC KHI/CÙNG LÚC nâng cấp api-server, không hệ thống tự chuyển.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';

const SCOPE_OPTIONS = ['reports', 'realtime', 'realtimeWrite', 'voucherCheck', 'voucherRedeem', 'voucherRedeemedFeed'];
const EMPTY_FORM = { name: '', authMethod: 'apiKey', scopes: [], rateLimitPerMinute: 120, allowedIps: '' };
const AUTH_METHOD_LABELS = {
  apiKey: 'API key tĩnh',
  oauth2: 'OAuth2 Client Credentials',
  hmac: 'HMAC ký từng request'
};

// Sao chép vào clipboard — dùng API chuẩn khi có (context https, hoặc
// localhost lúc dev); nếu trình duyệt chặn (http không an toàn) thì báo lỗi
// rõ ràng thay vì im lặng không làm gì, để người dùng biết tự bôi đen copy.
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    alert(`Không tự sao chép được (trình duyệt chặn) — bôi đen "${label}" và Ctrl+C thủ công.`);
  }
}

function CopyableSecret({ value, label }) {
  return (
    <span className="inline-actions">
      <code>{value}</code>
      <button type="button" onClick={() => copyToClipboard(value, label)}>Sao chép</button>
    </span>
  );
}

// Hiện đúng bí mật vừa được cấp — hình dạng response khác nhau theo authMethod.
// CHỈ hiện đúng 1 lần lúc này — hệ thống lưu bí mật dưới dạng BĂM (SHA-256/
// bcrypt/mã hoá 1 chiều tương đương), không có cách nào đọc lại bí mật CŨ sau
// khi đóng banner này (giống mật khẩu đăng nhập) — mất/quên thì phải bấm
// "Luân chuyển bí mật" để cấp bí mật MỚI (bí mật cũ ngừng hoạt động ngay).
function RevealedCredentials({ creds, onClose }) {
  return (
    <div className="key-banner">
      <p><strong>Thông tin xác thực mới — chỉ hiện đúng một lần, sao chép ngay:</strong></p>
      {creds.authMethod === 'apiKey' && <CopyableSecret value={creds.apiKey} label="API key" />}
      {creds.authMethod === 'oauth2' && (
        <>
          <p>Client ID (công khai, đối tác dùng lâu dài — không đổi khi luân chuyển): <code>{creds.clientId}</code></p>
          <p>Client Secret: <CopyableSecret value={creds.clientSecret} label="Client Secret" /></p>
        </>
      )}
      {creds.authMethod === 'hmac' && (
        <>
          <p>Key ID (công khai, đối tác dùng lâu dài — không đổi khi luân chuyển): <code>{creds.hmacKeyId}</code></p>
          <p>Secret: <CopyableSecret value={creds.hmacSecret} label="Secret" /></p>
        </>
      )}
      <p className="hint">Đóng lại là KHÔNG xem lại được nữa (hệ thống chỉ lưu bản băm, không lưu bản gốc) — quên thì phải "Luân chuyển bí mật" để cấp bí mật mới.</p>
      <button type="button" onClick={onClose}>Đã lưu, đóng lại</button>
    </div>
  );
}

export default function ConsumersPage() {
  const { canEdit } = useAuth();
  const isAdmin = canEdit('consumers');
  const [consumers, setConsumers] = useState([]);
  const [reports, setReports] = useState([]);
  const [stores, setStores] = useState([]); // {maDiem, tenSieuThi} — bản 10.54, "Siêu thị được lấy"
  const [endpoints, setEndpoints] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // consumer đang sửa, hoặc null
  const [duplicating, setDuplicating] = useState(null); // { consumer, newName } đang nhân bản, hoặc null
  const [savingDuplicate, setSavingDuplicate] = useState(false);
  const [accessFor, setAccessFor] = useState(null); // consumer đang gán báo cáo, hoặc null
  const [accessReportIds, setAccessReportIds] = useState([]);
  const [storeAccessFor, setStoreAccessFor] = useState(null); // consumer đang gán giới hạn siêu thị, hoặc null
  const [accessMaDiems, setAccessMaDiems] = useState([]);
  const [realtimeAccessFor, setRealtimeAccessFor] = useState(null); // consumer đang gán endpoint realtime, hoặc null
  const [accessEndpoints, setAccessEndpoints] = useState([]);
  const [writeEndpoints, setWriteEndpoints] = useState([]);
  const [writeAccessFor, setWriteAccessFor] = useState(null); // consumer đang gán endpoint ghi, hoặc null
  const [accessWriteEndpoints, setAccessWriteEndpoints] = useState([]);
  const [voucherConfigs, setVoucherConfigs] = useState([]);
  const [voucherAccessFor, setVoucherAccessFor] = useState(null); // consumer đang gán cấu hình Voucher, hoặc null
  const [accessVoucherConfigs, setAccessVoucherConfigs] = useState([]);
  const [savingVoucherAccess, setSavingVoucherAccess] = useState(false);
  // "Trường dữ liệu trả về" cho API "Danh sách voucher đã thu hồi" (bản
  // 10.7, theo yêu cầu người dùng — tự chọn cấu hình trường nào từng đối
  // tác được lấy).
  const [redeemedFeedFieldsFor, setRedeemedFeedFieldsFor] = useState(null); // consumer đang cấu hình, hoặc null
  const [redeemedFeedFields, setRedeemedFeedFields] = useState([]);
  const [redeemedFeedAllFields, setRedeemedFeedAllFields] = useState([]);
  const [savingRedeemedFeedFields, setSavingRedeemedFeedFields] = useState(false);
  const [revealedCreds, setRevealedCreds] = useState(null); // { authMethod, ...bí mật } vừa tạo/luân chuyển
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [rotatingId, setRotatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [savingReportAccess, setSavingReportAccess] = useState(false);
  const [savingStoreAccess, setSavingStoreAccess] = useState(false);
  const [savingRealtimeAccess, setSavingRealtimeAccess] = useState(false);
  const [savingWriteAccess, setSavingWriteAccess] = useState(false);
  // Chọn nhiều + xoá hàng loạt (bản 8.62).
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/consumers').then(setConsumers).catch(err => setError(err.message));
    api.get('/report-catalog').then(setReports).catch(err => setError(err.message));
    api.get('/consumers/store-options').then(setStores).catch(err => setError(err.message));
    api.get('/realtime-endpoints').then(setEndpoints).catch(err => setError(err.message));
    api.get('/realtime-write-endpoints').then(setWriteEndpoints).catch(err => setError(err.message));
    api.get('/voucher-settings').then(list => setVoucherConfigs(list.filter(c => c.ConfigKey !== 'default'))).catch(err => setError(err.message));
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

  // "Siêu thị được lấy" (bản 10.54, theo yêu cầu người dùng — đối tác CHỈ
  // được lấy tồn kho của NHỮNG siêu thị cụ thể, "tích chọn tìm kiếm... hiển
  // thị tên siêu thị") — CÙNG khuôn openReportAccess/saveReportAccess ở
  // trên, khác Ở Ý NGHĨA RỖNG: không tick gì = KHÔNG giới hạn (thấy TOÀN
  // BỘ), tick cụ thể = RÚT LẠI còn đúng các siêu thị đó (xem
  // api-server/routes/admin/consumers.js).
  async function openStoreAccess(consumer) {
    setError('');
    try {
      const { maDiems } = await api.get(`/consumers/${consumer.Id}/store-access`);
      setAccessMaDiems(maDiems);
      setStoreAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  async function saveStoreAccess() {
    setSavingStoreAccess(true);
    try {
      await api.put(`/consumers/${storeAccessFor.Id}/store-access`, { maDiems: accessMaDiems });
      setStoreAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingStoreAccess(false); }
  }

  async function saveReportAccess() {
    setSavingReportAccess(true);
    try {
      await api.put(`/consumers/${accessFor.Id}/report-access`, { reportIds: accessReportIds });
      setAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingReportAccess(false); }
  }

  async function openRealtimeAccess(consumer) {
    setError('');
    try {
      const { endpoints: current } = await api.get(`/consumers/${consumer.Id}/realtime-access`);
      setAccessEndpoints(current);
      setRealtimeAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleEndpointAccess(endpoint) {
    setAccessEndpoints(list => (list.includes(endpoint) ? list.filter(e => e !== endpoint) : [...list, endpoint]));
  }

  async function saveRealtimeAccess() {
    setSavingRealtimeAccess(true);
    try {
      await api.put(`/consumers/${realtimeAccessFor.Id}/realtime-access`, { endpoints: accessEndpoints });
      setRealtimeAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingRealtimeAccess(false); }
  }

  async function openWriteAccess(consumer) {
    setError('');
    try {
      const { endpoints: current } = await api.get(`/consumers/${consumer.Id}/write-access`);
      setAccessWriteEndpoints(current);
      setWriteAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleWriteEndpointAccess(endpoint) {
    setAccessWriteEndpoints(list => (list.includes(endpoint) ? list.filter(e => e !== endpoint) : [...list, endpoint]));
  }

  async function saveWriteAccess() {
    setSavingWriteAccess(true);
    try {
      await api.put(`/consumers/${writeAccessFor.Id}/write-access`, { endpoints: accessWriteEndpoints });
      setWriteAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingWriteAccess(false); }
  }

  async function openVoucherAccess(consumer) {
    setError('');
    try {
      const { configKeys } = await api.get(`/consumers/${consumer.Id}/voucher-access`);
      setAccessVoucherConfigs(configKeys);
      setVoucherAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleVoucherConfigAccess(configKey) {
    setAccessVoucherConfigs(list => (list.includes(configKey) ? list.filter(k => k !== configKey) : [...list, configKey]));
  }

  async function saveVoucherAccess() {
    setSavingVoucherAccess(true);
    try {
      await api.put(`/consumers/${voucherAccessFor.Id}/voucher-access`, { configKeys: accessVoucherConfigs });
      setVoucherAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingVoucherAccess(false); }
  }

  async function openRedeemedFeedFields(consumer) {
    setError('');
    try {
      const { fields, allFields } = await api.get(`/consumers/${consumer.Id}/voucher-redeemed-fields`);
      setRedeemedFeedFields(fields);
      setRedeemedFeedAllFields(allFields);
      setRedeemedFeedFieldsFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleRedeemedFeedField(field) {
    setRedeemedFeedFields(list => (list.includes(field) ? list.filter(f => f !== field) : [...list, field]));
  }

  async function saveRedeemedFeedFields() {
    setSavingRedeemedFeedFields(true);
    try {
      await api.put(`/consumers/${redeemedFeedFieldsFor.Id}/voucher-redeemed-fields`, { fields: redeemedFeedFields });
      setRedeemedFeedFieldsFor(null);
    } catch (err) { setError(err.message); } finally { setSavingRedeemedFeedFields(false); }
  }

  function toggleScope(scopeList, scope) {
    return scopeList.includes(scope) ? scopeList.filter(s => s !== scope) : [...scopeList, scope];
  }

  async function createConsumer(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const result = await api.post('/consumers', form);
      setRevealedCreds(result);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  async function rotateSecret(consumer) {
    if (!confirm(`Luân chuyển bí mật mới cho "${consumer.Name}"? Bí mật cũ sẽ ngừng hoạt động ngay.`)) return;
    setRotatingId(consumer.Id);
    try {
      const result = await api.post(`/consumers/${consumer.Id}/rotate`);
      setRevealedCreds(result);
    } catch (err) { setError(err.message); } finally { setRotatingId(null); }
  }

  function openDuplicate(consumer) {
    setDuplicating({ consumer, newName: `${consumer.Name} (bản sao)` });
  }

  // Nhân bản (bản 9.22, theo yêu cầu người dùng) — route backend LUÔN cấp bí
  // mật MỚI (không copy ApiKeyHash/ClientSecretHash/HmacSecretEncrypted cũ),
  // tránh 2 đối tác dùng chung 1 bí mật — hiện banner "chỉ 1 lần" giống lúc
  // tạo mới/luân chuyển.
  async function saveDuplicate(e) {
    e.preventDefault();
    setError('');
    setSavingDuplicate(true);
    try {
      const result = await api.post(`/consumers/${duplicating.consumer.Id}/duplicate`, { name: duplicating.newName });
      setRevealedCreds(result);
      setDuplicating(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingDuplicate(false); }
  }

  async function saveEdit() {
    setSavingEdit(true);
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
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  // Bật/Tắt nhanh 1 cú bấm — không cần mở modal Sửa chỉ để đổi mỗi cờ này.
  async function toggleActive(consumer) {
    setTogglingId(consumer.Id);
    try {
      await api.put(`/consumers/${consumer.Id}`, {
        name: consumer.Name,
        scopes: consumer.Scopes,
        rateLimitPerMinute: consumer.RateLimitPerMinute,
        allowedIps: consumer.AllowedIps || '',
        isActive: !consumer.IsActive
      });
      reload();
    } catch (err) { setError(err.message); } finally { setTogglingId(null); }
  }

  async function deleteConsumer(consumer) {
    if (!confirm(`Xoá đối tác "${consumer.Name}"? Không hoàn tác được.`)) return;
    setDeletingId(consumer.Id);
    try {
      await api.del(`/consumers/${consumer.Id}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} đối tác đã chọn? Không hoàn tác được.`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/consumers/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  return (
    <div className="page page--wide">
      <div className="page-header">
        <div>
          <h1><span>🤝</span> Đối tác API</h1>
          <p>Quản lý đối tác gọi API, phương thức xác thực (API key/OAuth2/HMAC) và giới hạn truy cập.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}

      {revealedCreds && <RevealedCredentials creds={revealedCreds} onClose={() => setRevealedCreds(null)} />}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createConsumer}>
          <input placeholder="Tên đối tác" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select value={form.authMethod} onChange={(e) => setForm({ ...form, authMethod: e.target.value })}>
            {Object.entries(AUTH_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {form.authMethod === 'oauth2' && (
            <p className="hint">Đối tác đổi Client ID/Secret lấy access token tại <code>POST /api/v1/oauth/token</code> (grant_type=client_credentials), rồi gọi API kèm <code>Authorization: Bearer &lt;token&gt;</code>.</p>
          )}
          {form.authMethod === 'hmac' && (
            <p className="hint">Đối tác tự ký từng request: HMAC-SHA256(secret, <code>METHOD\npath\ntimestamp\nbody</code>), gửi kèm header <code>X-Key-Id</code>/<code>X-Timestamp</code>/<code>X-Signature</code> (hex).</p>
          )}
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
          <button type="submit" disabled={creating}>{creating ? 'Đang tạo...' : 'Tạo đối tác'}</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'AuthMethod', label: 'Xác thực', render: (c) => AUTH_METHOD_LABELS[c.AuthMethod] || c.AuthMethod },
          { key: 'PublicId', label: 'Định danh công khai', render: (c) => c.ClientId || c.HmacKeyId || '—' },
          { key: 'Scopes', label: 'Phạm vi', render: (c) => (c.Scopes || []).join(', ') },
          { key: 'AllowedIps', label: 'IP cho phép', render: (c) => c.AllowedIps || 'Không giới hạn' },
          { key: 'IsActive', label: 'Trạng thái', render: (c) => (c.IsActive ? 'Hoạt động' : 'Đã tắt') },
          { key: 'LastUsedAt', label: 'Dùng gần nhất', render: (c) => (c.LastUsedAt ? new Date(c.LastUsedAt).toLocaleString('vi-VN') : '—') },
          isAdmin && {
            key: 'actions', label: '', render: (c) => (
              <>
                <button type="button" onClick={() => setEditing({ ...c })}>Sửa</button>{' '}
                <button type="button" onClick={() => openDuplicate(c)}>Nhân bản</button>{' '}
                <button type="button" onClick={() => toggleActive(c)} disabled={togglingId === c.Id}>{togglingId === c.Id ? 'Đang lưu...' : (c.IsActive ? 'Tắt' : 'Bật')}</button>{' '}
                <button type="button" onClick={() => openReportAccess(c)}>Báo cáo được gọi</button>{' '}
                <button type="button" onClick={() => openStoreAccess(c)}>Siêu thị được lấy</button>{' '}
                <button type="button" onClick={() => openRealtimeAccess(c)}>Realtime được gọi</button>{' '}
                <button type="button" onClick={() => openWriteAccess(c)}>Ghi được gọi</button>{' '}
                <button type="button" onClick={() => openVoucherAccess(c)}>Cấu hình Voucher được gọi</button>{' '}
                <button type="button" onClick={() => openRedeemedFeedFields(c)}>Trường dữ liệu voucher đã thu hồi</button>{' '}
                <button type="button" onClick={() => rotateSecret(c)} disabled={rotatingId === c.Id}>{rotatingId === c.Id ? 'Đang luân chuyển...' : 'Luân chuyển bí mật'}</button>{' '}
                <button type="button" onClick={() => deleteConsumer(c)} disabled={deletingId === c.Id}>{deletingId === c.Id ? 'Đang xoá...' : 'Xoá'}</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={consumers}
        selection={isAdmin ? selection : null}
      />

      {isAdmin && selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      {editing && (
        <Modal>
          <div className="modal-body">
            <h3>Sửa — {editing.Name}</h3>
            <p>Cách xác thực: <strong>{AUTH_METHOD_LABELS[editing.AuthMethod] || editing.AuthMethod}</strong> (không đổi được — tạo đối tác mới nếu cần cách khác)</p>
            <input value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
            <div className="scope-picker">
              {SCOPE_OPTIONS.map(scope => (
                <label key={scope} className="checkbox-row">
                  <input type="checkbox" checked={(editing.Scopes || []).includes(scope)} onChange={() => setEditing({ ...editing, Scopes: toggleScope(editing.Scopes || [], scope) })} />
                  {scope}
                </label>
              ))}
            </div>
            <input type="number" value={editing.RateLimitPerMinute ?? 120} onChange={(e) => setEditing({ ...editing, RateLimitPerMinute: Number(e.target.value) })} />
            <input
              placeholder="IP cho phép, phân tách dấu phẩy (để trống = không giới hạn)"
              value={editing.AllowedIps || ''}
              onChange={(e) => setEditing({ ...editing, AllowedIps: e.target.value })}
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.IsActive} onChange={(e) => setEditing({ ...editing, IsActive: e.target.checked })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {duplicating && (
        <Modal>
          <div className="modal-body">
            <h3>Nhân bản "{duplicating.consumer.Name}"</h3>
            <p className="hint">
              Tạo 1 đối tác MỚI giống hệt đối tác này — giữ nguyên cách xác thực, phạm vi (scope),
              giới hạn/phút, IP cho phép... Chỉ cần đặt tên khác.
            </p>
            <p className="hint">
              🔒 Vì lý do an toàn, đối tác mới KHÔNG dùng chung bí mật với đối tác gốc — hệ thống sẽ
              cấp bí mật HOÀN TOÀN MỚI, hiện ra ngay sau khi tạo (chỉ 1 lần, giống lúc tạo mới/luân
              chuyển).
            </p>
            <form className="stacked-form" onSubmit={saveDuplicate}>
              <input
                placeholder="Tên đối tác mới"
                value={duplicating.newName}
                onChange={(e) => setDuplicating({ ...duplicating, newName: e.target.value })}
                required
                autoFocus
              />
              <div className="inline-actions">
                <button type="submit" disabled={savingDuplicate}>{savingDuplicate ? 'Đang nhân bản...' : 'Tạo bản sao'}</button>
                <button type="button" onClick={() => setDuplicating(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {accessFor && (
        <Modal>
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
              <button type="button" onClick={saveReportAccess} disabled={savingReportAccess}>{savingReportAccess ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {storeAccessFor && (
        <Modal>
          <div className="modal-body">
            <h3>Siêu thị được lấy — {storeAccessFor.Name}</h3>
            <p>
              KHÔNG tick gì = đối tác thấy TOÀN BỘ siêu thị (mặc định) — chỉ khi tick ít nhất 1 siêu thị
              thì đối tác mới bị GIỚI HẠN CHỈ còn đúng những siêu thị đã tick, ở các báo cáo có khái niệm
              "siêu thị" (hiện là "Tồn kho toàn hệ thống").
            </p>
            {!stores.length && <p className="empty-message">Chưa có siêu thị nào trong "Ánh xạ Điểm - STK_ID" — khai ở etl-admin trước (hoặc kiểm tra lại cấu hình kết nối ETL_DIEM_STK_* trong .env của api-server).</p>}
            {accessMaDiems.length > 0 && (
              <p className="hint">Đang giới hạn còn {accessMaDiems.length} siêu thị. Bỏ chọn hết để trả về "không giới hạn".</p>
            )}
            <SearchableSelect
              multi
              options={stores.map((s) => ({ value: s.maDiem, label: `${s.tenSieuThi} (${s.maDiem})` }))}
              value={accessMaDiems}
              onChange={setAccessMaDiems}
            />
            <div className="modal-actions">
              <button type="button" onClick={saveStoreAccess} disabled={savingStoreAccess}>{savingStoreAccess ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setStoreAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {realtimeAccessFor && (
        <Modal>
          <div className="modal-body">
            <h3>Realtime được gọi — {realtimeAccessFor.Name}</h3>
            <p>
              Mặc định đối tác KHÔNG gọi được endpoint realtime nào dù có scope <code>realtime</code> — chỉ những
              endpoint tick dưới đây mới gọi được qua <code>GET /api/v1/realtime/:endpoint/...</code>.
            </p>
            {!endpoints.length && <p className="empty-message">Chưa có endpoint realtime nào — thêm ở trang "Endpoint realtime" trước.</p>}
            <div className="scope-picker">
              {endpoints.map(e => (
                <label key={e.Endpoint} className="checkbox-row">
                  <input type="checkbox" checked={accessEndpoints.includes(e.Endpoint)} onChange={() => toggleEndpointAccess(e.Endpoint)} />
                  {e.Label} ({e.Endpoint} — {e.DataSourceName})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveRealtimeAccess} disabled={savingRealtimeAccess}>{savingRealtimeAccess ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setRealtimeAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {writeAccessFor && (
        <Modal>
          <div className="modal-body">
            <h3>Ghi được gọi — {writeAccessFor.Name}</h3>
            <p>
              Mặc định đối tác KHÔNG gọi được endpoint ghi nào dù có scope <code>realtimeWrite</code> — chỉ những
              endpoint tick dưới đây mới gọi được qua <code>POST /api/v1/realtime-write/:endpoint/:key</code>. Đây
              là endpoint GHI NGƯỢC LẠI nguồn dữ liệu vận hành — chỉ cấp cho đối tác thật sự cần.
            </p>
            {!writeEndpoints.length && <p className="empty-message">Chưa có endpoint ghi nào — thêm ở trang "Endpoint ghi" trước.</p>}
            <div className="scope-picker">
              {writeEndpoints.map(e => (
                <label key={e.Endpoint} className="checkbox-row">
                  <input type="checkbox" checked={accessWriteEndpoints.includes(e.Endpoint)} onChange={() => toggleWriteEndpointAccess(e.Endpoint)} />
                  {e.Label} ({e.Endpoint} — {e.DataSourceName})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveWriteAccess} disabled={savingWriteAccess}>{savingWriteAccess ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setWriteAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {voucherAccessFor && (
        <Modal>
          <div className="modal-body">
            <h3>Cấu hình Voucher được gọi — {voucherAccessFor.Name}</h3>
            <p>
              Đối tác LUÔN gọi được cấu hình <code>default</code> (không cần tick, nếu có scope{' '}
              <code>voucherCheck</code>/<code>voucherRedeem</code>) — chỉ những cấu hình tick dưới đây mới gọi
              được qua <code>/api/v1/vouchers/:configKey/check</code>, <code>/api/v1/vouchers/:configKey/redeem</code>.
            </p>
            {!voucherConfigs.length && <p className="empty-message">Chưa có cấu hình Voucher nào ngoài "default" — thêm ở trang "Cấu hình Voucher" trước.</p>}
            <div className="scope-picker">
              {voucherConfigs.map(c => (
                <label key={c.ConfigKey} className="checkbox-row">
                  <input type="checkbox" checked={accessVoucherConfigs.includes(c.ConfigKey)} onChange={() => toggleVoucherConfigAccess(c.ConfigKey)} />
                  {c.Name} ({c.ConfigKey} — {c.DataSourceName || 'chưa chọn Nguồn dữ liệu'})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveVoucherAccess} disabled={savingVoucherAccess}>{savingVoucherAccess ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setVoucherAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {redeemedFeedFieldsFor && (
        <Modal>
          <div className="modal-body">
            <h3>Trường dữ liệu voucher đã thu hồi — {redeemedFeedFieldsFor.Name}</h3>
            <p>
              Đối tác lấy qua <code>GET /api/v1/vouchers/[:configKey/]redeemed/since</code> (cần scope{' '}
              <code>voucherRedeemedFeed</code>) — chỉ những trường tick dưới đây mới trả về. BỎ TICK HẾT
              (hoặc tick ĐỦ cả) = trả về ĐẦY ĐỦ mặc định, không phải "không trả trường nào".
            </p>
            <div className="scope-picker">
              {redeemedFeedAllFields.map(field => (
                <label key={field} className="checkbox-row">
                  <input type="checkbox" checked={redeemedFeedFields.includes(field)} onChange={() => toggleRedeemedFeedField(field)} />
                  {field}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveRedeemedFeedFields} disabled={savingRedeemedFeedFields}>{savingRedeemedFeedFields ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setRedeemedFeedFieldsFor(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
