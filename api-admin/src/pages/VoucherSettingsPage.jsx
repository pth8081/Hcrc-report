// pages/VoucherSettingsPage.jsx — Trang "Cấu hình Voucher": CHỈ chọn 1
// "Nguồn dữ liệu" (đã khai ở trang "Nguồn dữ liệu") trỏ DSMART16 (Live) cho
// API check/redeem voucher (POST /api/v1/vouchers/check, /redeem — xem
// api-voucher-check-redeem.md) dùng. Bảng/cột (PMCRDINF/BARCODE/STATUS...)
// CỐ ĐỊNH trong code (api-server/lib/voucherRedeemService.js), không cấu
// hình ở đây.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export default function VoucherSettingsPage() {
  const { canEdit } = useAuth();
  const editable = canEdit('voucher-settings');
  const [dataSources, setDataSources] = useState([]);
  const [dataSourceId, setDataSourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/data-sources'), api.get('/voucher-settings')])
      .then(([sources, settings]) => {
        setDataSources(sources);
        setDataSourceId(settings.dataSourceId || '');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.put('/voucher-settings', { dataSourceId: Number(dataSourceId) });
      setMessage('Đã lưu cấu hình.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page">Đang tải...</div>;

  return (
    <div className="page">
      <h1>Cấu hình Voucher</h1>
      <p>
        Chọn "Nguồn dữ liệu" (trang "Nguồn dữ liệu") trỏ DSMART16 (Live) — dùng cho
        API check/redeem voucher của app "HCRC Voucher Redemption" (bảng <code>PMCRDINF</code>,
        xem tài liệu <code>api-voucher-check-redeem.md</code>).
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      <form className="stacked-form" onSubmit={handleSave}>
        <select value={dataSourceId} onChange={e => setDataSourceId(e.target.value)} disabled={!editable} required>
          <option value="">— Chọn nguồn dữ liệu —</option>
          {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
        </select>
        {editable && <button type="submit" disabled={saving || !dataSourceId}>{saving ? 'Đang lưu...' : 'Lưu'}</button>}
      </form>
    </div>
  );
}
