// pages/AccountPage.jsx — "Tài khoản của tôi": tự đổi mật khẩu CỦA CHÍNH
// MÌNH (yêu cầu đúng mật khẩu hiện tại) — KHÁC hẳn trang "Tài khoản quản
// trị" nơi Admin hệ thống đặt lại mật khẩu cho NGƯỜI KHÁC (không cần biết
// mật khẩu cũ, chỉ isSystemRole thật mới thấy nút). Ai đã đăng nhập cũng
// vào được trang này (không cần menuAccess nào — xem components/Layout.jsx:
// link "Tài khoản của tôi" ở sidebar-footer, luôn hiện, không lọc theo quyền).
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function AccountPage() {
  const { me, logout } = useAuth();
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
        Cần đặt lại mật khẩu cho <em>người khác</em>? Vào trang "Tài khoản quản trị" (chỉ Admin hệ thống mới thấy nút đó).
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
    </div>
  );
}
