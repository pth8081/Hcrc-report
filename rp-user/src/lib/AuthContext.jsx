// lib/AuthContext.jsx — Một nguồn sự thật duy nhất cho "user hiện tại là ai,
// thấy được menu nào" — cả Sidebar lẫn RequireMenuAccess đều đọc từ đây, lấy
// từ GET /api/me (đã lọc theo quyền ở phía server, xem rp-server/routes/me.js).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null); // { username, fullName, roles, isSystemRole, menu }
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/me');
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Trả nguyên response cho LoginPage tự quyết định bước tiếp theo:
  // { ok: true } -> xong ngay (không phải vai trò Admin hệ thống, không cần 2FA)
  // { twofa: 'pending', token } -> đã bật 2FA, cần nhập mã (xem 2fa/verify)
  // { twofa: 'setupRequired', token } -> CHƯA bật 2FA, bắt buộc đăng ký ngay
  const login = useCallback(async (username, password) => {
    const result = await api.post('/auth/login', { username, password });
    if (result?.ok) await refresh();
    return result;
  }, [refresh]);

  // 3 bước còn lại của 2FA (xem rp-server/routes/twoFactor.js) — chỉ setup()
  // KHÔNG tự refresh() (chưa có phiên đầy đủ), confirm()/verify() có.
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

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const hasMenu = useCallback((code) => !!me?.menu?.some(m => m.code === code), [me]);

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, hasMenu, refresh, setupTwoFactor, confirmTwoFactor, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
