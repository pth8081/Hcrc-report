// pages/SyncJobsPage.jsx — Trang "Đồng bộ": danh sách job + form tạo mới.
// Job Type="table": duyệt bảng/VIEW/cột THẬT của nguồn đã chọn (không gõ tay
// tên bảng/cột — xem tài liệu kiến trúc "Quản Trị ETL HCRC", mục 03), tuỳ
// chọn thêm 1 bảng/view liên kết cùng nguồn (mục 02/04) — VIEW dùng được y
// hệt bảng thật, hữu ích khi cần gộp hơn 1 bảng liên kết hoặc chỉ lộ đúng
// cột cần qua tài khoản chỉ đọc (xem lib/schemaBrowser.js). Job Type="custom":
// chọn 1 connector đã viết sẵn trong etl/sources/.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = {
  name: '', type: 'table', dataSourceId: '', targetDomain: '', cronExpression: '*/15 * * * *',
  sourceSchema: '', sourceTable: '', keyColumn: '', dateColumn: '', updatedAtColumn: '',
  dimensionColumns: [], measureColumns: [],
  useJoin: false, joinSchema: '', joinTable: '', joinType: 'LEFT',
  mainJoinColumn: '', lookupJoinColumn: '', lookupDimensionColumns: [],
  customConnectorKey: '', keepHistory: false, branchCodeMapType: ''
};

