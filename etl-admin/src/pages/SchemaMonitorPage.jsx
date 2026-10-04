// pages/SchemaMonitorPage.jsx — "Giám sát cấu trúc CSDL" (NHÁP — demo, chưa
// merge chính thức): giám sát bảng/cột THẬT mà các job đồng bộ đang bật
// (etl.SyncJobs) phụ thuộc vào — mỗi bảng được chụp lại cấu trúc cột (tên +
// kiểu dữ liệu) 1 lần/ngày (mặc định 6h sáng), so với lần chụp trước. Lệch
// (mất cột/bảng, HOẶC đổi kiểu dữ liệu 1 cột dù tên không đổi) -> gửi email
// cảnh báo NGAY (dùng lại etl/lib/mailer.js) + ghi vào đây. Nút "Kiểm tra
// tất cả ngay" ép chạy lại không đợi tới 6h sáng hôm sau.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const CHANGE_LABELS = {
  removed: { icon: '⛔', label: 'Mất cột/bảng' },
  added: { icon: '➕', label: 'Thêm cột mới' },
  typeChanged: { icon: '🔁', label: 'Đổi kiểu dữ liệu' }
};

function StatusBadge({ changeCount }) {
  return changeCount > 0
    ? <span className="conn-badge conn-badge--down">⚠️ {changeCount} thay đổi</span>
    : <span className="conn-badge conn-badge--ok">✅ Khớp schema</span>;
}

function ChangeDetail({ table }) {
  if (!table.changes.length) return null;
  return (
    <div className="schema-change-detail">
      {table.changes.map((c, i) => {
        const meta = CHANGE_LABELS[c.type];
        return (
          <div key={i} className="schema-change-row">
            <span>{meta.icon} {meta.label}</span>
            <span className="schema-change-col">{c.column}</span>
            {c.type === 'typeChanged' && <span className="schema-change-diff">{c.before} → {c.after}</span>}
            {c.type === 'removed' && c.usedByJobs?.length > 0 && (
              <span className="form-error">Đang dùng bởi job: {c.usedByJobs.join(', ')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SchemaMonitorPage() {
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  function load() {
    return api.get('/schema-monitor')
      .then(setTables)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function checkNow() {
    setChecking(true);
    setError('');
    try {
      const data = await api.post('/schema-monitor/check-now', {});
      setTables(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const changedCount = tables.filter(t => t.changes.length > 0).length;

  return (
    <div className="page">
      <h1>Giám sát cấu trúc CSDL</h1>
      <p className="form-hint">
        Theo dõi cấu trúc bảng/cột (tên + kiểu dữ liệu) của mọi bảng nguồn mà các job đồng
        bộ đang bật phụ thuộc vào — tự động kiểm tra lại mỗi ngày lúc 6h sáng, lệch là gửi
        email cảnh báo ngay. Bấm "Kiểm tra tất cả ngay" để ép kiểm tra tức thì.
      </p>
      {error && <p className="form-error">{error}</p>}

      {!loading && (
        <div className="conn-summary">
          <span className="conn-summary-total">{tables.length} bảng đang giám sát</span>
          {changedCount > 0
            ? <span className="conn-summary-down">⚠️ {changedCount} bảng có thay đổi</span>
            : <span className="conn-summary-ok">✅ Mọi bảng đều khớp cấu trúc đã lưu</span>}
        </div>
      )}

      <button type="button" onClick={checkNow} disabled={checking}>
        {checking ? 'Đang kiểm tra...' : '⟲ Kiểm tra tất cả ngay'}
      </button>

      <DataTable
        columns={[
          { key: 'dataSourceName', label: 'Nguồn dữ liệu' },
          { key: 'table', label: 'Bảng', render: (r) => `${r.schemaName}.${r.tableName}` },
          { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge changeCount={r.changes.length} /> },
          { key: 'lastCheckedAt', label: 'Kiểm tra lần cuối', render: (r) => new Date(r.lastCheckedAt).toLocaleString('vi-VN') },
          {
            key: 'detail', label: '', render: (r) => r.changes.length > 0 && (
              <button type="button" className="link-button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                {expanded === r.id ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              </button>
            )
          }
        ]}
        rows={tables}
        emptyMessage={loading ? 'Đang tải...' : 'Chưa có bảng nào trong diện giám sát.'}
      />
      {expanded && <ChangeDetail table={tables.find(t => t.id === expanded)} />}
    </div>
  );
}
