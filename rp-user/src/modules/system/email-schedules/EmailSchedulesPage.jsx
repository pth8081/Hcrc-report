// modules/system/email-schedules/EmailSchedulesPage.jsx — Trang "Lịch gửi
// email báo cáo": CRUD app.ReportEmailSchedules + app.ReportEmailScheduleTimes.
// MỘT lịch có THỂ có NHIỀU giờ gửi/ngày (vd 07:00 VÀ 17:00) — "số lần gửi" là
// ĐỘ DÀI danh sách giờ gửi, không có ô đếm riêng. Lịch chạy (cron) của MỖI
// giờ được dựng qua giao diện ĐƠN GIẢN dùng CHUNG tần suất/thứ trong tuần cho
// cả lịch (chỉ giờ khác nhau — đúng nhu cầu thường gặp: cùng đối tượng nhận,
// gửi nhiều lần/ngày) thay vì bắt gõ cú pháp cron tay — xem
// buildCron()/parseCronToSimple(). Muốn mỗi giờ gửi một kiểu ngày HOÀN TOÀN
// khác nhau (vd giờ này chỉ gửi thứ 2, giờ kia gửi cuối tuần) thì chuyển
// sang "Nâng cao", nhập trực tiếp danh sách biểu thức cron.
//
// Bộ lọc cố định của từng lịch đổi theo filters của báo cáo đã chọn: lọc
// kiểu 'dateRange' chỉ cho chọn PRESET tương đối (hôm nay/7 ngày qua/...) —
// không cho ngày cố định, vì báo cáo gửi lặp lại hàng ngày cần dữ liệu tính
// lại mỗi lần chạy, không phải cùng 1 khoảng ngày mãi mãi (xem
// rp-server/lib/reportEmailFilters.js).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 0, label: 'CN' }
];
const WEEKDAY_LABELS = Object.fromEntries(WEEKDAY_OPTIONS.map(w => [w.value, w.label]));
const DATE_RANGE_PRESET_OPTIONS = [
  { value: '', label: 'Không lọc theo ngày' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last7days', label: '7 ngày qua' },
  { value: 'last30days', label: '30 ngày qua' },
  { value: 'thisWeek', label: 'Tuần này' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' }
];

function pad2(n) { return String(n).padStart(2, '0'); }

function buildCron({ frequency, time, weekdays }) {
  const [hh, mm] = (time || '07:00').split(':').map(Number);
  if (frequency === 'weekly' && weekdays.length) {
    return `${mm} ${hh} * * ${weekdays.slice().sort().join(',')}`;
  }
  return `${mm} ${hh} * * *`;
}

// Đọc ngược cron -> {frequency,time,weekdays} — chỉ nhận dạng cron do chính
// buildCron() ở trên tạo ra (phút/giờ là số đơn, ngày tháng/tháng luôn '*').
// Cron phức tạp hơn (dải giờ, bước nhảy, nhập tay từ trước) không đọc lại
// được -> trả null.
function parseCronToSimple(cronExpr) {
  const parts = String(cronExpr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  if (dom !== '*' || month !== '*' || !/^\d+$/.test(min) || !/^\d+$/.test(hour)) return null;
  const time = `${pad2(Number(hour))}:${pad2(Number(min))}`;
  if (dow === '*') return { frequency: 'daily', time, weekdays: [] };
  if (/^[0-6](,[0-6])*$/.test(dow)) return { frequency: 'weekly', time, weekdays: dow.split(',').map(Number) };
  return null;
}

function cronToLabel(cronExpr) {
  const simple = parseCronToSimple(cronExpr);
  if (!simple) return cronExpr;
  if (simple.frequency === 'daily') return `Hàng ngày lúc ${simple.time}`;
  return `${simple.weekdays.map(d => WEEKDAY_LABELS[d]).join(', ')} lúc ${simple.time}`;
}

function emptyScheduleForm() {
  return {
    name: '', reportId: '', recipients: '', exportFormat: 'excel',
    cronMode: 'simple', frequency: 'daily', weekdays: [1],
    times: ['07:00'], rawCrons: [''],
    filterValues: {},
    subject: '', deliveryMode: 'attachment', highlightColumnKey: '', highlightThreshold: ''
  };
}

// "Số lần gửi" của lịch = độ dài mảng cron sinh ra ở đây, không có field đếm
// riêng để tránh lệch số với danh sách thật.
function buildCronList(form) {
  if (form.cronMode === 'advanced') return form.rawCrons.map(c => c.trim()).filter(Boolean);
  return form.times.filter(Boolean).map(time => buildCron({ frequency: form.frequency, time, weekdays: form.weekdays }));
}

// Suy ra state form từ 1 dòng lịch đã có (mở modal Sửa) — cronMode 'simple'
// chỉ khi TẤT CẢ giờ gửi đọc ngược được VÀ cùng tần suất/thứ trong tuần
// (khác thời gian nhau) — ngược lại 'advanced' hiện nguyên danh sách cron.
function scheduleToForm(row) {
  const crons = (row.Times || []).map(t => t.CronExpression);
  const parsed = crons.map(parseCronToSimple);
  const allSimple = crons.length > 0 && parsed.every(Boolean);
  const sameShape = allSimple && parsed.every(p => p.frequency === parsed[0].frequency && JSON.stringify(p.weekdays) === JSON.stringify(parsed[0].weekdays));

  const base = {
    name: row.Name, reportId: row.ReportId, recipients: row.Recipients, exportFormat: row.ExportFormat, filterValues: row.FilterValues || {},
    subject: row.Subject || '', deliveryMode: row.DeliveryMode || 'attachment',
    highlightColumnKey: row.HighlightColumnKey || '', highlightThreshold: row.HighlightThreshold ?? ''
  };
  if (sameShape) {
    return { ...base, cronMode: 'simple', frequency: parsed[0].frequency, weekdays: parsed[0].weekdays.length ? parsed[0].weekdays : [1], times: parsed.map(p => p.time), rawCrons: [''] };
  }
  return { ...base, cronMode: 'advanced', frequency: 'daily', weekdays: [1], times: ['07:00'], rawCrons: crons.length ? crons : [''] };
}

function toggleWeekday(weekdays, value) {
  return weekdays.includes(value) ? weekdays.filter(w => w !== value) : [...weekdays, value].sort();
}

// Danh sách "giờ gửi" (chế độ đơn giản) hoặc "biểu thức cron" (nâng cao) —
// thêm/xoá tự do, ít nhất phải còn 1 dòng.
function RepeatableTimesField({ label, values, onChange, renderInput, newValue }) {
  function update(i, value) { const next = [...values]; next[i] = value; onChange(next); }
  function add() { onChange([...values, newValue]); }
  function remove(i) { onChange(values.filter((_, idx) => idx !== i)); }
  return (
    <div className="repeatable-list">
      <span>{label} ({values.length} lần/ngày)</span>
      {values.map((v, i) => (
        <div key={i} className="inline-actions">
          {renderInput(v, (value) => update(i, value))}
          {values.length > 1 && <button type="button" onClick={() => remove(i)}>Xoá</button>}
        </div>
      ))}
      <button type="button" onClick={add}>+ Thêm giờ gửi</button>
    </div>
  );
}

// Ô cấu hình bộ lọc cố định, đổi theo filters của báo cáo đã chọn — dùng
// chung cho cả form Tạo lẫn modal Sửa.
function FilterConfigFields({ filters, filterValues, onChange }) {
  if (!filters.length) return null;
  return (
    <div className="filter-config">
      <strong>Bộ lọc cố định khi gửi tự động</strong>
      {filters.map(f => {
        const entry = filterValues[f.field] || {};
        if (f.type === 'dateRange') {
          return (
            <label key={f.field}>
              {f.label || f.field}
              <select
                value={entry.kind === 'dateRangePreset' ? entry.preset : ''}
                onChange={(e) => {
                  const preset = e.target.value;
                  const next = { ...filterValues };
                  if (preset) next[f.field] = { kind: 'dateRangePreset', preset };
                  else delete next[f.field];
                  onChange(next);
                }}
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

// Nhóm field dùng chung cho form Tạo + modal Sửa (khác nhau ở chỗ Sửa khoá
// chọn báo cáo — xem prop reportLocked).
function ScheduleFormFields({ form, setForm, reports, reportLocked }) {
  const selectedReport = reports.find(r => r.reportId === form.reportId);
  return (
    <>
      <label>
        Tên lịch
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd Doanh thu ngày - Ban GĐ" required />
      </label>

      <label>
        Báo cáo
        {reportLocked ? (
          <input value={selectedReport?.title || form.reportId} disabled />
        ) : (
          <select value={form.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value, filterValues: {} })} required>
            <option value="">— Chọn báo cáo —</option>
            {reports.map(r => <option key={r.reportId} value={r.reportId}>{r.title}</option>)}
          </select>
        )}
      </label>

      <div className="tabs">
        <button type="button" className={form.cronMode === 'simple' ? 'active' : ''} onClick={() => setForm({ ...form, cronMode: 'simple' })}>Đơn giản</button>
        <button type="button" className={form.cronMode === 'advanced' ? 'active' : ''} onClick={() => setForm({ ...form, cronMode: 'advanced' })}>Nâng cao (cron)</button>
      </div>

      {form.cronMode === 'simple' ? (
        <>
          <label>
            Tần suất
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="daily">Hàng ngày</option>
              <option value="weekly">Hàng tuần (chọn thứ)</option>
            </select>
          </label>
          {form.frequency === 'weekly' && (
            <div className="scope-picker">
              {WEEKDAY_OPTIONS.map(w => (
                <label key={w.value} className="checkbox-row">
                  <input type="checkbox" checked={form.weekdays.includes(w.value)} onChange={() => setForm({ ...form, weekdays: toggleWeekday(form.weekdays, w.value) })} />
                  {w.label}
                </label>
              ))}
            </div>
          )}
          <RepeatableTimesField
            label="Giờ gửi"
            values={form.times}
            onChange={(times) => setForm({ ...form, times })}
            newValue="07:00"
            renderInput={(value, onChange) => <input type="time" value={value} onChange={(e) => onChange(e.target.value)} required />}
          />
        </>
      ) : (
        <RepeatableTimesField
          label="Biểu thức cron (phút giờ ngày tháng thứ)"
          values={form.rawCrons}
          onChange={(rawCrons) => setForm({ ...form, rawCrons })}
          newValue=""
          renderInput={(value, onChange) => <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="vd 0 7 * * *" required />}
        />
      )}

      <label>
        Người nhận (phân tách dấu phẩy)
        <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="a@congty.vn, b@congty.vn" required />
      </label>

      <label>
        Tiêu đề email (Subject) — gõ {'{ngay}'} để chèn ngày gửi
        <input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder={`Để trống = mặc định "[HCRC] ${selectedReport?.title || '<Tên báo cáo>'} — {ngay}"`}
        />
      </label>

      <label>
        Cách gửi
        <select value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}>
          <option value="attachment">File đính kèm (Excel/PDF)</option>
          <option value="body">Bảng ngay trong nội dung email (không đính kèm)</option>
        </select>
      </label>

      {form.deliveryMode === 'attachment' ? (
        <label>
          Định dạng xuất
          <select value={form.exportFormat} onChange={(e) => setForm({ ...form, exportFormat: e.target.value })}>
            <option value="excel">Excel</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
      ) : (
        <div className="filter-config">
          <strong>Tô màu cảnh báo trong bảng (không bắt buộc)</strong>
          <label>
            Cột kiểm tra ngưỡng
            <select value={form.highlightColumnKey} onChange={(e) => setForm({ ...form, highlightColumnKey: e.target.value })}>
              <option value="">— Không tô màu —</option>
              {(selectedReport?.columns || []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          {form.highlightColumnKey && (
            <label>
              Ngưỡng cảnh báo (tô đỏ khi trị tuyệt đối vượt ngưỡng)
              <input
                type="number"
                value={form.highlightThreshold}
                onChange={(e) => setForm({ ...form, highlightThreshold: e.target.value })}
                placeholder="vd 100000"
                required
              />
            </label>
          )}
        </div>
      )}

      <FilterConfigFields
        filters={selectedReport?.filters || []}
        filterValues={form.filterValues}
        onChange={(filterValues) => setForm({ ...form, filterValues })}
      />
    </>
  );
}

function TimesStatusList({ times }) {
  if (!times?.length) return null;
  return (
    <ul className="times-list">
      {times.map(t => (
        <li key={t.Id}>
          {cronToLabel(t.CronExpression)}
          {t.LastRunAt && (
            t.LastStatus === 'FAILED'
              ? <span className="form-error" title={t.LastError || ''}> ⛔ {new Date(t.LastRunAt).toLocaleString('vi-VN')}</span>
              : <span> ✅ {new Date(t.LastRunAt).toLocaleString('vi-VN')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function EmailSchedulesPage() {
  const [reports, setReports] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyScheduleForm());
  const [editing, setEditing] = useState(null); // {id, form}
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function reload() {
    api.get('/system/report-email-schedules').then(setRows).catch(err => setError(err.message));
    api.get('/system/report-email-schedules/reports').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createSchedule(e) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await api.post('/system/report-email-schedules', {
        name: form.name, reportId: form.reportId, cronExpressions: buildCronList(form),
        recipients: form.recipients, exportFormat: form.exportFormat, filterValues: form.filterValues,
        subject: form.subject, deliveryMode: form.deliveryMode,
        highlightColumnKey: form.deliveryMode === 'body' ? form.highlightColumnKey : '',
        highlightThreshold: form.deliveryMode === 'body' && form.highlightColumnKey ? form.highlightThreshold : ''
      });
      setForm(emptyScheduleForm());
      reload();
    } catch (err) { setError(err.message); }
  }

  async function saveEdit() {
    setError(''); setMessage('');
    try {
      const f = editing.form;
      await api.put(`/system/report-email-schedules/${editing.id}`, {
        name: f.name, cronExpressions: buildCronList(f), recipients: f.recipients,
        exportFormat: f.exportFormat, filterValues: f.filterValues, isActive: f.isActive,
        subject: f.subject, deliveryMode: f.deliveryMode,
        highlightColumnKey: f.deliveryMode === 'body' ? f.highlightColumnKey : '',
        highlightThreshold: f.deliveryMode === 'body' && f.highlightColumnKey ? f.highlightThreshold : ''
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(row) {
    setError('');
    try {
      const f = scheduleToForm(row);
      await api.put(`/system/report-email-schedules/${row.Id}`, {
        name: f.name, cronExpressions: buildCronList(f), recipients: f.recipients,
        exportFormat: f.exportFormat, filterValues: f.filterValues, isActive: !row.IsActive,
        subject: f.subject, deliveryMode: f.deliveryMode,
        highlightColumnKey: f.deliveryMode === 'body' ? f.highlightColumnKey : '',
        highlightThreshold: f.deliveryMode === 'body' && f.highlightColumnKey ? f.highlightThreshold : ''
      });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteSchedule(row) {
    if (!confirm(`Xoá lịch "${row.Name}"?`)) return;
    setError('');
    try {
      await api.del(`/system/report-email-schedules/${row.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function runNow(row) {
    setError(''); setMessage('');
    try {
      await api.post(`/system/report-email-schedules/${row.Id}/run-now`);
      setMessage(`✅ Đã gửi "${row.Name}" — kiểm tra hộp thư người nhận.`);
      reload();
    } catch (err) { setError(`Gửi "${row.Name}" thất bại: ${err.message}`); }
  }

  return (
    <div className="page">
      <h1>Lịch gửi email báo cáo</h1>
      <p>
        Gửi tự động MỘT báo cáo cho danh sách người nhận theo lịch — dùng cấu hình SMTP chung ở trang
        &quot;Thiết lập email&quot;. Một lịch có thể gửi NHIỀU lần/ngày (vd 07:00 và 17:00) — thêm bao
        nhiêu giờ gửi tuỳ ý, mỗi giờ theo dõi thành công/lỗi RIÊNG. Bộ lọc theo khoảng ngày dùng PRESET
        tương đối (hôm nay/7 ngày qua...), tính lại đúng lúc gửi — không cố định một ngày mãi mãi.
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <form className="stacked-form" onSubmit={createSchedule}>
        <ScheduleFormFields form={form} setForm={setForm} reports={reports} reportLocked={false} />
        <button type="submit">Tạo lịch</button>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên lịch' },
          { key: 'ReportTitle', label: 'Báo cáo' },
          { key: 'Times', label: 'Giờ gửi', render: (r) => <TimesStatusList times={r.Times} /> },
          { key: 'Recipients', label: 'Người nhận' },
          {
            key: 'DeliveryMode', label: 'Cách gửi', render: (r) => (
              r.DeliveryMode === 'body' ? 'Nội dung email' : `File đính kèm (${r.ExportFormat === 'pdf' ? 'PDF' : 'Excel'})`
            )
          },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          {
            key: 'LastRun', label: 'Hoạt động gần nhất (mọi giờ gửi)', render: (r) => {
              if (!r.LastRunAt) return 'Chưa gửi lần nào';
              const time = new Date(r.LastRunAt).toLocaleString('vi-VN');
              if (r.LastStatus === 'FAILED') return <span className="form-error" title={r.LastError || ''}>⛔ {time}</span>;
              return `✅ ${time}`;
            }
          },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => setEditing({ id: r.Id, form: { ...scheduleToForm(r), isActive: r.IsActive } })}>Sửa</button>{' '}
                <button type="button" onClick={() => runNow(r)}>Gửi ngay</button>{' '}
                <button type="button" onClick={() => toggleActive(r)}>{r.IsActive ? 'Tắt' : 'Bật'}</button>{' '}
                <button type="button" onClick={() => deleteSchedule(r)}>Xoá</button>
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
            <ScheduleFormFields
              form={editing.form}
              setForm={(f) => setEditing({ ...editing, form: f })}
              reports={reports}
              reportLocked
            />
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
