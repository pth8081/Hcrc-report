// pages/VoucherSettingsPage.jsx — Trang "Cấu hình Voucher": DANH SÁCH (bản
// 9.59, theo yêu cầu người dùng — nhiều máy chủ DSMART khác nhau, vd thêm
// chi nhánh "Fuji") — mỗi dòng chọn 1 "Nguồn dữ liệu" (đã khai ở trang
// "Nguồn dữ liệu") trỏ DSMART16 Live cho API check/redeem voucher của app
// "HCRC Voucher Redemption" (POST /api/v1/vouchers/:configKey/check,/redeem
// — xem api-voucher-check-redeem.md). Bảng/cột (PMCRDINF/BARCODE/STATUS...)
// CỐ ĐỊNH trong code (api-server/lib/voucherRedeemService.js), không cấu
// hình ở đây. Dòng "default" KHÔNG xoá được — API KHÔNG kèm :configKey
// (/vouchers/check, /vouchers/redeem — hành vi CŨ, đối tác hiện tại không
// cần đổi gì) luôn trỏ vào đúng dòng này.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import Modal from '../components/Modal';
import CopyableText from '../components/CopyableText';

const DEFAULT_CONFIG_KEY = 'default';
const EMPTY_FORM = { configKey: '', name: '', dataSourceId: '' };

// voucherUrls (bản 9.74, theo yêu cầu người dùng — "mình sẽ dễ bị nhầm url
// lắm") — hiện SẴN đúng 2 đường dẫn check/redeem của TỪNG dòng ngay trong
// bảng này, tính THẲNG từ ConfigKey (không gõ tay/không copy từ tài liệu
// rời rạc dễ lệch khi thêm máy chủ mới) — admin copy thẳng đúng URL gửi
// đối tác, không cần tự ghép path bằng tay (dễ gõ sai/thiếu dấu "/").
// SỬA bản 10.58 (theo yêu cầu người dùng — "hiện link URL để gửi đối tác...
// mà nhớ được link") — ghép thêm domain thật (publicApiBaseUrl) khi đã khai
// PUBLIC_API_BASE_URL, trước đây CHỈ hiện đường dẫn (thiếu domain, vẫn phải
// tự ghép tay).
function voucherUrls(configKey, publicApiBaseUrl) {
  const base = configKey === DEFAULT_CONFIG_KEY ? '/api/v1/vouchers' : `/api/v1/vouchers/${configKey}`;
  const prefix = publicApiBaseUrl || '';
  return { check: `${prefix}${base}/check`, redeem: `${prefix}${base}/redeem` };
}

