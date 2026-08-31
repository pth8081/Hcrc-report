// lib/AuthContext.jsx — Người quản trị hiện tại (username, role). Chỉ 2 vai
// trò ('admin'/'viewer') — không có cây quyền như rp-user/ chính, quy mô
// trang quản trị API nhỏ hơn nhiều (xem tài liệu kiến trúc, mục 03).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null); // { username, role }
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
  // { ok: true } -> xong ngay (vai trò khác 'admin', không cần 2FA)
  // { twofa: 'pending', token } -> đã bật 2FA, cần nhập mã (xem 2fa/verify)
  // { twofa: 'setupRequired', token } -> CHƯA bật 2FA, bắt buộc đăng ký ngay
  const login = useCallback(async (username, password) => {
    const result = await api.post('/auth/login', { username, password });
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

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const isAdmin = me?.role === 'admin';

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, isAdmin, refresh, setupTwoFactor, confirmTwoFactor, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
