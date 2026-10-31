// components/CopyableText.jsx — hiện 1 chuỗi (URL/API key...) kèm nút "Sao
// chép" — tách ra dùng CHUNG (bản 10.58, theo yêu cầu người dùng — hiện link
// URL đầy đủ để gửi đối tác, giống cách bí mật đối tác đã hiện), mirror ĐÚNG
// hàm copyToClipboard()/component CopyableSecret cục bộ đã có sẵn trong
// ConsumersPage.jsx từ trước — KHÔNG đổi gì ở ConsumersPage.jsx (giữ nguyên
// bản cục bộ đang chạy ổn định), chỉ dùng component này cho các trang MỚI
// cần hiện chuỗi copy-được (ReportCatalogPage/VoucherSettingsPage).
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    alert(`Không tự sao chép được (trình duyệt chặn) — bôi đen "${label}" và Ctrl+C thủ công.`);
  }
}

export default function CopyableText({ value, label }) {
  return (
    <span className="inline-actions">
      <code>{value}</code>
      <button type="button" onClick={() => copyToClipboard(value, label)}>Sao chép</button>
    </span>
  );
}
