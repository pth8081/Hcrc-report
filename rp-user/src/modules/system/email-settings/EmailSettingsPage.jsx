// modules/system/email-settings/EmailSettingsPage.jsx — Cấu hình gửi email
// dùng chung + gửi thử. Ô mật khẩu để trống khi sửa = giữ nguyên mật khẩu đã
// lưu (xem rp-server/routes/emailSettings.js).
//
// 2 giao thức (bản 8.65, theo yêu cầu người dùng — Postfix KHÔNG cần đăng
// nhập, Exchange tại chỗ cần "truy cập trực tiếp vào mailbox" qua chính
// giao thức Exchange):
// - "smtp" (mặc định) — dùng SMTP host/port/Secure như trước (Postfix,
//   Exchange qua SMTP AUTH...).
// - "ews" — Exchange Web Services (API HTTPS riêng của Exchange, KHÔNG qua
//   SMTP), xem rp-server/lib/ewsMailer.js. CHỈ dùng được cho Exchange CÀI
//   TẠI CHỖ (on-premise) — Exchange Online/Office 365 đã bị Microsoft chặn
//   kiểu xác thực username/password trực tiếp (Basic Auth) cho EWS từ cuối
//   2022.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

const EMPTY = {
  protocol: 'smtp', smtpHost: '', smtpPort: 587, secure: false,
  ewsUrl: '', ewsInsecureTls: false,
  username: '', password: '', fromAddress: '', fromName: ''
};

// Gợi ý điền sẵn theo loại gateway phổ biến — CHỈ điền sẵn, người dùng sửa
// lại thoải mái, không khoá field nào. "custom" không đổi gì.
const GATEWAY_PRESETS = {
  custom: { label: 'Tuỳ chỉnh (SMTP)', protocol: 'smtp' },
  postfix: {
    label: 'Postfix — relay nội bộ, KHÔNG cần đăng nhập (SMTP, cổng 465)',
    protocol: 'smtp',
    apply: (form) => ({ ...form, protocol: 'smtp', smtpPort: 465, secure: true, username: '', password: '' }),
    hint: 'Điền tên máy chủ Postfix nội bộ vào ô "SMTP host", ĐỂ TRỐNG Username/Password — Postfix dạng relay nội bộ thường cho phép gửi thẳng theo IP, không cần tài khoản. Nếu Postfix CÓ yêu cầu đăng nhập, điền Username/Password như bình thường.'
  },
  'exchange-smtp': {
    label: 'Exchange — đăng nhập qua SMTP (cổng 587)',
    protocol: 'smtp',
    apply: (form) => ({ ...form, protocol: 'smtp', smtpHost: form.smtpHost || 'smtp.office365.com', smtpPort: 587, secure: false }),
    hint: 'Khác Postfix — Exchange LUÔN đòi đăng nhập, không gửi được nếu để trống Username/Password. Dùng được cho cả Exchange Online (mặc định điền sẵn smtp.office365.com — nếu tài khoản bật MFA, dùng "Mật khẩu ứng dụng" thay mật khẩu thường) lẫn Exchange tại chỗ có bật SMTP AUTH (đổi lại SMTP host cho đúng máy chủ nội bộ).'
  },
  'exchange-ews': {
    label: 'Exchange tại chỗ — API EWS, đăng nhập thẳng vào mailbox (không qua SMTP)',
    protocol: 'ews',
    apply: (form) => ({ ...form, protocol: 'ews' }),
    hint: 'CHỈ dùng được cho Exchange CÀI TẠI CHỖ (on-premise) — Exchange Online/Office 365 đã bị Microsoft chặn xác thực username/password kiểu này (Basic Auth) cho EWS từ cuối 2022. Điền "EWS URL" đầy đủ (thường dạng https://<máy chủ Exchange>/EWS/Exchange.asmx — hỏi IT quản trị Exchange nếu không chắc), Username/Password đăng nhập thẳng vào hộp thư ở "Địa chỉ gửi (From)".'
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
    else setForm({ ...form, protocol: preset.protocol });
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

  const isEws = form.protocol === 'ews';

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

        {isEws ? (
          <>
            <input placeholder="EWS URL (vd https://mail.noibo.local/EWS/Exchange.asmx)" value={form.ewsUrl} onChange={(e) => setForm({ ...form, ewsUrl: e.target.value })} required />
            <label className="checkbox-row">
              <input type="checkbox" checked={form.ewsInsecureTls} onChange={(e) => setForm({ ...form, ewsInsecureTls: e.target.checked })} />
              Bỏ qua kiểm tra chứng chỉ TLS (chỉ dùng nếu máy chủ Exchange nội bộ dùng chứng chỉ tự ký)
            </label>
          </>
        ) : (
          <>
            <input placeholder="SMTP host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} required />
            <input
              placeholder="SMTP port"
              type="number"
              value={form.smtpPort}
              onChange={(e) => {
                const smtpPort = Number(e.target.value);
                // Cổng 465 (vd Postfix smtps) luôn cần TLS ngay từ đầu — tự
                // tick sẵn "Secure" để tránh quên (server cũng tự ép true
                // cho cổng này dù lỡ bỏ tick, xem rp-server/lib/mailer.js —
                // đây chỉ là gợi ý cho đúng với giá trị thật sẽ dùng lúc gửi).
                setForm({ ...form, smtpPort, secure: smtpPort === 465 ? true : form.secure });
              }}
            />
            <label className="checkbox-row"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> Secure (SSL/TLS)</label>
            {form.smtpPort === 465 && <p className="form-hint">Cổng 465 luôn dùng TLS ngay từ đầu kết nối — hệ thống tự gửi bằng chế độ này dù ô trên có tick hay không.</p>}
          </>
        )}

        <input placeholder={isEws ? 'Username (đăng nhập thẳng vào mailbox)' : 'Username'} value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
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
