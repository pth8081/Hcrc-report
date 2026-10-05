// modules/system/tls-certificate/TlsCertificatePage.jsx — Trang "Chứng chỉ
// TLS" (bản 8.71, theo yêu cầu người dùng) — upload CA/private key/public
// cert để Report Server (cổng 4001) VÀ rp-user (cổng 5173) tự chạy HTTPS,
// KHÔNG cần Nginx đứng trước (dành cho topology "PM2-only" — xem
// deploy/Hướng dẫn triển khai PM2.md). Thao tác CỰC KỲ NHẠY CẢM — CHỈ hiện
// cho tài khoản vai trò hệ thống thật (isSystemRole), KHÔNG qua hệ thống
// app.MenuItems/RoleMenuAccess thông thường (không thể giao cho vai trò
// nào khác — xem components/Layout.jsx).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';

export default function TlsCertificatePage() {
  const { isSystemRole } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [keyFile, setKeyFile] = useState(null);
  const [certFile, setCertFile] = useState(null);
  const [caFile, setCaFile] = useState(null);

  // "CA tin cậy" (bản 8.72) — chiều NGƯỢC LẠI: Report Server tự GỌI RA
  // sang hệ thống khác dùng HTTPS ký bởi CA nội bộ/tự tạo (vd gọi sang
  // api-server, bản 8.70) thì cần thêm CA đó vào đây — xem rp-server/
  // lib/trustedCa.js.
  const [trustedCas, setTrustedCas] = useState([]);
  const [trustedCaError, setTrustedCaError] = useState('');
  const [newCaLabel, setNewCaLabel] = useState('');
  const [newCaFile, setNewCaFile] = useState(null);
  const [addingCa, setAddingCa] = useState(false);
  const [deletingCaId, setDeletingCaId] = useState(null);

  function reload() {
    api.get('/tls-certificate').then(setStatus).catch(err => setError(err.message));
  }
  function reloadTrustedCas() {
    api.get('/trusted-ca').then(setTrustedCas).catch(err => setTrustedCaError(err.message));
  }
  useEffect(() => { reload(); reloadTrustedCas(); }, []);

  async function submitAddCa(e) {
    e.preventDefault();
    setTrustedCaError('');
    if (!newCaLabel.trim() || !newCaFile) return setTrustedCaError('Nhập nhãn + chọn file CA trước');
    setAddingCa(true);
    try {
      const pem = await newCaFile.text();
      await api.post('/trusted-ca', { label: newCaLabel.trim(), pem });
      setNewCaLabel('');
      setNewCaFile(null);
      reloadTrustedCas();
    } catch (err) {
      setTrustedCaError(err.message);
    } finally {
      setAddingCa(false);
    }
  }

  async function removeCa(ca) {
    if (!confirm(`Bỏ tin cậy CA "${ca.label}"? Các cuộc gọi HTTPS ra ngoài đang dựa vào CA này sẽ bị từ chối lại.`)) return;
    setDeletingCaId(ca.id);
    try {
      await api.del(`/trusted-ca/${ca.id}`);
      reloadTrustedCas();
    } catch (err) {
      setTrustedCaError(err.message);
    } finally {
      setDeletingCaId(null);
    }
  }

  async function submitUpload(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!keyFile || !certFile) return setError('Chọn đủ file private key và public cert (CA tuỳ chọn)');
    if (!confirm('Upload chứng chỉ TLS MỚI cho Report Server + rp-user? Thao tác này ảnh hưởng tới kết nối HTTPS của toàn hệ thống.')) return;

    const formData = new FormData();
    formData.append('privateKey', keyFile);
    formData.append('certificate', certFile);
    if (caFile) formData.append('caCertificate', caFile);

    setUploading(true);
    try {
      const res = await api.upload('/tls-certificate', formData);
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
        <h2>Chứng chỉ TLS</h2>
        <p className="form-error">Chỉ tài khoản vai trò hệ thống mới vào được trang này.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Chứng chỉ TLS</h2>
      <p className="form-hint">
        Upload CA/private key/public cert để Report Server (cổng 4001) và rp-user (cổng 5173) tự
        chạy HTTPS trực tiếp — dùng khi triển khai KHÔNG có Nginx đứng trước. Nếu đã dùng Nginx để
        lo HTTPS, KHÔNG cần dùng trang này.
      </p>
      {error && <p className="form-error">{error}</p>}

      <h3>Trạng thái hiện tại</h3>
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

      <h3>Upload chứng chỉ mới</h3>
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
            <>
              <p className="form-error">
                Đây là lần upload ĐẦU TIÊN (từ HTTP sang HTTPS) — PHẢI chạy lệnh sau trên máy chủ để
                áp dụng: <code>{result.restartCommand}</code> (Node không tự chuyển 1 tiến trình đang
                chạy HTTP sang HTTPS mà không restart).
              </p>
              <p className="form-error">
                Nếu triển khai KHÔNG dùng Nginx (dùng <code>deploy/serve-static.js</code> chạy bằng
                PM2 trực tiếp): tiến trình phục vụ giao diện <code>hcrc-rp-user</code> gọi API qua 1
                proxy nội bộ sang <code>hcrc-rp-server</code> — backend vừa đổi sang HTTPS thì proxy
                đó CŨNG phải biết, nếu không MỌI API (kể cả mã xác nhận) sẽ báo lỗi "Không kết nối
                được backend". Thêm dòng <code>TLS_CERT_DIR: '../rp-server/certs'</code> vào mục{' '}
                <code>env</code> của <code>hcrc-rp-user</code> trong{' '}
                <code>deploy/ecosystem.config.js</code>, rồi chạy thêm{' '}
                <code>pm2 restart hcrc-rp-user</code>.
              </p>
            </>
          )}
        </div>
      )}

      <hr />
      <h3>CA tin cậy (cho các cuộc gọi ra ngoài)</h3>
      <p className="form-hint">
        Dùng CHIỀU NGƯỢC LẠI với phần trên — khi Report Server tự GỌI RA sang 1 hệ thống khác dùng
        HTTPS ký bởi CA nội bộ/tự tạo (không phải CA công khai như Let's Encrypt — vd gọi sang
        api-server, bản 8.70), cuộc gọi sẽ bị từ chối ("self signed certificate") trừ khi thêm đúng
        CA đó vào đây. Áp dụng NGAY, không cần restart.
      </p>
      {trustedCaError && <p className="form-error">{trustedCaError}</p>}

      <table className="data-table">
        <thead>
          <tr><th>Nhãn</th><th>Chủ thể</th><th>Hiệu lực</th><th></th></tr>
        </thead>
        <tbody>
          {trustedCas.length === 0 ? (
            <tr><td colSpan={4}>Chưa thêm CA tin cậy nào.</td></tr>
          ) : trustedCas.map(ca => (
            <tr key={ca.id}>
              <td>{ca.label}</td>
              <td>{ca.subject || '(không đọc được)'}</td>
              <td>{ca.validTo ? `${ca.validFrom} — ${ca.validTo}` : '—'}</td>
              <td>
                <button type="button" onClick={() => removeCa(ca)} disabled={deletingCaId === ca.id}>
                  {deletingCaId === ca.id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Thêm CA tin cậy mới</h3>
      <form className="stacked-form" onSubmit={submitAddCa}>
        <label>Nhãn (tên gợi nhớ, vd "api-server nội bộ", "HCRC Workspace")</label>
        <input type="text" value={newCaLabel} onChange={(e) => setNewCaLabel(e.target.value)} required />
        <label>File CA (.pem/.crt)</label>
        <input type="file" accept=".pem,.crt,.cer,.txt" onChange={(e) => setNewCaFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={addingCa}>{addingCa ? 'Đang thêm...' : 'Thêm CA tin cậy'}</button>
      </form>
    </div>
  );
}
