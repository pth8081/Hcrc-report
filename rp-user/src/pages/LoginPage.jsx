// pages/LoginPage.jsx — Đăng nhập + luồng 2FA bắt buộc cho vai trò Admin hệ
// thống (IsSystemRole=1, xem rp-server/server.js + routes/twoFactor.js):
//   password -> (không phải Admin hệ thống) xong ngay
//            -> (Admin, đã bật 2FA) 'verify': nhập mã 6 số hoặc mã khôi phục
//            -> (Admin, CHƯA bật 2FA) 'setup': quét QR, nhập mã xác nhận,
//               xem 10 mã khôi phục ĐÚNG 1 LẦN trước khi vào hệ thống.
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useAuth } from '../lib/AuthContext';
import LoginHeroIllustration from '../components/LoginHeroIllustration';
import CaptchaField from '../components/CaptchaField';

function TwoFactorVerifyStep({ token, onDone }) {
  const { verifyTwoFactor, webauthnLoginOptions, webauthnLoginVerify } = useAuth();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [webauthnBusy, setWebauthnBusy] = useState(false);

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

  // Vân tay/Face ID (WebAuthn, bản 8.41, theo yêu cầu người dùng) — THAY
  // HẲN bước nhập mã 6 số ở trên khi dùng cách này, không bắt gõ thêm gì
  // nữa (xem rp-server/routes/webauthn.js: xác thực xong là đăng nhập
  // luôn). Đăng ký thiết bị ở trang "Tài khoản của tôi".
  async function handleWebauthn() {
    setError('');
    setWebauthnBusy(true);
    try {
      const options = await webauthnLoginOptions(token);
      const response = await startAuthentication({ optionsJSON: options });
      await webauthnLoginVerify(token, response);
      onDone();
    } catch (err) {
      // Người dùng tự bấm Huỷ ở hộp thoại trình duyệt -> không phải lỗi
      // thật, không cần hiện thông báo đỏ (vẫn còn cách nhập mã 6 số).
      if (err?.name !== 'NotAllowedError') setError(err.message);
    } finally {
      setWebauthnBusy(false);
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <h1>Xác thực hai yếu tố</h1>
      {error && <p className="form-error">{error}</p>}
      {browserSupportsWebAuthn() && (
        <button type="button" className="biometric-btn" onClick={handleWebauthn} disabled={webauthnBusy}>
          🫆 {webauthnBusy ? 'Đang chờ xác thực...' : 'Dùng vân tay / Face ID'}
        </button>
      )}
      <label>
        <span className="field-label">{useRecovery ? 'Mã khôi phục (dạng AAAAA-BBBBB)' : 'Mã 6 số từ app Authenticator'}</span>
        <span className="input-wrap"><input value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" disabled={webauthnBusy} /></span>
      </label>
      <button type="submit" disabled={submitting || webauthnBusy}>{submitting ? 'Đang kiểm tra...' : 'Xác nhận'}</button>
      <button type="button" className="link-button" disabled={webauthnBusy} onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
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
      <div className="login-card login-card--narrow">
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
    <form className="login-card login-card--narrow" onSubmit={handleConfirm}>
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

// Bản 8.89 — "nhớ tên đăng nhập" cho LẦN SAU, lưu ở máy người dùng (KHÔNG
// phải phiên đăng nhập — chỉ là gợi nhớ chuỗi username, không có gì nhạy
// cảm). Theo đúng yêu cầu người dùng (kèm ảnh 1 app khác minh hoạ).
const REMEMBERED_USERNAME_KEY = 'hcrc_rp_remembered_username';

export default function LoginPage() {
  const { me, login, webauthnPasswordlessOptions, webauthnPasswordlessVerify } = useAuth();
  const location = useLocation();
  const [rememberedUsername, setRememberedUsername] = useState(() => {
    try { return localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''; } catch { return ''; }
  });
  const [editingUsername, setEditingUsername] = useState(!rememberedUsername);
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [webauthnBusy, setWebauthnBusy] = useState(false);
  const [twofa, setTwofa] = useState(null); // { twofa: 'pending'|'setupRequired', token }
  const [done, setDone] = useState(false);

  if (me || done) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  // Gọi NGAY SAU MỖI lần đăng nhập thành công (mật khẩu LẪN vân tay/Face
  // ID) — nhớ lại ĐÚNG username vừa đăng nhập cho lần mở trang sau.
  function rememberUsername(u) {
    try { localStorage.setItem(REMEMBERED_USERNAME_KEY, u); } catch { /* localStorage chặn (chế độ ẩn danh...) — bỏ qua, không chặn đăng nhập vì việc này */ }
  }

  function switchAccount() {
    setEditingUsername(true);
    setUsername('');
    setError('');
  }

  const busy = submitting || webauthnBusy;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(username, password, captchaToken, captchaAnswer);
      if (result?.twofa) setTwofa(result);
      else rememberUsername(username);
    } catch (err) {
      setError(err.message);
    } finally {
      // Token captcha vừa dùng LUÔN hết hạn ở server (dùng 1 lần, xem
      // lib/captcha.js) dù đăng nhập thành công hay thất bại — tải ảnh mới
      // ngay, không đợi người dùng tự bấm ⟲.
      setCaptchaAnswer('');
      captchaRef.current?.refresh();
      setSubmitting(false);
    }
  }

  // Đăng nhập THẲNG bằng vân tay/Face ID — THAY THẾ HẲN mật khẩu/captcha
  // (bản 8.89, theo yêu cầu người dùng), ngay ở màn hình đầu tiên — KHÁC
  // handleWebauthn() ở TwoFactorVerifyStep (cái đó vẫn đòi mật khẩu đúng
  // trước). Cần có username (gõ tay hoặc đã nhớ sẵn) để biết kiểm tra
  // đúng thiết bị của ai.
  async function handleWebauthnLogin() {
    setError('');
    setWebauthnBusy(true);
    try {
      // "token" đi kèm KHÔNG thuộc chuẩn WebAuthn (chỉ server tự thêm để
      // nhận lại đúng challenge lúc /verify) — tách riêng trước khi đưa cho
      // startAuthentication(), tránh truyền thừa field lạ vào API trình
      // duyệt.
      const { token, ...webauthnOptions } = await webauthnPasswordlessOptions(username);
      const response = await startAuthentication({ optionsJSON: webauthnOptions });
      await webauthnPasswordlessVerify(token, response);
      rememberUsername(username);
      setDone(true);
    } catch (err) {
      // Người dùng tự bấm Huỷ ở hộp thoại trình duyệt, hoặc không có thiết
      // bị nào khớp (bấm nhầm/chưa đăng ký) -> không phải lỗi máy chủ, chỉ
      // im lặng quay lại màn hình, vẫn gõ mật khẩu được bình thường.
      if (err?.name !== 'NotAllowedError') setError(err.message);
    } finally {
      setWebauthnBusy(false);
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
            <span className="sidebar-brand-name sidebar-brand-name--hero">HCRC</span>
            <span className="sidebar-brand-sub">Không gian báo cáo</span>
          </div>
        </div>
        <div className="login-hero-illust-wrap">
          <div className="login-hero-illust-card">
            <LoginHeroIllustration />
          </div>
        </div>
        <div className="login-hero-bottom-label">HCRC · Report</div>
      </div>
      <div className="login-card-wrap">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Đăng nhập</h1>
          <p className="login-card-hint">Nhập thông tin tài khoản được cấp để truy cập hệ thống.</p>
          {error && <p className="form-error">{error}</p>}
          {editingUsername ? (
            <label>
              <span className="field-label">Tên đăng nhập</span>
              <span className="input-wrap">
                <span className="input-icon-glyph">👤</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus disabled={busy} />
              </span>
            </label>
          ) : (
            <div className="remembered-account-row">
              <span className="input-icon-glyph">👤</span>
              <span className="remembered-account-name">{username}</span>
              <button type="button" className="link-button" onClick={switchAccount} disabled={busy}>Tài khoản khác</button>
            </div>
          )}
          <label>
            <span className="field-label">Mật khẩu</span>
            <span className="input-wrap">
              <span className="input-icon-glyph">🔒</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </span>
          </label>
          <CaptchaField ref={captchaRef} value={captchaAnswer} onChange={setCaptchaAnswer} onTokenChange={setCaptchaToken} disabled={busy} />
          <button type="submit" disabled={busy}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
          {browserSupportsWebAuthn() && username.trim() && (
            <button type="button" className="biometric-btn" onClick={handleWebauthnLogin} disabled={busy}>
              🫆 {webauthnBusy ? 'Đang chờ xác thực...' : 'Đăng nhập bằng vân tay / Face ID'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
