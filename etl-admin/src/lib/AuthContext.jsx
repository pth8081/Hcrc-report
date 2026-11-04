// lib/AuthContext.jsx — Người quản trị hiện tại (username + quyền tra theo
// nhóm quyền động, xem etl/lib/adminPermissions.js) — thay mô hình 3 Role cố
// định cũ ('admin'/'viewer'/'target_importer'). `isSystemRole` (mirror
// rp-user) vào được MỌI trang; còn lại tra `menuAccess[menuCode]` — có mặt
// nghĩa là "xem", `canEdit` là "sửa/xoá" (giữ đúng phân biệt view/edit của
// mô hình cũ, khác rp-user vốn chỉ nhị phân thấy/không thấy).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import Modal from '../components/Modal';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  // sessionConflict/confirmingOverride (bản 10.68) — mirror rp-user, xem
  // chú thích đầy đủ ở rp-user/src/lib/AuthContext.jsx.
  const [sessionConflict, setSessionConflict] = useState(null);
  const [confirmingOverride, setConfirmingOverride] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMe(await api.get('/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // withSessionConflict (bản 10.68) — mirror rp-user, xem chú thích đầy đủ
  // ở rp-user/src/lib/AuthContext.jsx.
  const withSessionConflict = useCallback(async (apiCallFn) => {
    try {
      return await apiCallFn();
    } catch (err) {
      // err.data (đã có sẵn ở lib/api.js — giữ nguyên body lỗi đầy đủ) —
      // KHÁC rp-user (api.js ở đó chỉ gắn .sessionConflict/.overrideToken
      // trực tiếp), etl-admin đọc qua err.data.
      if (!err.data?.sessionConflict) throw err;
      const overrideToken = err.data.overrideToken;
      const proceed = await new Promise((resolve) => setSessionConflict({ overrideToken, resolve }));
      if (!proceed) {
        setSessionConflict(null);
        throw Object.assign(new Error(''), { cancelled: true });
      }
      setConfirmingOverride(true);
      try {
        const result = await api.post('/auth/confirm-session', { overrideToken });
        await refresh();
        return result;
      } finally {
        setConfirmingOverride(false);
        setSessionConflict(null);
      }
    }
  }, [refresh]);

  // Trả nguyên response cho LoginPage tự quyết định bước tiếp theo:
  // { ok: true } -> xong ngay (không phải vai trò hệ thống, không cần 2FA)
  // { twofa: 'pending', token } -> đã bật 2FA, cần nhập mã (xem 2fa/verify)
  // { twofa: 'setupRequired', token } -> CHƯA bật 2FA, bắt buộc đăng ký ngay
  const login = useCallback(async (username, password, captchaToken, captchaAnswer) => withSessionConflict(async () => {
    const result = await api.post('/auth/login', { username, password, captchaToken, captchaAnswer });
    if (result?.ok) await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // 3 bước còn lại của 2FA (xem etl/routes/admin/twoFactor.js) — chỉ setup()
  // KHÔNG tự refresh() (chưa có phiên đầy đủ), confirm()/verify() có.
  const setupTwoFactor = useCallback((body) => api.post('/2fa/setup', body), []);
  const confirmTwoFactor = useCallback(async (token, code) => {
    const result = await api.post('/2fa/confirm', { token, code });
    await refresh();
    return result;
  }, [refresh]);
  const verifyTwoFactor = useCallback(async (token, { code, recoveryCode }) => withSessionConflict(async () => {
    const result = await api.post('/2fa/verify', { token, code, recoveryCode });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // Vân tay/Face ID (WebAuthn, bản 8.78) — xem routes/admin/webauthn.js.
  // 2 nhóm: quản lý thiết bị (cần phiên đầy đủ, dùng ở "Tài khoản của tôi")
  // và đăng nhập bằng thiết bị đã đăng ký (thay bước nhập mã 2FA, dùng ở
  // LoginPage.jsx — nhận "token" pending y hệt verifyTwoFactor() ở trên).
  const webauthnListDevices = useCallback(() => api.get('/webauthn/devices'), []);
  const webauthnDeleteDevice = useCallback((id) => api.del(`/webauthn/devices/${id}`), []);
  const webauthnRegisterOptions = useCallback(() => api.post('/webauthn/register/options', {}), []);
  const webauthnRegisterVerify = useCallback((response, label) => api.post('/webauthn/register/verify', { response, label }), []);
  const webauthnLoginOptions = useCallback((token) => api.post('/webauthn/login/options', { token }), []);
  const webauthnLoginVerify = useCallback(async (token, response) => withSessionConflict(async () => {
    const result = await api.post('/webauthn/login/verify', { token, response });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // Đăng nhập THẲNG bằng vân tay/Face ID — THAY THẾ HẲN mật khẩu (bản 8.89,
  // theo yêu cầu người dùng, mirror rp-user) — dùng ở LoginPage.jsx ngay
  // màn hình đầu tiên, KHÁC webauthnLoginOptions/Verify ở trên (những cái
  // đó vẫn đòi mật khẩu đúng trước). Nhận "username" (không phải token
  // 2FA, vì CHƯA qua bước mật khẩu nào).
  const webauthnPasswordlessOptions = useCallback((username) => api.post('/webauthn/login-by-username/options', { username }), []);
  const webauthnPasswordlessVerify = useCallback(async (token, response) => withSessionConflict(async () => {
    const result = await api.post('/webauthn/login-by-username/verify', { token, response });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const isSystemRole = !!me?.isSystemRole;
  const can = useCallback((menuCode) => isSystemRole || !!me?.menuAccess?.[menuCode], [isSystemRole, me]);
  const canEdit = useCallback((menuCode) => isSystemRole || !!me?.menuAccess?.[menuCode]?.canEdit, [isSystemRole, me]);

  return (
    <AuthContext.Provider value={{
      me, loading, login, logout, isSystemRole, can, canEdit, refresh, setupTwoFactor, confirmTwoFactor, verifyTwoFactor,
      webauthnListDevices, webauthnDeleteDevice, webauthnRegisterOptions, webauthnRegisterVerify, webauthnLoginOptions, webauthnLoginVerify,
      webauthnPasswordlessOptions, webauthnPasswordlessVerify
    }}>
      {children}
      {sessionConflict && (
        <Modal>
          <div className="modal-body">
            <h3>⚠️ Tài khoản này có thể đang đăng nhập ở nơi khác</h3>
            <p>Tiếp tục đăng nhập ở đây sẽ ĐĂNG XUẤT phiên đó ngay.</p>
            <p>Bạn có muốn tiếp tục?</p>
            <div className="inline-actions">
              <button type="button" disabled={confirmingOverride} onClick={() => sessionConflict.resolve(false)}>Huỷ</button>
              <button type="button" disabled={confirmingOverride} onClick={() => sessionConflict.resolve(true)}>{confirmingOverride ? 'Đang xử lý...' : 'OK'}</button>
            </div>
          </div>
        </Modal>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
