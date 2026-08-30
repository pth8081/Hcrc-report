// lib/AuthContext.jsx — Người quản trị hiện tại (username, role). 3 vai trò
// ('admin'/'viewer'/'target_importer', xem etl/lib/adminAuth.js) — vẫn gọn
// hơn nhiều so với cây phân quyền của HCRC_RP.
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

  const login = useCallback(async (username, password) => {
    await api.post('/auth/login', { username, password });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const isAdmin = me?.role === 'admin';
  const isTargetImporter = me?.role === 'target_importer';
  // 'admin' vào được MỌI trang (kể cả Nhập chỉ tiêu); 'target_importer' CHỈ
  // vào được trang Nhập chỉ tiêu (xem components/Layout.jsx lọc menu theo cờ này).
  const canImportTargets = isAdmin || isTargetImporter;

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, isAdmin, isTargetImporter, canImportTargets, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
