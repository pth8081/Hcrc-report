// pages/AccountPage.jsx — "Tài khoản của tôi": tự đổi mật khẩu CỦA CHÍNH
// MÌNH (yêu cầu đúng mật khẩu hiện tại) — KHÁC hẳn trang "Phân quyền" nơi
// Admin hệ thống đặt lại mật khẩu cho NGƯỜI KHÁC (không cần biết mật khẩu
// cũ, chỉ isSystemRole thật mới thấy nút). Ai đã đăng nhập cũng vào được
// trang này (không cần menuAccess nào — xem components/Layout.jsx: link
// "Tài khoản của tôi" ở sidebar-footer, luôn hiện, không lọc theo quyền).
import { useEffect, useState } from 'react';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import PasswordInput from '../components/PasswordInput';

// "Đặt lại mã 2FA" (bản 8.78, mirror rp-user — tự đăng ký lại 2FA trên
// thiết bị/app Authenticator KHÁC mà không cần nhờ Admin khác "Đặt lại
// 2FA" giúp, xem routes/admin/twoFactor.js, mục đó vẫn giữ nguyên cho
// trường hợp MẤT hẳn thiết bị).
function TwoFactorResetFlow({ onClose }) {
  const { setupTwoFactor, confirmTwoFactor } = useAuth();
  const [step, setStep] = useState('currentCode'); // 'currentCode' | 'scan' | 'done'
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [enrollToken, setEnrollToken] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitCurrentCode(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await setupTwoFactor({ currentCode });
      setQrDataUrl(r.qrDataUrl);
      setSecret(r.secret);
      setEnrollToken(r.token);
      setStep('scan');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewCode(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await confirmTwoFactor(enrollToken, newCode);
      setRecoveryCodes(r.recoveryCodes);
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="security-card">
        <h4>Lưu lại 10 mã khôi phục mới</h4>
        <p className="twofa-hint">
          Mã QR/secret CŨ đã ngừng dùng được ngay từ bây giờ. Chép lại/in 10 mã bên dưới và cất nơi
          an toàn — trang này CHỈ hiện đúng 1 lần, không xem lại được.
        </p>
        <div className="recovery-codes">{recoveryCodes.map((c) => <div key={c}>{c}</div>)}</div>
        <div className="modal-actions"><button type="button" onClick={onClose}>Xong</button></div>
      </div>
    );
  }

  if (step === 'scan') {
    return (
      <form className="security-card" onSubmit={submitNewCode}>
        <h4>Quét mã QR mới</h4>
        <p className="twofa-hint">
          Mở app Authenticator trên thiết bị/máy MỚI và quét mã QR bên dưới — quét được trên NHIỀU
          thiết bị cùng lúc ngay bây giờ nếu muốn dùng chung 1 mã cho vài máy.
        </p>
        {error && <p className="form-error">{error}</p>}
        <img className="twofa-qr" src={qrDataUrl} alt="Mã QR 2FA mới" />
        <p className="twofa-secret">{secret}</p>
        <label>
          <span className="field-label">Nhập mã 6 số vừa hiện trong app để xác nhận</span>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} autoFocus autoComplete="one-time-code" />
        </label>
        <div className="modal-actions">
          <button type="submit" disabled={submitting}>{submitting ? 'Đang xác nhận...' : 'Xác nhận & đổi mã 2FA'}</button>
          <button type="button" onClick={onClose}>Huỷ</button>
        </div>
      </form>
    );
  }

  return (
    <form className="security-card" onSubmit={submitCurrentCode}>
      <h4>Xác nhận bạn vẫn kiểm soát thiết bị hiện tại</h4>
      <p className="twofa-hint">Nhập đúng mã 6 số HIỆN TẠI (chứng minh vẫn còn thiết bị cũ) để được cấp mã QR mới.</p>
      {error && <p className="form-error">{error}</p>}
      <label>
        <span className="field-label">Mã 6 số hiện tại từ app Authenticator</span>
        <input value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} autoFocus autoComplete="one-time-code" />
      </label>
      <div className="modal-actions">
        <button type="submit" disabled={submitting}>{submitting ? 'Đang kiểm tra...' : 'Tiếp tục'}</button>
        <button type="button" onClick={onClose}>Huỷ</button>
      </div>
    </form>
  );
}

