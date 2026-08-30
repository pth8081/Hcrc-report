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

  const login = useCallback(async (username, password) => {
    await api.post('/auth/login', { username, password });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const isAdmin = me?.role === 'admin';

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, isAdmin, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
