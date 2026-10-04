// pages/TlsCertificatePage.jsx — Trang "Chứng chỉ TLS" (bản 8.71, theo yêu
// cầu người dùng) — upload CA/private key/public cert để ETL Server (cổng
// 4003) VÀ etl-admin (cổng 5175) tự chạy HTTPS, KHÔNG cần Nginx đứng trước
// (dành cho topology "PM2-only" — xem deploy/Hướng dẫn triển khai PM2.md).
// Thao tác CỰC KỲ NHẠY CẢM — CHỈ hiện cho tài khoản vai trò hệ thống thật
// (isSystemRole), KHÔNG qua hệ thống menu/RoleMenuAccess thông thường
// (không thể giao cho 1 tài khoản "quản lý thông thường" nào khác).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export default function TlsCertificatePage() {
  const { isSystemRole } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [keyFile, setKeyFile] = useState(null);
  const [certFile, setCertFile] = useState(null);
  const [caFile, setCaFile] = useState(null);

  function reload() {
    api.get('/tls-certificate').then(setStatus).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function submitUpload(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!keyFile || !certFile) return setError('Chọn đủ file private key và public cert (CA tuỳ chọn)');
    if (!confirm('Upload chứng chỉ TLS MỚI cho ETL Server + etl-admin? Thao tác này ảnh hưởng tới kết nối HTTPS của toàn hệ thống.')) return;

    const formData = new FormData();
    formData.append('privateKey', keyFile);
    formData.append('certificate', certFile);
    if (caFile) formData.append('caCertificate', caFile);

    setUploading(true);
    try {
      const res = await api.post('/tls-certificate', formData, true);
      setResult(res);
      setKeyFile(null);
      setCertFile(null);
      setCaFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!isSystemRole) {
    return (
      <div className="page">
        <h1>Chứng chỉ TLS</h1>
        <p className="form-error">Chỉ tài khoản vai trò hệ thống mới vào được trang này.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Chứng chỉ TLS</h1>
      <p className="form-hint">
        Upload CA/private key/public cert để ETL Server (cổng 4003) và etl-admin (cổng 5175) tự
        chạy HTTPS trực tiếp — dùng khi triển khai KHÔNG có Nginx đứng trước. Nếu đã dùng Nginx để
        lo HTTPS, KHÔNG cần dùng trang này.
      </p>
      {error && <p className="form-error">{error}</p>}

      <h2>Trạng thái hiện tại</h2>
      {!status ? (
        <p className="form-hint">Đang tải...</p>
      ) : status.cert ? (
        <ul>
          <li>Đang chạy: <strong>{status.isRunningHttps ? 'HTTPS' : 'HTTP (chưa áp dụng — cần restart, xem bên dưới)'}</strong></li>
          <li>Chủ thể (Subject): {status.cert.subject}</li>
          <li>Cấp bởi (Issuer): {status.cert.issuer}</li>
          <li>Hiệu lực: {status.cert.validFrom} — {status.cert.validTo}</li>
          <li>Có kèm CA/chain: {status.cert.hasCa ? 'Có' : 'Không'}</li>
        </ul>
      ) : (
        <p>Chưa upload chứng chỉ nào — đang chạy HTTP.</p>
      )}

      <h2>Upload chứng chỉ mới</h2>
      <form className="stacked-form" onSubmit={submitUpload}>
        <label>Private key (.key/.pem) — bắt buộc</label>
        <input type="file" accept=".pem,.key,.crt,.txt" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} required />
        <label>Public cert / chứng chỉ máy chủ (.crt/.pem) — bắt buộc</label>
        <input type="file" accept=".pem,.crt,.cer,.txt" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} required />
        <label>CA/chain (.pem/.crt) — tuỳ chọn, chỉ cần nếu CA cấp kèm file chuỗi chứng chỉ riêng</label>
        <input type="file" accept=".pem,.crt,.cer,.txt" onChange={(e) => setCaFile(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={uploading}>{uploading ? 'Đang upload...' : 'Upload chứng chỉ'}</button>
      </form>

      {result && (
        <div className="import-result">
          <p>✅ Đã lưu chứng chỉ mới.</p>
          {result.appliedLive && <p>Đã áp dụng NGAY (không cần restart) — chứng chỉ cũ chỉ là gia hạn/thay thế.</p>}
          {result.restartRequired && (
            <p className="form-error">
              Đây là lần upload ĐẦU TIÊN (từ HTTP sang HTTPS) — PHẢI chạy lệnh sau trên máy chủ để
              áp dụng: <code>{result.restartCommand}</code> (Node không tự chuyển 1 tiến trình đang
              chạy HTTP sang HTTPS mà không restart).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
