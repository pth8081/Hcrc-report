// components/PasswordInput.jsx — Ô nhập mật khẩu có nút "hiện/ẩn" (mắt) —
// mặc định ẩn (type="password", đúng chuẩn), bấm nút mới tạm hiện ra dạng
// chữ để người dùng tự kiểm tra đã gõ đúng trước khi lưu. Trước đây trang
// "Phân quyền" dùng window.prompt() để đặt lại mật khẩu — hộp thoại đó LUÔN
// hiện chữ thô, không có cách nào ẩn (rà soát UI/bảo mật) — component này
// thay thế, dùng chung cho cả "Tài khoản của tôi" và modal "Đặt lại mật khẩu".
import { useState } from 'react';

export default function PasswordInput({ value, onChange, placeholder, autoComplete, required, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
      />
      <button type="button" className="password-toggle" onClick={() => setShow(!show)} tabIndex={-1} title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}
