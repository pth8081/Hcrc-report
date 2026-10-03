// components/LoginHeroIllustration.jsx — xem chú thích đầy đủ ở
// rp-user/src/components/LoginHeroIllustration.jsx. Vẽ 2 "kho dữ liệu"
// (cylinder) trao đổi dữ liệu 2 chiều, đại diện cho "đồng bộ".
export default function LoginHeroIllustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="etl-hero-db" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b48ed6" />
          <stop offset="1" stopColor="#7a4f9e" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="150" rx="34" ry="9" fill="#000" opacity=".15" />
      <ellipse cx="170" cy="150" rx="34" ry="9" fill="#000" opacity=".15" />
      <rect x="24" y="60" width="52" height="80" rx="10" fill="url(#etl-hero-db)" />
      <ellipse cx="50" cy="60" rx="26" ry="10" fill="#dcc8ef" />
      <rect x="144" y="40" width="52" height="100" rx="10" fill="url(#etl-hero-db)" />
      <ellipse cx="170" cy="40" rx="26" ry="10" fill="#dcc8ef" />
      <path d="M80 75 C 105 55, 115 55, 140 70" stroke="#fff" strokeWidth="3" fill="none" strokeDasharray="6 6" />
      <path d="M140 70 l-10 -4 l2 10 z" fill="#fff" />
      <path d="M140 110 C 115 130, 105 130, 80 112" stroke="#fff" strokeWidth="3" fill="none" strokeDasharray="6 6" />
      <path d="M80 112 l10 4 l-2 -10 z" fill="#fff" />
      <circle cx="110" cy="25" r="5" fill="#fff" opacity=".5" />
      <circle cx="30" cy="30" r="3" fill="#fff" opacity=".4" />
    </svg>
  );
}
