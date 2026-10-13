// components/DateInput.jsx — Ô nhập ngày LUÔN hiện dd/mm/yyyy (bản 9.25,
// theo yêu cầu người dùng) — <input type="date"> gốc hiện mm/dd/yyyy hay
// dd/mm/yyyy TUỲ ngôn ngữ/vùng của trình duyệt người dùng, web không tự
// quyết định được định dạng đó. Vẫn DÙNG <input type="date"> THẬT bên
// dưới (ẩn đi bằng opacity:0, không phải display:none — vẫn nhận click/
// gõ phím bình thường) để giữ lịch chọn ngày có sẵn của hệ điều hành
// (đặc biệt tiện trên điện thoại) — chỉ vẽ ĐÈ lên 1 lớp hiển thị LUÔN
// đúng dd/mm/yyyy. `value`/`onChange` giữ NGUYÊN hợp đồng y hệt input
// ngày thường (chuỗi ISO yyyy-mm-dd) — mọi nơi gọi chỉ cần đổi tên thẻ từ
// `<input type="date" .../>` sang `<DateInput .../>`, giữ nguyên mọi
// prop khác (value/onChange/max/min/disabled/required...).
//
// Đánh đổi CHẤP NHẬN ĐƯỢC: gõ tay trực tiếp vào input ẩn (thay vì bấm mở
// lịch) sẽ KHÔNG thấy phản hồi từng phím gõ (lớp hiển thị chỉ cập nhật
// khi `onChange` bắn ra, tức gõ xong đủ 1 ngày hợp lệ) — đa số người dùng
// bấm mở lịch chọn thay vì gõ tay, nhất là trên điện thoại.
function formatDisplay(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

export default function DateInput({ value, onChange, className, ...rest }) {
  const display = formatDisplay(value);
  return (
    <span className={`date-input-wrap${className ? ` ${className}` : ''}`}>
      <span className="date-input-display">
        <span className={value ? '' : 'date-input-placeholder'}>{display || 'dd/mm/yyyy'}</span>
        <span className="date-input-icon" aria-hidden="true">📅</span>
      </span>
      <input type="date" className="date-input-native" value={value || ''} onChange={onChange} {...rest} />
    </span>
  );
}
