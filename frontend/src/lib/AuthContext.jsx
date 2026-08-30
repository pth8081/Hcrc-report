// lib/AuthContext.jsx — Một nguồn sự thật duy nhất cho "user hiện tại là ai,
// thấy được menu nào" — cả Sidebar lẫn RequireMenuAccess đều đọc từ đây, lấy
// từ GET /api/me (đã lọc theo quyền ở phía server, xem report-server/routes/me.js).
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

  const login = useCallback(async (username, password) => {
    await api.post('/auth/login', { username, password });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const hasMenu = useCallback((code) => !!me?.menu?.some(m => m.code === code), [me]);

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, hasMenu, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
