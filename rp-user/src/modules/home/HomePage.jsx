import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

// Icon theo "code" menu — cùng bộ với components/Layout.jsx (trùng lặp có
// chủ đích, 2 nơi hiển thị khác mục đích: sidebar điều hướng, đây là lối
// tắt truy cập nhanh trên trang chủ).
const ICONS = {
  home: '🏠',
  dashboard: '📊',
  reports: '📈',
  system: '⚙️',
  'system-permissions': '🔐',
  'system-report-catalog': '🗂️',
  'system-audit-log': '📜',
  'system-categories': '🏷️',
  'system-email-settings': '✉️',
  'system-email-schedules': '⏱️',
  'system-anomaly-alerts': '⚠️',
  'system-hcrc-workspace': '🔗'
};
function iconFor(code) { return ICONS[code] || '📄'; }

export default function HomePage() {
  const { me } = useAuth();
  const menu = me?.menu || [];
  const reportGroups = menu.filter(m => m.code.startsWith('reports-'));
  const rootItems = menu.filter(m => !m.parentId && !m.code.startsWith('reports-') && m.code !== 'home');
  const systemChildren = menu.filter(m => m.parentId);

  const quickLinks = [...rootItems];
  if (reportGroups.length) quickLinks.unshift({ code: 'reports', label: 'Báo cáo', path: '/reports' });

  const firstName = (me?.fullName || '').split(' ').pop();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1><span>👋</span> Chào {firstName || me?.fullName}</h1>
          <p>Chọn một mục bên dưới (hoặc ở thanh bên) để bắt đầu xem báo cáo và vận hành hệ thống.</p>
        </div>
      </div>

      <div className="home-cards">
        {quickLinks.map(item => (
          <Link key={item.code} to={item.path} className="home-card">
            <span className="home-card-icon">{iconFor(item.code)}</span>
            <span className="home-card-label">{item.label}</span>
          </Link>
        ))}
      </div>

      {systemChildren.length > 0 && (
        <>
          <h3>⚙️ Hệ thống</h3>
          <div className="home-cards home-cards--compact">
            {systemChildren.map(item => (
              <Link key={item.code} to={item.path} className="home-card home-card--compact">
                <span className="home-card-icon">{iconFor(item.code)}</span>
                <span className="home-card-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {quickLinks.length === 0 && systemChildren.length === 0 && (
        <p className="muted">Tài khoản của bạn chưa được cấp quyền vào mục nào — liên hệ quản trị viên nếu đây là nhầm lẫn.</p>
      )}
    </div>
  );
}
