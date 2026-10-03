// components/LoginHeroIllustration.jsx — xem chú thích đầy đủ ở
// rp-user/src/components/LoginHeroIllustration.jsx. Vẽ 1 node trung tâm
// nối 4 node vệ tinh, đại diện cho "kết nối hệ thống/API".
export default function LoginHeroIllustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="api-hero-node" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6fd6bd" />
          <stop offset="1" stopColor="#1c7566" />
        </linearGradient>
      </defs>
      <line x1="110" y1="90" x2="40" y2="40" stroke="#fff" strokeWidth="2.5" opacity=".6" />
      <line x1="110" y1="90" x2="180" y2="40" stroke="#fff" strokeWidth="2.5" opacity=".6" />
      <line x1="110" y1="90" x2="40" y2="140" stroke="#fff" strokeWidth="2.5" opacity=".6" />
      <line x1="110" y1="90" x2="180" y2="140" stroke="#fff" strokeWidth="2.5" opacity=".6" />
      <circle cx="40" cy="40" r="16" fill="url(#api-hero-node)" />
      <circle cx="180" cy="40" r="16" fill="url(#api-hero-node)" />
      <circle cx="40" cy="140" r="16" fill="url(#api-hero-node)" />
      <circle cx="180" cy="140" r="16" fill="url(#api-hero-node)" />
      <circle cx="110" cy="90" r="28" fill="url(#api-hero-node)" stroke="#fff" strokeWidth="3" />
      <text x="110" y="97" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff" fontFamily="monospace">{'{ }'}</text>
    </svg>
  );
}
