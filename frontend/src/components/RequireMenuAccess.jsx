// components/RequireMenuAccess.jsx — Chặn route theo ĐÚNG danh sách menu mà
// Sidebar dùng để vẽ (useAuth().hasMenu) — không có nguồn sự thật thứ 2 nào
// khác về quyền, tránh lệch giữa "thấy trong menu" và "vào được route".
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function RequireMenuAccess({ code, children }) {
  const { me, loading, hasMenu } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!me) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!hasMenu(code)) return <div className="page-forbidden">Bạn không có quyền truy cập trang này.</div>;

  return children;
}
