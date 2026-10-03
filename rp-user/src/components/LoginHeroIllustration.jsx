// components/LoginHeroIllustration.jsx — Hình minh hoạ cho khung "hero" ở
// trang Đăng nhập (bản 8.38, theo yêu cầu người dùng: bớt chữ, thêm hình
// đại diện cho ứng dụng, "hiện đại" hơn) — SVG nội tuyến (không tải ảnh
// ngoài, đổi màu được qua stop-color, nhẹ) vẽ 1 khung trình duyệt/màn hình
// với biểu đồ cột tăng dần, đại diện cho "xem báo cáo/ra quyết định".
export default function LoginHeroIllustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rp-hero-bar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8a876" />
          <stop offset="1" stopColor="#b5551f" />
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="180" height="120" rx="12" fill="#1a2740" stroke="#3a4a68" strokeWidth="2" />
      <rect x="20" y="20" width="180" height="18" rx="12" fill="#2a3a58" />
      <circle cx="32" cy="29" r="3" fill="#e8590c" />
      <circle cx="42" cy="29" r="3" fill="#f0a500" />
      <circle cx="52" cy="29" r="3" fill="#2f9e44" />
      <rect x="40" y="95" width="18" height="35" rx="3" fill="url(#rp-hero-bar)" />
      <rect x="68" y="78" width="18" height="52" rx="3" fill="url(#rp-hero-bar)" />
      <rect x="96" y="60" width="18" height="70" rx="3" fill="url(#rp-hero-bar)" />
      <rect x="124" y="85" width="18" height="45" rx="3" fill="url(#rp-hero-bar)" />
      <rect x="152" y="68" width="18" height="62" rx="3" fill="url(#rp-hero-bar)" />
      <path d="M44 90 L77 70 L105 52 L133 75 L161 58" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
