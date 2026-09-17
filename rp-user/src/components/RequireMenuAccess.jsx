// components/RequireMenuAccess.jsx — Chặn route theo ĐÚNG danh sách menu mà
// Sidebar dùng để vẽ (useAuth().hasMenu) — không có nguồn sự thật thứ 2 nào
// khác về quyền, tránh lệch giữa "thấy trong menu" và "vào được route".
// Truyền `code` (1 mã) cho route thường; truyền `codes` (mảng) cho route gộp
// nhiều mã menu con — vào được nếu CÓ ÍT NHẤT 1 mã trong mảng (vd trang
// "Báo cáo" gộp — xem modules/reports/ReportsPage.jsx). KHÔNG truyền cả 2
// (vd trang "Tài khoản của tôi") — chỉ còn kiểm tra ĐÃ ĐĂNG NHẬP, không đòi
// menuAccess nào, vì đây là chức năng của MỌI tài khoản, không gắn với 1
// trang/quyền cụ thể nào trong app.MenuItems.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function RequireMenuAccess({ code, codes, children }) {
  const { me, loading, hasMenu } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!me) return <Navigate to="/login" state={{ from: location }} replace />;
  const allowed = codes ? codes.some(hasMenu) : (code ? hasMenu(code) : true);
  if (!allowed) return <div className="page-forbidden">Bạn không có quyền truy cập trang này.</div>;

  return children;
}