export default function VoucherSettingsPage() {
  const { canEdit, me } = useAuth();
  const editable = canEdit('voucher-settings');
  const [configs, setConfigs] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null); // form tạo mới đang mở, hoặc null
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // dòng đang sửa, hoặc null
  const [savingForm, setSavingForm] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  function reload() {
    Promise.allSettled([api.get('/data-sources'), api.get('/voucher-settings')])
      .then(([sourcesResult, configsResult]) => {
        if (sourcesResult.status === 'fulfilled') setDataSources(sourcesResult.value);
        else setError(sourcesResult.reason.message);
        if (configsResult.status === 'fulfilled') setConfigs(configsResult.value);
        else setError(prev => prev || configsResult.reason.message);
      })
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  function dataSourceName(id) {
    return dataSources.find(s => s.Id === id)?.Name || null;
  }

  async function createConfig(e) {
    e.preventDefault();
    setError(null);
    setSavingForm(true);
    try {
      await api.post('/voucher-settings', { ...form, dataSourceId: form.dataSourceId ? Number(form.dataSourceId) : null });
      setCreating(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingForm(false); }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError(null);
    setSavingForm(true);
    try {
      await api.put(`/voucher-settings/${editing.ConfigKey}`, {
        name: editing.Name,
        dataSourceId: editing.DataSourceId ? Number(editing.DataSourceId) : null
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingForm(false); }
  }

  async function deleteConfig(configKey) {
    if (!confirm(`Xoá cấu hình Voucher "${configKey}"? Đối tác đang gán cấu hình này sẽ không gọi được nữa.`)) return;
    setDeletingKey(configKey);
    try {
      await api.del(`/voucher-settings/${configKey}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingKey(null); }
  }

  if (loading) return <div className="page">Đang tải...</div>;

  return (
    <div className="page">
      <h1>Cấu hình Voucher</h1>
      <p>
        Mỗi dòng là 1 máy chủ DSMART (Live) mà app "HCRC Voucher Redemption" có thể gọi tới —
        "Mã" (ConfigKey) dùng THẲNG trên đường dẫn API (<code>/vouchers/&lt;mã&gt;/check</code>,{' '}
        <code>/vouchers/&lt;mã&gt;/redeem</code>), không đổi được sau khi tạo. Riêng dòng{' '}
        <code>{DEFAULT_CONFIG_KEY}</code> dùng cho API không kèm mã (<code>/vouchers/check</code>,{' '}
        <code>/vouchers/redeem</code> — đối tác hiện tại không cần đổi gì), không xoá được.
      </p>
      {error && <p className="form-error">{error}</p>}
      {!me?.publicApiBaseUrl && (
        <p className="hint">
          Chưa khai <code>PUBLIC_API_BASE_URL</code> trong <code>.env</code> của api-server — cột "Đường dẫn API"
          dưới đây tạm chỉ hiện đường dẫn (không domain). Khai xong, restart api-server để hiện đủ link gửi đối tác.
        </p>
      )}

      {editable && (
        <div className="inline-actions">
          <button type="button" onClick={() => { setCreating(true); setForm(EMPTY_FORM); }}>+ Tạo cấu hình mới</button>
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr><th>Mã (ConfigKey)</th><th>Tên</th><th>Nguồn dữ liệu</th><th>Đường dẫn API (gửi đối tác)</th>{editable && <th></th>}</tr>
          </thead>
          <tbody>
            {configs.map(c => {
              const urls = voucherUrls(c.ConfigKey, me?.publicApiBaseUrl);
              return (
              <tr key={c.ConfigKey}>
                <td><code>{c.ConfigKey}</code></td>
                <td>{c.Name}</td>
                <td>{c.DataSourceName || <span className="hint">Chưa chọn</span>}</td>
                <td>
                  <div>POST <CopyableText value={urls.check} label="Endpoint check" /></div>
                  <div>POST <CopyableText value={urls.redeem} label="Endpoint redeem" /></div>
                </td>
                {editable && (
                  <td>
                    <button type="button" onClick={() => setEditing({ ...c })}>Sửa</button>{' '}
                    <button
                      type="button"
                      onClick={() => deleteConfig(c.ConfigKey)}
                      disabled={c.ConfigKey === DEFAULT_CONFIG_KEY || deletingKey === c.ConfigKey}
                    >
                      {deletingKey === c.ConfigKey ? 'Đang xoá...' : 'Xoá'}
                    </button>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal>
          <div className="modal-body">
            <h3>Tạo cấu hình Voucher mới</h3>
            <form className="stacked-form" onSubmit={createConfig}>
              <input
                placeholder="Mã (vd fuji) — chữ thường/số/gạch ngang, dùng thẳng trên URL"
                value={form.configKey}
                onChange={e => setForm({ ...form, configKey: e.target.value })}
                required
                autoFocus
              />
              <input
                placeholder="Tên hiển thị (vd Voucher redeem Fuji)"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
              <select value={form.dataSourceId} onChange={e => setForm({ ...form, dataSourceId: e.target.value })}>
                <option value="">— Chọn nguồn dữ liệu —</option>
                {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
              </select>
              <div className="modal-actions">
                <button type="submit" disabled={savingForm}>{savingForm ? 'Đang tạo...' : 'Tạo'}</button>
                <button type="button" onClick={() => setCreating(false)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal>
          <div className="modal-body">
            <h3>Sửa cấu hình "{editing.ConfigKey}"</h3>
            <form className="stacked-form" onSubmit={saveEdit}>
              <input value={editing.Name} onChange={e => setEditing({ ...editing, Name: e.target.value })} required />
              <select value={editing.DataSourceId || ''} onChange={e => setEditing({ ...editing, DataSourceId: e.target.value })}>
                <option value="">— Chọn nguồn dữ liệu —</option>
                {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
              </select>
              <div className="modal-actions">
                <button type="submit" disabled={savingForm}>{savingForm ? 'Đang lưu...' : 'Lưu'}</button>
                <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
