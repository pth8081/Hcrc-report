// lib/AuthContext.jsx — Người quản trị hiện tại (username + quyền tra theo
// nhóm quyền động, xem api-server/lib/adminPermissions.js) — thay mô hình 2
// Role cố định cũ ('admin'/'viewer'). `isSystemRole` (mirror rp-user) vào
// được MỌI trang; còn lại tra `menuAccess[menuCode]` — có mặt nghĩa là
// "xem", `canEdit` là "sửa/xoá" (giữ đúng phân biệt view/edit của mô hình
// cũ, khác rp-user vốn chỉ nhị phân thấy/không thấy).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Trả nguyên response cho LoginPage tự quyết định bước tiếp theo:
  // { ok: true } -> xong ngay (không phải vai trò hệ thống, không cần 2FA)
  // { twofa: 'pending', token } -> đã bật 2FA, cần nhập mã (xem 2fa/verify)
  // { twofa: 'setupRequired', token } -> CHƯA bật 2FA, bắt buộc đăng ký ngay
  const login = useCallback(async (username, password, captchaToken, captchaAnswer) => {
    const result = await api.post('/auth/login', { username, password, captchaToken, captchaAnswer });
    if (result?.ok) await refresh();
    return result;
  }, [refresh]);

  // 3 bước còn lại của 2FA (xem api-server/routes/admin/twoFactor.js) — chỉ
  // setup() KHÔNG tự refresh() (chưa có phiên đầy đủ), confirm()/verify() có.
  const setupTwoFactor = useCallback((body) => api.post('/2fa/setup', body), []);
  const confirmTwoFactor = useCallback(async (token, code) => {
    const result = await api.post('/2fa/confirm', { token, code });
    await refresh();
    return result;
  }, [refresh]);
  const verifyTwoFactor = useCallback(async (token, { code, recoveryCode }) => {
    const result = await api.post('/2fa/verify', { token, code, recoveryCode });
    await refresh();
    return result;
  }, [refresh]);

  // Vân tay/Face ID (WebAuthn, bản 8.78) — xem routes/admin/webauthn.js.
  // 2 nhóm: quản lý thiết bị (cần phiên đầy đủ, dùng ở "Tài khoản của tôi")
  // và đăng nhập bằng thiết bị đã đăng ký (thay bước nhập mã 2FA, dùng ở
  // LoginPage.jsx — nhận "token" pending y hệt verifyTwoFactor() ở trên).
  const webauthnListDevices = useCallback(() => api.get('/webauthn/devices'), []);
  const webauthnDeleteDevice = useCallback((id) => api.del(`/webauthn/devices/${id}`), []);
  const webauthnRegisterOptions = useCallback(() => api.post('/webauthn/register/options', {}), []);
  const webauthnRegisterVerify = useCallback((response, label) => api.post('/webauthn/register/verify', { response, label }), []);
  const webauthnLoginOptions = useCallback((token) => api.post('/webauthn/login/options', { token }), []);
  const webauthnLoginVerify = useCallback(async (token, response) => {
    const result = await api.post('/webauthn/login/verify', { token, response });
    await refresh();
    return result;
  }, [refresh]);

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
      webauthnListDevices, webauthnDeleteDevice, webauthnRegisterOptions, webauthnRegisterVerify, webauthnLoginOptions, webauthnLoginVerify
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
