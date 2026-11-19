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
// MỘT LỊCH NHIỀU BÁO CÁO (bản 11.1, theo yêu cầu người dùng — "chọn được
// nhiều bc để gửi... kiểu dropdown + searchable + multi choice") — ô "Báo
// cáo" là SearchableSelect multi (y hệt ô "Người nhận"), chọn NHIỀU báo cáo
// GỘP CHUNG 1 email (DeliveryMode='attachment' -> nhiều file đính kèm,
// 'body' -> nhiều bảng nối tiếp trong cùng nội dung email). MỖI báo cáo
// được chọn GIỮ RIÊNG bộ lọc cố định/cột hiển thị/ngưỡng tô màu (đổi theo
// filters/columns của ĐÚNG báo cáo đó) — lưu trong `form.perReport`, khoá
// theo reportId, xem renderReportConfigBlocks() bên dưới.
//
// Bộ lọc cố định của từng báo cáo trong lịch đổi theo filters của báo cáo
// đó: lọc kiểu 'dateRange' chỉ cho chọn PRESET tương đối (hôm nay/7 ngày
// qua/...) — không cho ngày cố định, vì báo cáo gửi lặp lại hàng ngày cần dữ
// liệu tính lại mỗi lần chạy, không phải cùng 1 khoảng ngày mãi mãi (xem
// rp-server/lib/reportEmailFilters.js).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';
import SearchableSelect from '../../../components/SearchableSelect';
import { useRowSelection } from '../../../lib/useRowSelection';
import Modal from '../../../components/Modal';

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

