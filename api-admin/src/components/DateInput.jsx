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
// Bấm MỞ LỊCH (bản 9.26, SỬA LỖI — báo cáo người dùng: "bấm hơi khó, phải
// bấm đúng vào biểu tượng") — input ẩn tuy phủ TRỌN khung (position:
// absolute; inset:0) nhưng trình duyệt chỉ coi đúng vùng icon lịch RIÊNG
// của CHÍNH nó là "mở lịch"; bấm vào phần CHỮ (dù đã ẩn) chỉ focus 1 đoạn
// ngày/tháng/năm để gõ tay — KHÔNG mở lịch, và vì input ẩn nên gõ tay
// không thấy phản hồi gì (coi như không dùng được). Gọi thẳng
// `input.showPicker()` (hỗ trợ Chrome/Edge 99+, Firefox 101+, Safari
// 16.4+) trong `onClick` của CẢ khung ngoài — bấm vào BẤT KỲ đâu trong ô
// đều mở lịch ngay, không cần nhắm đúng icon. Trình duyệt CŨ không hỗ trợ
// `showPicker()` (hiếm) vẫn còn đường lùi: click tự nhiên vẫn lọt xuống
// input ẩn bên dưới (không bị chặn), hoạt động như trước bản này (phải
// bấm đúng icon) — không có gì MẤT ĐI, chỉ THÊM cách mở nhanh hơn.
import { useRef } from 'react';

function formatDisplay(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

export default function DateInput({ value, onChange, className, ...rest }) {
  const inputRef = useRef(null);
  const display = formatDisplay(value);

  function openPicker() {
    try {
      inputRef.current?.showPicker?.();
    } catch {
      /* trình duyệt chặn (hiếm, vd gọi ngoài cử chỉ người dùng) — bỏ qua,
         click tự nhiên xuống input ẩn vẫn còn tác dụng như đường lùi. */
    }
  }

  return (
    <span className={`date-input-wrap${className ? ` ${className}` : ''}`} onClick={openPicker}>
      <span className="date-input-display">
        <span className={value ? '' : 'date-input-placeholder'}>{display || 'dd/mm/yyyy'}</span>
        <span className="date-input-icon" aria-hidden="true">📅</span>
      </span>
      <input ref={inputRef} type="date" className="date-input-native" value={value || ''} onChange={onChange} {...rest} />
    </span>
  );
}