// "Vân tay/Face ID" (WebAuthn, bản 8.78, mirror rp-user) — đăng ký thiết bị
// để lúc đăng nhập có thêm nút "Dùng vân tay/Face ID" THAY HẲN bước nhập
// mã 2FA (xem LoginPage.jsx + routes/admin/webauthn.js). Đăng ký được
// NHIỀU thiết bị (vd điện thoại + máy tính riêng).
function WebauthnDevicesSection() {
  const { webauthnListDevices, webauthnDeleteDevice, webauthnRegisterOptions, webauthnRegisterVerify } = useAuth();
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  function reload() {
    webauthnListDevices().then(setDevices).catch((err) => setError(err.message));
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setRegistering(true);
    try {
      const options = await webauthnRegisterOptions();
      const response = await startRegistration({ optionsJSON: options });
      await webauthnRegisterVerify(response, newLabel.trim() || 'Thiết bị không tên');
      setNewLabel('');
      reload();
    } catch (err) {
      if (err?.name !== 'NotAllowedError') setError(err.message);
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(device) {
    if (!confirm(`Gỡ thiết bị "${device.label}"? Thiết bị này sẽ KHÔNG còn đăng nhập nhanh được nữa.`)) return;
    setDeletingId(device.id);
    try {
      await webauthnDeleteDevice(device.id);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (!browserSupportsWebAuthn()) return null; // trình duyệt/máy không hỗ trợ — ẩn hẳn, không có gì để đăng ký

  return (
    <>
      <h3>Bảo mật — Vân tay / Face ID</h3>
      <p className="form-hint">
        Đăng ký thiết bị để đăng nhập nhanh — bấm "Dùng vân tay/Face ID" lúc xác thực hai yếu tố
        THAY VÌ gõ mã 6 số, trên ĐÚNG thiết bị đã đăng ký (không dùng được ở máy khác).
      </p>
      {error && <p className="form-error">{error}</p>}
      {devices?.map((d) => (
        <div key={d.id} className="security-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>{d.label}</strong>
          <button type="button" onClick={() => handleDelete(d)} disabled={deletingId === d.id}>{deletingId === d.id ? 'Đang gỡ...' : 'Gỡ thiết bị'}</button>
        </div>
      ))}
      <form className="inline-form" onSubmit={handleRegister}>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Tên thiết bị (vd: iPhone của tôi)" />
        <button type="submit" disabled={registering}>{registering ? 'Đang đăng ký...' : '➕ Đăng ký thiết bị mới'}</button>
      </form>
    </>
  );
}

export default function AccountPage() {
  const { me, logout, isSystemRole } = useAuth();
  const [showTwoFactorReset, setShowTwoFactorReset] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Mật khẩu mới phải có ít nhất 8 ký tự');
    if (newPassword !== confirmPassword) return setError('Xác nhận mật khẩu mới không khớp');
    setSaving(true);
    try {
      await api.post('/auth/me/change-password', { currentPassword, newPassword });
      setSuccess('Đổi mật khẩu thành công. Đang đăng xuất để đăng nhập lại bằng mật khẩu mới...');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(logout, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Tài khoản của tôi</h1>
      <p className="form-hint">Đăng nhập với: <strong>{me?.username}</strong></p>

      <h3>Đổi mật khẩu</h3>
      <p className="form-hint">
        Đổi mật khẩu đăng nhập của chính bạn — cần nhập đúng mật khẩu hiện tại.
        Cần đặt lại mật khẩu cho <em>người khác</em>? Vào trang "Phân quyền" (chỉ Admin hệ thống mới thấy nút đó).
      </p>
      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}
      {!success && (
        <form className="stacked-form" onSubmit={submit}>
          <label>Mật khẩu hiện tại</label>
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required autoFocus />

          <label>Mật khẩu mới</label>
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
          {tooShort && <span className="form-hint">Cần ít nhất 8 ký tự</span>}

          <label>Xác nhận mật khẩu mới</label>
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
          {mismatch && <span className="form-error">Xác nhận không khớp với mật khẩu mới</span>}

          <div className="modal-actions">
            <button type="submit" disabled={saving || tooShort || mismatch}>{saving ? 'Đang lưu...' : 'Đổi mật khẩu'}</button>
          </div>
        </form>
      )}

      {/* 2FA chỉ bắt buộc/áp dụng cho vai trò hệ thống (isSystemRole) —
          tài khoản khác không có gì để đặt lại ở đây, ẩn hẳn mục này cho
          đỡ rối. */}
      {isSystemRole && (
        <>
          <h3>Bảo mật — Xác thực hai yếu tố</h3>
          <p className="form-hint">
            Đặt lại mã 2FA để quét mã QR mới trên thiết bị/app Authenticator KHÁC (vd đổi điện
            thoại) — không cần nhờ Admin khác "Đặt lại 2FA" giúp (chỉ dùng khi MẤT hẳn thiết bị cũ).
          </p>
          {!showTwoFactorReset ? (
            <div className="modal-actions">
              <button type="button" onClick={() => setShowTwoFactorReset(true)}>Đặt lại mã 2FA</button>
            </div>
          ) : (
            <TwoFactorResetFlow onClose={() => setShowTwoFactorReset(false)} />
          )}
          <WebauthnDevicesSection />
        </>
      )}
    </div>
  );
}