// Tách danh sách email phân tách dấu phẩy thành mảng (client-side, chỉ
// cắt/trim, KHÔNG validate định dạng — validate thật nằm ở server, xem
// routes/reportEmailSchedules.js:validateRecipients()).
function splitEmails(raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Gộp "Người nhận" (bản 10.31) = chọn từ danh sách người dùng hệ thống
// (SearchableSelect, searchable + multi) + email khác ngoài hệ thống (ô
// nhập tay riêng, phân tách dấu phẩy) — gộp lại thành 1 chuỗi phân tách
// dấu phẩy để gửi lên server giống định dạng cũ (KHÔNG đổi schema/API
// validate phía server).
function buildRecipientsString(form) {
  return [...form.recipientUserEmails, ...splitEmails(form.recipientExtra)].join(', ');
}

// Đọc ngược 1 chuỗi Recipients đã lưu -> {recipientUserEmails, recipientExtra}
// — email nào khớp (không phân biệt hoa/thường) 1 người dùng hệ thống CÒN
// trong danh mục thì xếp vào ô chọn dropdown, còn lại xếp vào ô "email khác".
function splitRecipientsForForm(raw, userEmailSet) {
  const all = splitEmails(raw);
  const recipientUserEmails = all.filter(e => userEmailSet.has(e.toLowerCase()));
  const extra = all.filter(e => !userEmailSet.has(e.toLowerCase()));
  return { recipientUserEmails, recipientExtra: extra.join(', ') };
}

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

// perReport rỗng ({}) với 1 reportId -> đọc ra giá trị mặc định ở
// emptyPerReportConfig() bên dưới (không cần khởi tạo trước mỗi khi thêm 1
// báo cáo vào reportIds).
function emptyPerReportConfig() {
  return { filterValues: {}, highlightColumnKey: '', highlightThreshold: '', bodyColumnKeys: [] };
}

function emptyScheduleForm() {
  return {
    name: '', reportIds: [], perReport: {}, recipientUserEmails: [], recipientExtra: '', exportFormat: 'excel',
    cronMode: 'simple', frequency: 'daily', weekdays: [1],
    times: ['07:00'], rawCrons: [''],
    subject: '', deliveryMode: 'attachment'
  };
}

// reports gửi lên server — chỉ gửi bodyColumnKeys/highlightColumnKey/
// highlightThreshold khi deliveryMode='body' (giống đúng quy ước cũ: không
// để lại dữ liệu mồ côi cho chế độ không dùng tới, dù form vẫn giữ nguyên
// trong perReport để không mất khi đổi qua đổi lại deliveryMode).
function buildReportsPayload(form) {
  return form.reportIds.map(reportId => {
    const config = form.perReport[reportId] || emptyPerReportConfig();
    return {
      reportId,
      filterValues: config.filterValues,
      highlightColumnKey: form.deliveryMode === 'body' ? config.highlightColumnKey : '',
      highlightThreshold: form.deliveryMode === 'body' && config.highlightColumnKey ? config.highlightThreshold : '',
      bodyColumnKeys: form.deliveryMode === 'body' ? config.bodyColumnKeys : []
    };
  });
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
function scheduleToForm(row, userEmailSet = new Set()) {
  const crons = (row.Times || []).map(t => t.CronExpression);
  const parsed = crons.map(parseCronToSimple);
  const allSimple = crons.length > 0 && parsed.every(Boolean);
  const sameShape = allSimple && parsed.every(p => p.frequency === parsed[0].frequency && JSON.stringify(p.weekdays) === JSON.stringify(parsed[0].weekdays));

  const base = {
    name: row.Name,
    reportIds: (row.Reports || []).map(r => r.reportId),
    perReport: Object.fromEntries((row.Reports || []).map(r => [r.reportId, {
      filterValues: r.filterValues || {}, highlightColumnKey: r.highlightColumnKey || '',
      highlightThreshold: r.highlightThreshold ?? '', bodyColumnKeys: r.bodyColumnKeys || []
    }])),
    ...splitRecipientsForForm(row.Recipients, userEmailSet), exportFormat: row.ExportFormat,
    subject: row.Subject || '', deliveryMode: row.DeliveryMode || 'attachment'
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
        // Bản 9.47 (theo yêu cầu người dùng — báo cáo "Top bán chạy đang tồn
        // kho = 0" cũng phải chọn được Top 50/Top 100/Tất cả khi gửi email) —
        // filter type 'select' CÓ khai options (vd topLimit) vẽ dropdown THẬT
        // thay vì bắt gõ tay chuỗi (dễ gõ sai, không rõ giá trị nào hợp lệ) —
        // filter khác (multiSelect/text...) giữ NGUYÊN ô nhập chữ như cũ.
        if (f.type === 'select' && f.options?.length) {
          return (
            <label key={f.field}>
              {f.label || f.field}
              <select
                value={entry.kind === 'fixed' ? entry.value : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const next = { ...filterValues };
                  if (value) next[f.field] = { kind: 'fixed', value };
                  else delete next[f.field];
                  onChange(next);
                }}
              >
                <option value="">Không chọn (mặc định của báo cáo)</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

// Cập nhật ĐÚNG 1 báo cáo trong form.perReport (immutable) — dùng chung cho
// mọi ô cấu hình riêng từng báo cáo bên dưới (bộ lọc/cột hiển thị/tô màu).
function updatePerReport(form, setForm, reportId, patch) {
  const current = form.perReport[reportId] || emptyPerReportConfig();
  setForm({ ...form, perReport: { ...form.perReport, [reportId]: { ...current, ...patch } } });
}

// Khối cấu hình RIÊNG cho 1 báo cáo đã chọn (bộ lọc cố định luôn hiện; cột
// hiển thị/tô màu CHỈ hiện khi deliveryMode='body', vì 'attachment' xuất
// NGUYÊN file như xem trên web, không có khái niệm "chọn cột"). report = 1
// phần tử của `reports` (danh mục báo cáo), KHÔNG phải 1 phần tử reportIds.
function ReportConfigBlock({ form, setForm, report, deliveryMode }) {
  const config = form.perReport[report.reportId] || emptyPerReportConfig();
  return (
    <div className="filter-config">
      <strong>{report.title}</strong>
      {deliveryMode === 'body' && (
        <>
          <label>
            Cột hiển thị trong bảng (không chọn = lấy toàn bộ cột)
            <SearchableSelect
              multi
              options={(report.columns || []).map(c => ({ value: c.key, label: c.label }))}
              value={config.bodyColumnKeys}
              onChange={(bodyColumnKeys) => updatePerReport(form, setForm, report.reportId, { bodyColumnKeys })}
              placeholder="Tất cả cột"
            />
          </label>
          <p className="hint">
            Màu nền/kiểu bảng trong email giống hệt file PDF/Excel xuất ra — nếu báo cáo có nhóm cột
            màu (vd "Doanh thu"), bỏ hết cột của 1 nhóm thì nhóm đó tự ẩn khỏi bảng.
          </p>
          <label>
            Tô màu cảnh báo — cột kiểm tra ngưỡng
            <select value={config.highlightColumnKey} onChange={(e) => updatePerReport(form, setForm, report.reportId, { highlightColumnKey: e.target.value })}>
              <option value="">— Không tô màu —</option>
              {(report.columns || []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          {config.highlightColumnKey && (
            <label>
              Ngưỡng cảnh báo (tô đỏ khi trị tuyệt đối vượt ngưỡng)
              <input
                type="number"
                value={config.highlightThreshold}
                onChange={(e) => updatePerReport(form, setForm, report.reportId, { highlightThreshold: e.target.value })}
                placeholder="vd 100000"
                required
              />
            </label>
          )}
        </>
      )}
      <FilterConfigFields
        filters={report.filters || []}
        filterValues={config.filterValues}
        onChange={(filterValues) => updatePerReport(form, setForm, report.reportId, { filterValues })}
      />
    </div>
  );
}

// Nhóm field dùng chung cho form Tạo + modal Sửa — giống hệt nhau, chọn
// NHIỀU báo cáo được cả lúc tạo lẫn lúc sửa (bản 11.1, không còn khoá
// chọn báo cáo khi Sửa như trước — mỗi báo cáo tự giữ cấu hình riêng trong
// form.perReport nên thêm/bớt báo cáo lúc sửa không ảnh hưởng báo cáo khác).
function ScheduleFormFields({ form, setForm, reports, userRecipientOptions }) {
  const selectedReports = form.reportIds.map(id => reports.find(r => r.reportId === id)).filter(Boolean);
  const selectedTitles = selectedReports.map(r => r.title);
  return (
    <>
      <label>
        Tên lịch
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd Doanh thu ngày - Ban GĐ" required />
      </label>

      <label>
        Báo cáo (chọn nhiều báo cáo = gộp chung 1 email)
        <SearchableSelect
          multi
          options={reports.map(r => ({ value: r.reportId, label: r.title }))}
          value={form.reportIds}
          onChange={(reportIds) => setForm({ ...form, reportIds })}
          placeholder="Chọn báo cáo..."
        />
      </label>
      {selectedReports.map(report => (
        <ReportConfigBlock key={report.reportId} form={form} setForm={setForm} report={report} deliveryMode={form.deliveryMode} />
      ))}

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
        Người nhận (chọn người dùng hệ thống — tìm kiếm + chọn nhiều)
        <SearchableSelect
          multi
          options={userRecipientOptions}
          value={form.recipientUserEmails}
          onChange={(recipientUserEmails) => setForm({ ...form, recipientUserEmails })}
          placeholder="Chọn người nhận..."
        />
      </label>

      <label>
        Email khác (ngoài hệ thống, phân tách dấu phẩy)
        <input
          value={form.recipientExtra}
          onChange={(e) => setForm({ ...form, recipientExtra: e.target.value })}
          placeholder="vd doitac@congty.vn (để trống nếu chỉ gửi người dùng hệ thống ở trên)"
        />
      </label>

      <label>
        Tiêu đề email (Subject) — gõ {'{ngay}'} để chèn ngày gửi
        <input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder={`Để trống = mặc định "[HCRC] ${selectedTitles.length ? (selectedTitles.length <= 3 ? selectedTitles.join(', ') : `${selectedTitles.length} báo cáo`) : '<Tên báo cáo>'} — {ngay}"`}
        />
      </label>

      <label>
        Cách gửi (áp dụng cho CẢ email — mọi báo cáo đã chọn gộp theo cùng 1 cách)
        <select value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}>
          <option value="attachment">File đính kèm (Excel/PDF) — mỗi báo cáo 1 file, cùng 1 email</option>
          <option value="body">Bảng ngay trong nội dung email — mỗi báo cáo 1 bảng, nối tiếp nhau</option>
        </select>
      </label>

      {form.deliveryMode === 'attachment' && (
        <label>
          Định dạng xuất
          <select value={form.exportFormat} onChange={(e) => setForm({ ...form, exportFormat: e.target.value })}>
            <option value="excel">Excel</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
      )}
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
  const [userRecipientOptions, setUserRecipientOptions] = useState([]);
  const userEmailSet = useMemo(() => new Set(userRecipientOptions.map(o => o.value.toLowerCase())), [userRecipientOptions]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyScheduleForm());
  const [editing, setEditing] = useState(null); // {id, form}
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  // Chọn nhiều + xoá hàng loạt (bản 8.62).
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/system/report-email-schedules').then(setRows).catch(err => setError(err.message));
    api.get('/system/report-email-schedules/reports').then(setReports).catch(err => setError(err.message));
    api.get('/system/report-email-schedules/recipients-catalog').then(setUserRecipientOptions).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createSchedule(e) {
    e.preventDefault();
    setError(''); setMessage('');
    setCreating(true);
    try {
      await api.post('/system/report-email-schedules', {
        name: form.name, reports: buildReportsPayload(form), cronExpressions: buildCronList(form),
        recipients: buildRecipientsString(form), exportFormat: form.exportFormat,
        subject: form.subject, deliveryMode: form.deliveryMode
      });
      setForm(emptyScheduleForm());
      reload();
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  async function saveEdit() {
    setError(''); setMessage('');
    setSavingEdit(true);
    try {
      const f = editing.form;
      await api.put(`/system/report-email-schedules/${editing.id}`, {
        name: f.name, reports: buildReportsPayload(f), cronExpressions: buildCronList(f), recipients: buildRecipientsString(f),
        exportFormat: f.exportFormat, isActive: f.isActive,
        subject: f.subject, deliveryMode: f.deliveryMode
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  async function toggleActive(row) {
    setError('');
    setTogglingId(row.Id);
    try {
      const f = scheduleToForm(row, userEmailSet);
      await api.put(`/system/report-email-schedules/${row.Id}`, {
        name: f.name, reports: buildReportsPayload(f), cronExpressions: buildCronList(f), recipients: buildRecipientsString(f),
        exportFormat: f.exportFormat, isActive: !row.IsActive,
        subject: f.subject, deliveryMode: f.deliveryMode
      });
      reload();
    } catch (err) { setError(err.message); } finally { setTogglingId(null); }
  }

  async function deleteSchedule(row) {
    if (!confirm(`Xoá lịch "${row.Name}"?`)) return;
    setError('');
    setDeletingId(row.Id);
    try {
      await api.del(`/system/report-email-schedules/${row.Id}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} lịch đã chọn?`)) return;
    setError('');
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/report-email-schedules/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  async function runNow(row) {
    setError(''); setMessage('');
    setRunningId(row.Id);
    try {
      await api.post(`/system/report-email-schedules/${row.Id}/run-now`);
      setMessage(`✅ Đã gửi "${row.Name}" — kiểm tra hộp thư người nhận.`);
      reload();
    } catch (err) { setError(`Gửi "${row.Name}" thất bại: ${err.message}`); } finally { setRunningId(null); }
  }

  return (
    <div className="page">
      <h1>Lịch gửi email báo cáo</h1>
      <p>
        Gửi tự động MỘT HOẶC NHIỀU báo cáo cho danh sách người nhận theo lịch — chọn nhiều báo cáo thì
        gộp chung vào CÙNG 1 email (nhiều file đính kèm, hoặc nhiều bảng nối tiếp nếu gửi dạng nội dung
        email) — dùng cấu hình SMTP chung ở trang &quot;Thiết lập email&quot;. Một lịch có thể gửi NHIỀU
        lần/ngày (vd 07:00 và 17:00) — thêm bao nhiêu giờ gửi tuỳ ý, mỗi giờ theo dõi thành công/lỗi
        RIÊNG. Bộ lọc theo khoảng ngày dùng PRESET tương đối (hôm nay/7 ngày qua...), tính lại đúng lúc
        gửi — không cố định một ngày mãi mãi.
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <form className="stacked-form" onSubmit={createSchedule}>
        <ScheduleFormFields form={form} setForm={setForm} reports={reports} userRecipientOptions={userRecipientOptions} />
        <button type="submit" disabled={creating}>{creating ? 'Đang tạo...' : 'Tạo lịch'}</button>
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
                <button type="button" onClick={() => setEditing({ id: r.Id, form: { ...scheduleToForm(r, userEmailSet), isActive: r.IsActive } })}>Sửa</button>{' '}
                <button type="button" onClick={() => runNow(r)} disabled={runningId === r.Id}>{runningId === r.Id ? 'Đang gửi...' : 'Gửi ngay'}</button>{' '}
                <button type="button" onClick={() => toggleActive(r)} disabled={togglingId === r.Id}>{togglingId === r.Id ? 'Đang xử lý...' : (r.IsActive ? 'Tắt' : 'Bật')}</button>{' '}
                <button type="button" onClick={() => deleteSchedule(r)} disabled={deletingId === r.Id}>{deletingId === r.Id ? 'Đang xoá...' : 'Xoá'}</button>
              </>
            )
          }
        ]}
        rows={rows}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      {editing && (
        <Modal>
          <div className="modal-body">
            <h3>Sửa — {editing.form.name}</h3>
            <ScheduleFormFields
              form={editing.form}
              setForm={(f) => setEditing({ ...editing, form: f })}
              reports={reports}
              userRecipientOptions={userRecipientOptions}
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.form.isActive} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, isActive: e.target.checked } })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
