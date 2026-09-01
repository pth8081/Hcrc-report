// pages/LoginPage.jsx — Đăng nhập + luồng 2FA bắt buộc cho role='admin' (xem
// etl/routes/admin/auth.js + routes/admin/twoFactor.js):
//   password -> (không phải admin) xong ngay
//            -> (admin, đã bật 2FA) 'verify': nhập mã 6 số hoặc mã khôi phục
//            -> (admin, CHƯA bật 2FA) 'setup': quét QR, nhập mã xác nhận,
//               xem 10 mã khôi phục ĐÚNG 1 LẦN trước khi vào hệ thống.
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

function TwoFactorVerifyStep({ token, onDone }) {
  const { verifyTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verifyTwoFactor(token, useRecovery ? { recoveryCode: code } : { code });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <h1>Xác thực hai yếu tố</h1>
      {error && <p className="form-error">{error}</p>}
      <label>
        <span className="field-label">{useRecovery ? 'Mã khôi phục (dạng AAAAA-BBBBB)' : 'Mã 6 số từ app Authenticator'}</span>
        <span className="input-wrap"><input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" /></span>
      </label>
      <button type="submit" disabled={submitting}>{submitting ? 'Đang kiểm tra...' : 'Xác nhận'}</button>
      <button type="button" className="link-button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
        {useRecovery ? 'Dùng mã 6 số thay vì mã khôi phục' : 'Mất thiết bị? Dùng mã khôi phục'}
      </button>
    </form>
  );
}

function TwoFactorSetupStep({ token, onDone }) {
  const { setupTwoFactor, confirmTwoFactor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [enrollToken, setEnrollToken] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  useEffect(() => {
    setupTwoFactor({ token }).then((r) => {
      setQrDataUrl(r.qrDataUrl); setSecret(r.secret); setEnrollToken(r.token); setLoading(false);
    }).catch((err) => { setError(err.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await confirmTwoFactor(enrollToken, code);
      setRecoveryCodes(r.recoveryCodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="login-card" style={{ maxWidth: 420 }}>
        <h1>Lưu lại 10 mã khôi phục</h1>
        <p className="twofa-hint">
          Dùng khi mất điện thoại và KHÔNG có admin nào khác để nhờ "Đặt lại 2FA". Mỗi mã chỉ dùng được 1 lần.
          Chép lại/in ra và cất nơi an toàn — trang này CHỈ hiện đúng 1 lần, không xem lại được.
        </p>
        <div className="recovery-codes">
          {recoveryCodes.map((c) => <div key={c}>{c}</div>)}
        </div>
        <button type="button" onClick={onDone}>Tôi đã lưu — Vào hệ thống</button>
      </div>
    );
  }

  return (
    <form className="login-card" style={{ maxWidth: 420 }} onSubmit={handleConfirm}>
      <h1>Bắt buộc đăng ký 2FA</h1>
      <p className="twofa-hint">Tài khoản admin phải bật xác thực hai yếu tố mới dùng được. Mở app Authenticator (Google Authenticator, Authy...) và quét mã QR bên dưới.</p>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p className="muted">Đang tạo mã...</p> : (
        <>
          <img className="twofa-qr" src={qrDataUrl} alt="Mã QR đăng ký 2FA" />
          <p className="twofa-secret">{secret}</p>
          <label>
            <span className="field-label">Nhập mã 6 số vừa hiện trong app để xác nhận</span>
            <span className="input-wrap"><input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" /></span>
          </label>
          <button type="submit" disabled={submitting}>{submitting ? 'Đang xác nhận...' : 'Xác nhận & bật 2FA'}</button>
        </>
      )}
    </form>
  );
}

export default function LoginPage() {
  const { me, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [twofa, setTwofa] = useState(null); // { twofa: 'pending'|'setupRequired', token }
  const [done, setDone] = useState(false);

  if (me || done) return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(username, password);
      if (result?.twofa) setTwofa(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (twofa?.twofa === 'pending') {
    return <div className="login-page"><div className="login-card-wrap"><TwoFactorVerifyStep token={twofa.token} onDone={() => setDone(true)} /></div></div>;
  }
  if (twofa?.twofa === 'setupRequired') {
    return <div className="login-page"><div className="login-card-wrap"><TwoFactorSetupStep token={twofa.token} onDone={() => setDone(true)} /></div></div>;
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-hero-top">
          <div className="h-logo h-logo--lg">H</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name" style={{ fontSize: 16 }}>HCRC · ETL</span>
            <span className="sidebar-brand-sub">Nền tảng đồng bộ dữ liệu</span>
          </div>
        </div>
        <div className="login-hero-eyebrow">Hệ thống nội bộ</div>
        <h1>Vận hành &amp; giám sát<br />đồng bộ dữ liệu tập trung.</h1>
        <p>Kết nối nguồn dữ liệu, lịch đồng bộ, nhật ký vận hành và nhập chỉ tiêu — quản lý trên một nền tảng duy nhất.</p>
        <div className="login-hero-note">Hệ thống nội bộ — chỉ dành cho cán bộ vận hành ETL của HCRC.</div>
      </div>
      <div className="login-card-wrap">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Đăng nhập</h1>
          <p className="login-card-hint">Nhập tài khoản quản trị được cấp để truy cập hệ thống ETL.</p>
          {error && <p className="form-error">{error}</p>}
          <label>
            <span className="field-label">Tên đăng nhập</span>
            <span className="input-wrap">
              <span className="input-icon-glyph">👤</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </span>
          </label>
          <label>
            <span className="field-label">Mật khẩu</span>
            <span className="input-wrap">
              <span className="input-icon-glyph">🔒</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </span>
          </label>
          <button type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
      </div>
    </div>
  );
}
