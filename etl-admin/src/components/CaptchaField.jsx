// components/CaptchaField.jsx — Ô "Mã xác nhận" (captcha 4 chữ số, bản
// 8.39) cho form đăng nhập — tự tải ảnh lúc mount, lộ ra refresh() qua ref
// để LoginPage gọi lại sau MỖI lần submit (captcha dùng 1 lần, token cũ
// luôn chết sau khi server kiểm tra dù đúng hay sai — xem lib/captcha.js.
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { api } from '../lib/api';

const CaptchaField = forwardRef(function CaptchaField({ value, onChange, onTokenChange, disabled }, ref) {
  const [svg, setSvg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const result = await api.get('/auth/captcha');
      setSvg(result.svg);
      onTokenChange(result.token);
    } catch (err) {
      // Log ra console trình duyệt (bản 8.74) — trước đây lỗi bị NUỐT HOÀN
      // TOÀN (không console.error), captcha hiện rỗng mà không ai (kể cả
      // người mở DevTools) biết lý do thật — lỗi thật đã gặp.
      console.error('Không tải được captcha:', err);
      setSvg('');
      onTokenChange('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);
  useImperativeHandle(ref, () => ({ refresh: load }));

  return (
    <label>
      <span className="field-label">Mã xác nhận</span>
      <div className="captcha-row">
        <div className="captcha-img" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Ảnh mã xác nhận" />
        <button type="button" className="captcha-refresh" onClick={load} disabled={loading || disabled} title="Lấy mã khác">⟲</button>
      </div>
      <span className="input-wrap">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nhập 4 số trong ảnh" maxLength={4} inputMode="numeric" autoComplete="off" disabled={disabled} />
      </span>
    </label>
  );
});

export default CaptchaField;
