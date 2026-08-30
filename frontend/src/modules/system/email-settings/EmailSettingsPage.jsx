// modules/system/email-settings/EmailSettingsPage.jsx — Cấu hình SMTP dùng
// chung + gửi thử. Ô mật khẩu để trống khi sửa = giữ nguyên mật khẩu đã lưu
// (xem report-server/routes/emailSettings.js).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

const EMPTY = { smtpHost: '', smtpPort: 587, secure: false, username: '', password: '', fromAddress: '', fromName: '' };

export default function EmailSettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/system/email-settings').then(data => {
      if (!data) return;
      setForm({ ...EMPTY, ...data, password: '' });
      setHasPassword(data.hasPassword);
    }).catch(err => setError(err.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.put('/system/email-settings', form);
      setMessage('Đã lưu.');
      setHasPassword(hasPassword || !!form.password);
      setForm({ ...form, password: '' });
    } catch (err) { setError(err.message); }
  }

  async function sendTest() {
    setError('');
    setMessage('');
    try {
      await api.post('/system/email-settings/test', { to: testTo });
      setMessage(`Đã gửi email thử tới ${testTo}.`);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Thiết lập email</h1>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <form className="stacked-form" onSubmit={save}>
        <input placeholder="SMTP host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} required />
        <input placeholder="SMTP port" type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} />
        <label className="checkbox-row"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> Secure (SSL/TLS)</label>
        <input placeholder="Username" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder={hasPassword ? 'Password (bỏ trống để giữ nguyên)' : 'Password'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input placeholder="Địa chỉ gửi (From)" value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} required />
        <input placeholder="Tên hiển thị (From name)" value={form.fromName || ''} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
        <button type="submit">Lưu cấu hình</button>
      </form>

      <div className="inline-form">
        <input placeholder="Email nhận thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button type="button" onClick={sendTest}>Gửi thử</button>
      </div>
    </div>
  );
}