function toggleInList(list, value) {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export default function SyncJobsPage() {
  const { isAdmin } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [customConnectors, setCustomConnectors] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mainTables, setMainTables] = useState([]);
  const [mainColumns, setMainColumns] = useState([]);
  const [joinTables, setJoinTables] = useState([]);
  const [joinColumns, setJoinColumns] = useState([]);
  const [fkSuggestions, setFkSuggestions] = useState([]);
  const [error, setError] = useState('');

  function reload() {
    api.get('/sync-jobs').then(setJobs).catch(err => setError(err.message));
  }
  useEffect(() => {
    reload();
    api.get('/data-sources').then(setDataSources).catch(err => setError(err.message));
    api.get('/sync-jobs/custom-connectors').then(setCustomConnectors).catch(err => setError(err.message));
  }, []);

  // Chọn nguồn -> nạp danh sách bảng thật.
  useEffect(() => {
    if (!form.dataSourceId || form.type !== 'table') return;
    api.get(`/data-sources/${form.dataSourceId}/tables`).then(rows => { setMainTables(rows); setJoinTables(rows); }).catch(err => setError(err.message));
  }, [form.dataSourceId, form.type]);

  // Chọn bảng chính -> nạp cột thật + khoá ngoại (gợi ý nối).
  useEffect(() => {
    if (!form.sourceSchema || !form.sourceTable) { setMainColumns([]); setFkSuggestions([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.sourceSchema}/${form.sourceTable}/columns`).then(setMainColumns).catch(err => setError(err.message));
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.sourceSchema}/${form.sourceTable}/foreign-keys`).then(setFkSuggestions).catch(() => setFkSuggestions([]));
  }, [form.dataSourceId, form.sourceSchema, form.sourceTable]);

  // Chọn bảng liên kết -> nạp cột thật.
  useEffect(() => {
    if (!form.useJoin || !form.joinSchema || !form.joinTable) { setJoinColumns([]); return; }
    api.get(`/data-sources/${form.dataSourceId}/tables/${form.joinSchema}/${form.joinTable}/columns`).then(setJoinColumns).catch(err => setError(err.message));
  }, [form.useJoin, form.dataSourceId, form.joinSchema, form.joinTable]);

  function pickMainTable(value) {
    const [schemaName, tableName] = value.split('.');
    setForm({ ...form, sourceSchema: schemaName, sourceTable: tableName, keyColumn: '', dateColumn: '', updatedAtColumn: '', dimensionColumns: [], measureColumns: [] });
  }

  function pickJoinTable(value) {
    const [schemaName, tableName] = value.split('.');
    setForm({ ...form, joinSchema: schemaName, joinTable: tableName, mainJoinColumn: '', lookupJoinColumn: '', lookupDimensionColumns: [] });
  }

  function applyFkSuggestion(fk) {
    setForm({ ...form, mainJoinColumn: fk.columnName, joinSchema: fk.refSchema, joinTable: fk.refTable, lookupJoinColumn: fk.refColumn });
  }

  async function createJob(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (!body.useJoin) {
        body.joinSchema = null; body.joinTable = null; body.joinType = null;
        body.mainJoinColumn = null; body.lookupJoinColumn = null; body.lookupDimensionColumns = [];
      }
      await api.post('/sync-jobs', body);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function runNow(job) {
    try {
      await api.post(`/sync-jobs/${job.Id}/run-now`);
      alert(`Đã chạy "${job.Name}" — xem kết quả ở trang Log.`);
    } catch (err) { setError(err.message); }
  }

  // Đối chiếu LẠI job đã lưu với schema THẬT hiện tại của nguồn — bắt được
  // trường hợp bảng/cột nguồn bị đổi/xoá SAU khi job đã tạo, không đợi tới
  // lúc job chạy thật mới báo lỗi SQL. Đọc-only nên KHÔNG gói trong isAdmin
  // (viewer bấm được, cùng mức xem như phần còn lại của trang).
  async function checkSchema(job) {
    try {
      const result = await api.post(`/sync-jobs/${job.Id}/check-schema`);
      if (result.skipped) alert(result.message);
      else if (result.ok) alert(`✅ "${job.Name}": schema khớp với nguồn hiện tại.`);
      else alert(`⛔ "${job.Name}": ${result.error}`);
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(job) {
    try {
      await api.put(`/sync-jobs/${job.Id}`, {
        name: job.Name, cronExpression: job.CronExpression, targetDomain: job.TargetDomain,
        dimensionColumns: JSON.parse(job.DimensionColumnsJson || '[]'),
        measureColumns: JSON.parse(job.MeasureColumnsJson || '[]'),
        keepHistory: !!job.KeepHistory,
        branchCodeMapType: job.BranchCodeMapType || '',
        isActive: !job.IsActive
      });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteJob(job) {
    if (!confirm(`Xoá job "${job.Name}"?`)) return;
    try {
      await api.del(`/sync-jobs/${job.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Đồng bộ</h1>
      {error && <p className="form-error">{error}</p>}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Type', label: 'Loại', render: (j) => (j.Type === 'table' ? 'Theo bảng' : 'Tuỳ biến') },
          { key: 'TargetDomain', label: 'Domain' },
          { key: 'CronExpression', label: 'Lịch chạy' },
          { key: 'KeepHistory', label: 'Giữ lịch sử', render: (j) => (j.KeepHistory ? 'Có' : 'Không') },
          { key: 'BranchCodeMapType', label: 'Ánh xạ mã chi nhánh', render: (j) => j.BranchCodeMapType || '—' },
          { key: 'IsActive', label: 'Trạng thái', render: (j) => (j.IsActive ? 'Bật' : 'Tắt') },
          {
            key: 'checkSchema', label: '', render: (j) => (
              <button type="button" onClick={() => checkSchema(j)}>Kiểm tra schema</button>
            )
          },
          isAdmin && {
            key: 'actions', label: '', render: (j) => (
              <>
                <button type="button" onClick={() => runNow(j)}>Chạy thử</button>{' '}
                <button type="button" onClick={() => toggleActive(j)}>{j.IsActive ? 'Tắt' : 'Bật'}</button>{' '}
                <button type="button" onClick={() => deleteJob(j)}>Xoá</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={jobs}
        emptyMessage="Chưa có job đồng bộ nào."
      />

      {isAdmin && (
        <>
          <h3>Thêm đồng bộ mới</h3>
          <form className="stacked-form wizard-form" onSubmit={createJob}>
            <input placeholder="Tên job" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

            <div className="tabs">
              <button type="button" className={form.type === 'table' ? 'active' : ''} onClick={() => setForm({ ...EMPTY_FORM, name: form.name, type: 'table' })}>Theo bảng</button>
              <button type="button" className={form.type === 'custom' ? 'active' : ''} onClick={() => setForm({ ...EMPTY_FORM, name: form.name, type: 'custom' })}>Tuỳ biến</button>
            </div>

            {form.type === 'table' ? (
              <>
                <select value={form.dataSourceId} onChange={(e) => setForm({ ...form, dataSourceId: e.target.value, sourceSchema: '', sourceTable: '' })} required>
                  <option value="">— Chọn nguồn dữ liệu —</option>
                  {dataSources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
                </select>

                {form.dataSourceId && (
                  <select value={form.sourceSchema && form.sourceTable ? `${form.sourceSchema}.${form.sourceTable}` : ''} onChange={(e) => pickMainTable(e.target.value)} required>
                    <option value="">— Chọn bảng/view chính —</option>
                    {mainTables.map(t => <option key={`${t.schemaName}.${t.tableName}`} value={`${t.schemaName}.${t.tableName}`}>{t.schemaName}.{t.tableName} ({t.tableType === 'VIEW' ? 'view' : 'bảng'})</option>)}
                  </select>
                )}

                {mainColumns.length > 0 && (
                  <fieldset>
                    <legend>Cột bảng chính</legend>
                    <label>Cột khoá (EntityCode)
                      <select value={form.keyColumn} onChange={(e) => setForm({ ...form, keyColumn: e.target.value })} required>
                        <option value="">—</option>
                        {mainColumns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                      </select>
                    </label>
                    <label>Cột ngày (EventDate)
                      <select value={form.dateColumn} onChange={(e) => setForm({ ...form, dateColumn: e.target.value })} required>
                        <option value="">—</option>
                        {mainColumns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                      </select>
                    </label>
                    <label>Cột thời gian cập nhật (watermark)
                      <select value={form.updatedAtColumn} onChange={(e) => setForm({ ...form, updatedAtColumn: e.target.value })} required>
                        <option value="">—</option>
                        {mainColumns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                      </select>
                    </label>
                    <div className="column-picker">
                      <span>Cột đưa vào Dimensions</span>
                      {mainColumns.map(c => (
                        <label key={c.columnName} className="checkbox-row">
                          <input type="checkbox" checked={form.dimensionColumns.includes(c.columnName)} onChange={() => setForm({ ...form, dimensionColumns: toggleInList(form.dimensionColumns, c.columnName) })} />
                          {c.columnName}
                        </label>
                      ))}
                    </div>
                    <div className="column-picker">
                      <span>Cột đưa vào Measures</span>
                      {mainColumns.map(c => (
                        <label key={c.columnName} className="checkbox-row">
                          <input type="checkbox" checked={form.measureColumns.includes(c.columnName)} onChange={() => setForm({ ...form, measureColumns: toggleInList(form.measureColumns, c.columnName) })} />
                          {c.columnName}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {mainColumns.length > 0 && (
                  <label className="checkbox-row">
                    <input type="checkbox" checked={form.useJoin} onChange={(e) => setForm({ ...form, useJoin: e.target.checked })} />
                    Thêm bảng/view liên kết (cùng nguồn)
                  </label>
                )}

                {form.useJoin && (
                  <fieldset>
                    <legend>Bảng/view liên kết</legend>
                    {fkSuggestions.length > 0 && (
                      <div className="fk-suggestions">
                        <span>Gợi ý theo khoá ngoại có sẵn:</span>
                        {fkSuggestions.map(fk => (
                          <button type="button" key={fk.columnName} onClick={() => applyFkSuggestion(fk)}>
                            {fk.columnName} → {fk.refSchema}.{fk.refTable}.{fk.refColumn}
                          </button>
                        ))}
                      </div>
                    )}
                    <select value={form.joinSchema && form.joinTable ? `${form.joinSchema}.${form.joinTable}` : ''} onChange={(e) => pickJoinTable(e.target.value)}>
                      <option value="">— Chọn bảng/view liên kết —</option>
                      {joinTables.map(t => <option key={`${t.schemaName}.${t.tableName}`} value={`${t.schemaName}.${t.tableName}`}>{t.schemaName}.{t.tableName} ({t.tableType === 'VIEW' ? 'view' : 'bảng'})</option>)}
                    </select>
                    <select value={form.joinType} onChange={(e) => setForm({ ...form, joinType: e.target.value })}>
                      <option value="LEFT">LEFT JOIN</option>
                      <option value="INNER">INNER JOIN</option>
                    </select>
                    <label>Cột nối (bảng chính)
                      <select value={form.mainJoinColumn} onChange={(e) => setForm({ ...form, mainJoinColumn: e.target.value })}>
                        <option value="">—</option>
                        {mainColumns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                      </select>
                    </label>
                    <label>Cột nối (bảng liên kết)
                      <select value={form.lookupJoinColumn} onChange={(e) => setForm({ ...form, lookupJoinColumn: e.target.value })}>
                        <option value="">—</option>
                        {joinColumns.map(c => <option key={c.columnName} value={c.columnName}>{c.columnName}</option>)}
                      </select>
                    </label>
                    {joinColumns.length > 0 && (
                      <div className="column-picker">
                        <span>Cột lấy từ bảng liên kết (thêm vào Dimensions)</span>
                        {joinColumns.map(c => (
                          <label key={c.columnName} className="checkbox-row">
                            <input type="checkbox" checked={form.lookupDimensionColumns.includes(c.columnName)} onChange={() => setForm({ ...form, lookupDimensionColumns: toggleInList(form.lookupDimensionColumns, c.columnName) })} />
                            {c.columnName}
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )}
              </>
            ) : (
              <select value={form.customConnectorKey} onChange={(e) => {
                const conn = customConnectors.find(c => c.key === e.target.value);
                setForm({ ...form, customConnectorKey: e.target.value, targetDomain: form.targetDomain || conn?.domain || '' });
              }} required>
                <option value="">— Chọn connector đã viết sẵn —</option>
                {customConnectors.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            )}

            <input placeholder="Domain (dwh.ReportFacts.Domain)" value={form.targetDomain} onChange={(e) => setForm({ ...form, targetDomain: e.target.value })} required />
            <input placeholder="Lịch chạy (cron)" value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} required />
            <label className="checkbox-row">
              <input type="checkbox" checked={form.keepHistory} onChange={(e) => setForm({ ...form, keepHistory: e.target.checked })} />
              Giữ lịch sử theo ngày (mỗi EventDate 1 dòng riêng, không ghi đè — bật cho domain cần so cùng kỳ năm trước)
            </label>
            <input
              placeholder="Ánh xạ mã chi nhánh (tuỳ chọn — vd BU_ID, khớp Loại mã khai ở trang Ánh xạ mã chi nhánh)"
              value={form.branchCodeMapType}
              onChange={(e) => setForm({ ...form, branchCodeMapType: e.target.value })}
            />
            <button type="submit">Tạo job đồng bộ</button>
          </form>
        </>
      )}
    </div>
  );
}
