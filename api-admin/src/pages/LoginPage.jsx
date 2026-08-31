// pages/LoginPage.jsx — Đăng nhập + luồng 2FA bắt buộc cho role='admin' (xem
// api-server/routes/admin/auth.js + routes/admin/twoFactor.js):
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
    <form className="login-form" onSubmit={handleSubmit}>
      <h1>Xác thực hai yếu tố</h1>
      {error && <p className="form-error">{error}</p>}
      <label>
        <span>{useRecovery ? 'Mã khôi phục (dạng AAAAA-BBBBB)' : 'Mã 6 số từ app Authenticator'}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" />
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
      <div className="login-form login-form--wide">
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
    <form className="login-form login-form--wide" onSubmit={handleConfirm}>
      <h1>Bắt buộc đăng ký 2FA</h1>
      <p className="twofa-hint">Tài khoản admin phải bật xác thực hai yếu tố mới dùng được. Mở app Authenticator (Google Authenticator, Authy...) và quét mã QR bên dưới.</p>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p className="muted">Đang tạo mã...</p> : (
        <>
          <img className="twofa-qr" src={qrDataUrl} alt="Mã QR đăng ký 2FA" />
          <p className="twofa-secret">{secret}</p>
          <label>
            <span>Nhập mã 6 số vừa hiện trong app để xác nhận</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" />
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

  if (me || done) return <Navigate to={location.state?.from?.pathname || '/consumers'} replace />;

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
    return <div className="login-page"><TwoFactorVerifyStep token={twofa.token} onDone={() => setDone(true)} /></div>;
  }
  if (twofa?.twofa === 'setupRequired') {
    return <div className="login-page"><TwoFactorSetupStep token={twofa.token} onDone={() => setDone(true)} /></div>;
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>HCRC · Quản trị API</h1>
        {error && <p className="form-error">{error}</p>}
        <label>
          <span>Tên đăng nhập</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}
