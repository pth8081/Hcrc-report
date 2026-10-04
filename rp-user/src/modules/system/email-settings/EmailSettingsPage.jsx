// modules/system/email-settings/EmailSettingsPage.jsx — Cấu hình SMTP dùng
// chung + gửi thử. Ô mật khẩu để trống khi sửa = giữ nguyên mật khẩu đã lưu
// (xem rp-server/routes/emailSettings.js).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

const EMPTY = { smtpHost: '', smtpPort: 587, secure: false, username: '', password: '', fromAddress: '', fromName: '' };

// Gợi ý điền sẵn host/port/secure theo loại gateway phổ biến (bản 8.64,
// theo yêu cầu người dùng — có cả Postfix lẫn Exchange/Office 365, muốn
// đổi qua lại dễ dàng) — CHỈ điền sẵn, người dùng sửa lại thoải mái, không
// khoá field nào. "custom" không đổi gì (giữ nguyên giá trị đang gõ).
const GATEWAY_PRESETS = {
  custom: { label: 'Tuỳ chỉnh' },
  postfix: {
    label: 'Postfix (SMTPS — cổng 465)',
    apply: (form) => ({ ...form, smtpPort: 465, secure: true }),
    hint: 'Cổng 465 dùng TLS ngay từ đầu — điền đúng tên máy chủ Postfix nội bộ vào ô "SMTP host".'
  },
  exchange: {
    label: 'Exchange Online / Office 365 (STARTTLS — cổng 587)',
    apply: (form) => ({ ...form, smtpHost: form.smtpHost || 'smtp.office365.com', smtpPort: 587, secure: false }),
    hint: 'Username = địa chỉ email đăng nhập đầy đủ. Nếu tài khoản bật xác thực 2 lớp (MFA), dùng "Mật khẩu ứng dụng" (App password) thay vì mật khẩu đăng nhập thường.'
  },
  'exchange-onprem': {
    label: 'Exchange tại chỗ (on-premise, STARTTLS — cổng 587)',
    apply: (form) => ({ ...form, smtpPort: 587, secure: false }),
    hint: 'Điền tên máy chủ Exchange nội bộ vào ô "SMTP host". Username thường là dạng DOMAIN\\tên-đăng-nhập hoặc email đầy đủ, tuỳ cấu hình Exchange — hỏi IT quản trị Exchange nếu không chắc.'
  }
};

export default function EmailSettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [gatewayPreset, setGatewayPreset] = useState('custom');

  function applyPreset(key) {
    setGatewayPreset(key);
    const preset = GATEWAY_PRESETS[key];
    if (preset?.apply) setForm(preset.apply(form));
  }

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
    setSaving(true);
    try {
      await api.put('/system/email-settings', form);
      setMessage('Đã lưu.');
      setHasPassword(hasPassword || !!form.password);
      setForm({ ...form, password: '' });
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function sendTest() {
    setError('');
    setMessage('');
    setSendingTest(true);
    try {
      await api.post('/system/email-settings/test', { to: testTo });
      setMessage(`Đã gửi email thử tới ${testTo}.`);
    } catch (err) { setError(err.message); } finally { setSendingTest(false); }
  }

  return (
    <div className="page">
      <h1>Thiết lập email</h1>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <form className="stacked-form" onSubmit={save}>
        <label>Loại email gateway (gợi ý điền sẵn — vẫn sửa lại được mọi ô bên dưới)
          <select value={gatewayPreset} onChange={(e) => applyPreset(e.target.value)}>
            {Object.entries(GATEWAY_PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select>
        </label>
        {GATEWAY_PRESETS[gatewayPreset]?.hint && <p className="form-hint">{GATEWAY_PRESETS[gatewayPreset].hint}</p>}

        <input placeholder="SMTP host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} required />
        <input
          placeholder="SMTP port"
          type="number"
          value={form.smtpPort}
          onChange={(e) => {
            const smtpPort = Number(e.target.value);
            // Cổng 465 (vd Postfix smtps) luôn cần TLS ngay từ đầu — tự tick
            // sẵn "Secure" để tránh quên (server cũng tự ép true cho cổng
            // này dù lỡ bỏ tick, xem rp-server/lib/mailer.js — đây chỉ là
            // gợi ý cho đúng với giá trị thật sẽ dùng lúc gửi).
            setForm({ ...form, smtpPort, secure: smtpPort === 465 ? true : form.secure });
          }}
        />
        <label className="checkbox-row"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> Secure (SSL/TLS)</label>
        {form.smtpPort === 465 && <p className="form-hint">Cổng 465 luôn dùng TLS ngay từ đầu kết nối — hệ thống tự gửi bằng chế độ này dù ô trên có tick hay không.</p>}
        <input placeholder="Username" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder={hasPassword ? 'Password (bỏ trống để giữ nguyên)' : 'Password'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input placeholder="Địa chỉ gửi (From)" value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} required />
        <input placeholder="Tên hiển thị (From name)" value={form.fromName || ''} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
        <button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
      </form>

      <div className="inline-form">
        <input placeholder="Email nhận thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button type="button" onClick={sendTest} disabled={sendingTest}>{sendingTest ? 'Đang gửi...' : 'Gửi thử'}</button>
      </div>
    </div>
  );
}
