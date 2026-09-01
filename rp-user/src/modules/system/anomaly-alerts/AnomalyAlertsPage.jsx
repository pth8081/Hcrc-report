// modules/system/anomaly-alerts/AnomalyAlertsPage.jsx — Trang "Cảnh báo bất
// thường": CRUD app.AnomalyAlerts (xem rp-server/lib/anomalyAlertRunner.js +
// jobs/anomalyAlertScheduler.js). Chọn MỘT báo cáo đã có (không hardcode
// domain/chỉ số nào) + đúng 1 bộ lọc khoảng ngày dùng PRESET tương đối làm
// "kỳ hiện tại" (giống cấu hình lịch gửi email, xem
// modules/system/email-schedules/EmailSchedulesPage.jsx) + tên cột "thực
// thể"/cột số cần theo dõi (gõ tay, giống HighlightColumnKey ở lịch gửi
// email) + ngưỡng % + kỳ so sánh (liền trước / cùng kỳ năm trước) — hệ thống
// tự chạy lại báo cáo 2 lần theo lịch, chỉ gửi email khi có dòng vượt ngưỡng.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const DATE_RANGE_PRESET_OPTIONS = [
  { value: '', label: '— Chọn khoảng ngày —' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last7days', label: '7 ngày qua' },
  { value: 'last30days', label: '30 ngày qua' },
  { value: 'thisWeek', label: 'Tuần này' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' }
];

function emptyForm() {
  return {
    name: '', reportId: '', filterValues: {}, alertMode: 'periodComparison', compareMode: 'previousPeriod',
    entityColumnKey: '', metricColumnKey: '', thresholdPercent: 20,
    thresholdDirection: 'below', thresholdValue: '',
    recipients: '', cronExpression: '0 7 * * *'
  };
}

function alertToForm(row) {
  return {
    name: row.Name, reportId: row.ReportId, filterValues: row.FilterValues || {},
    alertMode: row.AlertMode || 'periodComparison', compareMode: row.CompareMode,
    entityColumnKey: row.EntityColumnKey, metricColumnKey: row.MetricColumnKey,
    thresholdPercent: row.ThresholdPercent, thresholdDirection: row.ThresholdDirection || 'below',
    thresholdValue: row.ThresholdValue ?? '',
    recipients: row.Recipients, cronExpression: row.CronExpression,
    isActive: row.IsActive
  };
}

// Ô cấu hình bộ lọc — field 'dateRange' chọn preset ("kỳ hiện tại") — BẮT
// BUỘC ở chế độ so kỳ % (hệ thống cần field này để tự dịch sang kỳ so sánh),
// TUỲ CHỌN ở chế độ ngưỡng tuyệt đối (chỉ chạy 1 lần, không cần kỳ so sánh —
// có báo cáo còn không có bộ lọc ngày nào, vd tồn kho thời điểm). Field khác
// tuỳ chọn giá trị cố định — cùng khuôn FilterConfigFields ở trang Lịch gửi
// email.
function FilterConfigFields({ filters, filterValues, onChange, dateRequired }) {
  if (!filters.length) {
    return dateRequired
      ? <p className="muted">Báo cáo này không có bộ lọc nào — cần ít nhất 1 bộ lọc khoảng ngày mới dùng được chế độ so kỳ %.</p>
      : null;
  }
  return (
    <div className="filter-config">
      {filters.map(f => {
        const entry = filterValues[f.field] || {};
        if (f.type === 'dateRange') {
          return (
            <label key={f.field}>
              {f.label || f.field} {dateRequired ? '(kỳ hiện tại)' : '(tuỳ chọn)'}
              <select
                value={entry.kind === 'dateRangePreset' ? entry.preset : ''}
                onChange={(e) => {
                  const preset = e.target.value;
                  const next = { ...filterValues };
                  if (preset) next[f.field] = { kind: 'dateRangePreset', preset };
                  else delete next[f.field];
                  onChange(next);
                }}
                required={dateRequired}
              >
                {DATE_RANGE_PRESET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          );
        }
        return (
          <label key={f.field}>
            {f.label || f.field}{f.type === 'multiSelect' ? ' (phân tách dấu phẩy)' : ''}
            <input
              placeholder="Để trống = không lọc"
              value={entry.kind === 'fixed' ? entry.value : ''}
              onChange={(e) => {
                const value = e.target.value;
                const next = { ...filterValues };
                if (value) next[f.field] = { kind: 'fixed', value };
                else delete next[f.field];
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

function AlertFormFields({ form, setForm, reports, reportLocked }) {
  const selectedReport = reports.find(r => r.reportId === form.reportId);
  return (
    <>
      <label>
        Tên cảnh báo
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd Doanh thu chi nhánh bất thường" required />
      </label>

      <label>
        Báo cáo theo dõi
        {reportLocked ? (
          <input value={selectedReport?.title || form.reportId} disabled />
        ) : (
          <select value={form.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value, filterValues: {}, entityColumnKey: '', metricColumnKey: '' })} required>
            <option value="">— Chọn báo cáo —</option>
            {reports.map(r => <option key={r.reportId} value={r.reportId}>{r.title}</option>)}
          </select>
        )}
        <span className="twofa-hint">Báo cáo phải trả về 1 dòng/1 "thực thể" (vd 1 dòng/chi nhánh) — dùng đúng báo cáo đã dựng ở "Biểu mẫu", không tạo báo cáo riêng cho việc này.</span>
      </label>

      <div className="tabs">
        <button type="button" className={form.alertMode === 'periodComparison' ? 'active' : ''} onClick={() => setForm({ ...form, alertMode: 'periodComparison' })}>So kỳ hiện tại/kỳ trước (%)</button>
        <button type="button" className={form.alertMode === 'absoluteThreshold' ? 'active' : ''} onClick={() => setForm({ ...form, alertMode: 'absoluteThreshold' })}>Ngưỡng tuyệt đối (vd tồn kho)</button>
      </div>

      <FilterConfigFields
        filters={selectedReport?.filters || []}
        filterValues={form.filterValues}
        onChange={(filterValues) => setForm({ ...form, filterValues })}
        dateRequired={form.alertMode === 'periodComparison'}
      />

      <label>
        Cột xác định "thực thể" (vd tên/mã chi nhánh)
        <input value={form.entityColumnKey} onChange={(e) => setForm({ ...form, entityColumnKey: e.target.value })} placeholder="vd TenChiNhanh" required />
        {!!selectedReport?.columns?.length && (
          <span className="twofa-hint">Cột có sẵn trong báo cáo: {selectedReport.columns.map(c => c.key).join(', ')}</span>
        )}
      </label>

      <label>
        Cột số cần theo dõi
        <input value={form.metricColumnKey} onChange={(e) => setForm({ ...form, metricColumnKey: e.target.value })} placeholder="vd DoanhThu, SoLuongTon" required />
      </label>

      {form.alertMode === 'periodComparison' ? (
        <>
          <label>
            So với kỳ nào
            <select value={form.compareMode} onChange={(e) => setForm({ ...form, compareMode: e.target.value })}>
              <option value="previousPeriod">Kỳ liền trước (cùng độ dài ngày)</option>
              <option value="samePeriodLastYear">Cùng kỳ năm trước</option>
            </select>
          </label>
          <label>
            Ngưỡng cảnh báo (% chênh lệch tuyệt đối)
            <input type="number" min="1" value={form.thresholdPercent} onChange={(e) => setForm({ ...form, thresholdPercent: e.target.value })} required />
          </label>
        </>
      ) : (
        <>
          <label>
            Chiều ngưỡng
            <select value={form.thresholdDirection} onChange={(e) => setForm({ ...form, thresholdDirection: e.target.value })}>
              <option value="below">Thấp hơn ngưỡng (vd sắp hết hàng)</option>
              <option value="above">Cao hơn ngưỡng (vd tồn kho ứ đọng)</option>
            </select>
          </label>
          <label>
            Giá trị ngưỡng
            <input type="number" value={form.thresholdValue} onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })} placeholder="vd 10" required />
          </label>
        </>
      )}

      <label>
        Lịch kiểm tra (cron: phút giờ ngày tháng thứ)
        <input value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} placeholder="vd 0 7 * * * (7h sáng hàng ngày)" required />
      </label>

      <label>
        Người nhận cảnh báo (phân tách dấu phẩy)
        <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="a@congty.vn, b@congty.vn" required />
      </label>
    </>
  );
}

export default function AnomalyAlertsPage() {
  const [reports, setReports] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function reload() {
    api.get('/system/anomaly-alerts').then(setRows).catch(err => setError(err.message));
    api.get('/system/anomaly-alerts/reports').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createAlert(e) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await api.post('/system/anomaly-alerts', form);
      setForm(emptyForm());
      reload();
    } catch (err) { setError(err.message); }
  }

  async function saveEdit() {
    setError(''); setMessage('');
    try {
      await api.put(`/system/anomaly-alerts/${editing.id}`, editing.form);
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(row) {
    setError('');
    try {
      await api.put(`/system/anomaly-alerts/${row.Id}`, { ...alertToForm(row), isActive: !row.IsActive });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteAlert(row) {
    if (!confirm(`Xoá cảnh báo "${row.Name}"?`)) return;
    setError('');
    try {
      await api.del(`/system/anomaly-alerts/${row.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function runNow(row) {
    setError(''); setMessage('');
    try {
      const result = await api.post(`/system/anomaly-alerts/${row.Id}/run-now`);
      setMessage(result.anomalyCount
        ? `⚠️ "${row.Name}": phát hiện ${result.anomalyCount} thực thể bất thường — đã gửi email.`
        : `✅ "${row.Name}": không có gì bất thường, không gửi email.`);
      reload();
    } catch (err) { setError(`Kiểm tra "${row.Name}" thất bại: ${err.message}`); }
  }

  return (
    <div className="page">
      <h1>Cảnh báo bất thường</h1>
      <p>
        Tự động chạy lại MỘT báo cáo đã có, so từng "thực thể" (vd chi nhánh)
        trên 1 cột số — vượt ngưỡng thì gửi email CHỈ liệt kê những thực thể
        bất thường (không gửi nếu không có gì lạ). 2 chế độ: <strong>so kỳ
        hiện tại/kỳ trước (%)</strong> — hợp doanh thu, số đơn hàng... (chạy
        báo cáo 2 lần, so % chênh lệch); <strong>ngưỡng tuyệt đối</strong> —
        hợp tồn kho, số lượng còn lại... (chạy báo cáo 1 lần, so trực tiếp
        với 1 giá trị cố định, không cần kỳ so sánh). Dùng được cho bất kỳ
        chỉ số nào, không cần tạo báo cáo riêng.
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <form className="stacked-form" onSubmit={createAlert}>
        <AlertFormFields form={form} setForm={setForm} reports={reports} reportLocked={false} />
        <button type="submit">Tạo cảnh báo</button>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'ReportTitle', label: 'Báo cáo' },
          {
            key: 'CompareMode', label: 'So với', render: (r) => (
              r.AlertMode === 'absoluteThreshold' ? '—' : (r.CompareMode === 'samePeriodLastYear' ? 'Cùng kỳ năm trước' : 'Kỳ liền trước')
            )
          },
          {
            key: 'ThresholdPercent', label: 'Ngưỡng', render: (r) => (
              r.AlertMode === 'absoluteThreshold'
                ? `${r.ThresholdDirection === 'above' ? 'Cao hơn' : 'Thấp hơn'} ${r.ThresholdValue}`
                : `${r.ThresholdPercent}%`
            )
          },
          { key: 'Recipients', label: 'Người nhận' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          {
            key: 'LastRun', label: 'Lần kiểm tra gần nhất', render: (r) => {
              if (!r.LastRunAt) return 'Chưa chạy lần nào';
              const time = new Date(r.LastRunAt).toLocaleString('vi-VN');
              if (r.LastStatus === 'FAILED') return <span className="form-error" title={r.LastError || ''}>⛔ {time}</span>;
              return `✅ ${time}${r.LastAnomalyCount ? ` — ${r.LastAnomalyCount} bất thường` : ' — không có gì lạ'}`;
            }
          },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => setEditing({ id: r.Id, form: alertToForm(r) })}>Sửa</button>{' '}
                <button type="button" onClick={() => runNow(r)}>Kiểm tra ngay</button>{' '}
                <button type="button" onClick={() => toggleActive(r)}>{r.IsActive ? 'Tắt' : 'Bật'}</button>{' '}
                <button type="button" onClick={() => deleteAlert(r)}>Xoá</button>
              </>
            )
          }
        ]}
        rows={rows}
      />

      {editing && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa — {editing.form.name}</h3>
            <AlertFormFields form={editing.form} setForm={(f) => setEditing({ ...editing, form: f })} reports={reports} reportLocked />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.form.isActive} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, isActive: e.target.checked } })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit}>Lưu</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
