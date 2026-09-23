import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 phút

// Kiểm tra bản mới qua dist/version.json (ghi lúc build, xem vite.config.js)
// — so với __APP_VERSION__ đã nhúng lúc TRANG NÀY được tải. Khác nhau nghĩa
// là server đã có bản build MỚI HƠN kể từ lúc người dùng mở trang (thường
// gặp khi IT `git pull` + build lại trong lúc người dùng vẫn đang mở tab
// cũ) — trước đây không có cách nào biết ngoài tự Ctrl+F5, dễ dùng nhầm
// giao diện cũ.
export default function UpdateBanner() {
  const [newVersion, setNewVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.version && data.version !== __APP_VERSION__) {
          setNewVersion(data.version);
        }
      } catch {
        // Mạng lỗi/offline tạm thời — bỏ qua, lần kiểm tra sau tự thử lại.
      }
    }
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    // Quay lại tab sau khi để lâu (vd qua đêm) — kiểm tra ngay thay vì chờ
    // hết chu kỳ 5 phút tiếp theo.
    function onVisible() {
      if (document.visibilityState === 'visible') check();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!newVersion) return null;
  return (
    <div className="update-banner">
      <span>🔄 Đã có bản cập nhật mới (v{newVersion}) — tải lại trang để dùng bản mới nhất.</span>
      <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
    </div>
  );
}
