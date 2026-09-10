// modules/reports/AdhocReportPage.jsx — "Báo cáo tự do" (self-service,
// hướng Power BI, xem hướng_dẫn_báo_cáo.md): KHÁC HẲN modules/reports/ReportsPage.jsx
// (đó là báo cáo ADMIN đã định nghĩa sẵn trong app.ReportCatalog, người dùng
// chỉ lọc) — ở đây người dùng TỰ chọn Domain + trường nhóm (dimensions) + số
// liệu tổng hợp (measures, kèm hàm tổng hợp), hệ thống tự dựng GROUP BY
// (xem rp-server/lib/adhocReportEngine.js). Domain nào được tự khám phá do
// admin cấp qua app.RoleDomainAccess (trang Phân quyền).
//
// Kết quả trả về CÙNG SHAPE {columns, rows} như báo cáo thường — tái dùng
// thẳng components/ReportBody.jsx (DataTable/PivotTable/ReportChart), không
// viết lại UI hiển thị.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import ReportBody from '../../components/ReportBody';

const AGG_LABELS = { sum: 'Tổng', avg: 'Trung bình', count: 'Đếm', min: 'Nhỏ nhất', max: 'Lớn nhất' };
const VIZ_TYPES = [
  { value: 'table', label: 'Bảng' },
  { value: 'pivot', label: 'Bảng chéo (pivot)' },
  { value: 'bar', label: 'Biểu đồ cột' },
  { value: 'line', label: 'Biểu đồ đường' },
  { value: 'pie', label: 'Biểu đồ tròn' },
  { value: 'kpi', label: 'Thẻ KPI' }
];

function defaultDateRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(today) };
}

export default function AdhocReportPage() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState('');
  const [fields, setFields] = useState(null); // { dimensionFields, measureFields, entityCodes }
  const [selectedDimensions, setSelectedDimensions] = useState([]);
  const [selectedMeasures, setSelectedMeasures] = useState([]); // [{field, agg}]
  const [selectedEntityCodes, setSelectedEntityCodes] = useState([]);
  const [{ dateFrom, dateTo }, setDateRange] = useState(defaultDateRange());
  const [vizType, setVizType] = useState('table');
  const [pivotRowField, setPivotRowField] = useState('');
  const [pivotColField, setPivotColField] = useState('');

  const [result, setResult] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [savedReports, setSavedReports] = useState([]);

  function reloadSaved() {
    api.get('/adhoc-reports/saved').then(setSavedReports).catch(err => setError(err.message));
  }

  useEffect(() => {
    api.get('/adhoc-reports/domains').then(setDomains).catch(err => setError(err.message));
    reloadSaved();
  }, []);

  function resetSelection() {
    setSelectedDimensions([]);
    setSelectedMeasures([]);
    setSelectedEntityCodes([]);
    setPivotRowField('');
    setPivotColField('');
    setResult(null);
    setShowTable(false);
  }

  async function loadDomain(d) {
    setDomain(d);
    setError('');
    resetSelection();
    if (!d) { setFields(null); return; }
    try {
      const f = await api.get(`/adhoc-reports/domains/${encodeURIComponent(d)}/fields`);
      setFields(f);
    } catch (err) { setError(err.message); }
  }

  function toggleDimension(field) {
    setSelectedDimensions(prev => (prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]));
  }

  function toggleMeasure(field, checked) {
    setSelectedMeasures(prev => (checked
      ? [...prev, { field, agg: 'sum' }]
      : prev.filter(m => m.field !== field)));
  }

  function setMeasureAgg(field, agg) {
    setSelectedMeasures(prev => prev.map(m => (m.field === field ? { ...m, agg } : m)));
  }

  function buildVisualization(columns) {
    if (vizType === 'table') return null;
    if (vizType === 'pivot') {
      if (!pivotRowField || !pivotColField || !selectedMeasures.length) return null;
      return { type: 'pivot', rowField: pivotRowField, colField: pivotColField, valueField: `${selectedMeasures[0].field}_${selectedMeasures[0].agg}`, agg: 'sum' };
    }
    const valueFields = selectedMeasures.map(m => `${m.field}_${m.agg}`);
    if (vizType === 'kpi') return { type: 'kpi', valueFields };
    return { type: vizType, xField: selectedDimensions[0], valueFields };
  }

  async function run() {
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/adhoc-reports/run', {
        domain, dimensionFields: selectedDimensions, measures: selectedMeasures,
        dateFrom, dateTo, entityCodes: selectedEntityCodes
      });
      setResult(data);
      setShowTable(false);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    const title = prompt('Đặt tên cho báo cáo này:');
    if (!title) return;
    try {
      const configJson = JSON.stringify({
        domain, dimensionFields: selectedDimensions, measures: selectedMeasures,
        dateFrom, dateTo, entityCodes: selectedEntityCodes,
        vizType, pivotRowField, pivotColField
      });
      await api.post('/adhoc-reports/saved', { title, configJson });
      reloadSaved();
    } catch (err) { setError(err.message); }
  }

  async function openSaved(saved) {
    setError('');
    let cfg;
    try { cfg = JSON.parse(saved.ConfigJson); } catch { setError('Cấu hình đã lưu bị hỏng'); return; }
    await loadDomain(cfg.domain);
    setSelectedDimensions(cfg.dimensionFields || []);
    setSelectedMeasures(cfg.measures || []);
    setSelectedEntityCodes(cfg.entityCodes || []);
    setDateRange({ dateFrom: cfg.dateFrom, dateTo: cfg.dateTo });
    setVizType(cfg.vizType || 'table');
    setPivotRowField(cfg.pivotRowField || '');
    setPivotColField(cfg.pivotColField || '');
  }

  async function renameSaved(saved) {
    const title = prompt('Đổi tên báo cáo:', saved.Title);
    if (!title || title === saved.Title) return;
    try {
      await api.put(`/adhoc-reports/saved/${saved.Id}`, { title, configJson: saved.ConfigJson });
      reloadSaved();
    } catch (err) { setError(err.message); }
  }

  async function deleteSaved(saved) {
    if (!confirm(`Xoá báo cáo đã lưu "${saved.Title}"?`)) return;
    try {
      await api.del(`/adhoc-reports/saved/${saved.Id}`);
      reloadSaved();
    } catch (err) { setError(err.message); }
  }

  const canRun = domain && (selectedDimensions.length || selectedMeasures.length) && dateFrom && dateTo
    && (vizType !== 'pivot' || (pivotRowField && pivotColField && selectedMeasures.length));

  return (
    <div className="page">
      <h1>Báo cáo tự do</h1>
      <p className="login-card-hint">Tự chọn dữ liệu, tự dựng bảng/biểu đồ — không cần admin tạo sẵn báo cáo.</p>
      {error && <p className="form-error">{error}</p>}

      {savedReports.length > 0 && (
        <div className="saved-reports-panel">
          <h4>Báo cáo đã lưu của tôi</h4>
          {savedReports.map(s => (
            <div key={s.Id} className="checkbox-row">
              <button type="button" className="link-button" onClick={() => openSaved(s)}>{s.Title}</button>{' '}
              <button type="button" onClick={() => renameSaved(s)}>Đổi tên</button>{' '}
              <button type="button" onClick={() => deleteSaved(s)}>Xoá</button>
            </div>
          ))}
        </div>
      )}

      <label className="report-picker">
        <span>Domain (nguồn dữ liệu)</span>
        <select value={domain} onChange={(e) => loadDomain(e.target.value)}>
          <option value="">— Chọn —</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      {!domains.length && <p className="form-hint">Bạn chưa được cấp quyền khám phá Domain nào — liên hệ admin ở trang Phân quyền.</p>}

      {fields && (
        <>
          <h4>Trường nhóm (dimensions)</h4>
          {fields.dimensionFields.concat('entityCode').map(f => (
            <label key={f} className="checkbox-row">
              <input type="checkbox" checked={selectedDimensions.includes(f)} onChange={() => toggleDimension(f)} />
              {f}
            </label>
          ))}

          <h4>Số liệu (measures)</h4>
          {fields.measureFields.map(f => {
            const m = selectedMeasures.find(x => x.field === f);
            return (
              <label key={f} className="checkbox-row">
                <input type="checkbox" checked={!!m} onChange={(e) => toggleMeasure(f, e.target.checked)} />
                {f}
                {m && (
                  <select value={m.agg} onChange={(e) => setMeasureAgg(f, e.target.value)}>
                    {Object.entries(AGG_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                )}
              </label>
            );
          })}

          <div className="inline-form">
            <label>
              <span>Từ ngày</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateRange(r => ({ ...r, dateFrom: e.target.value }))} />
            </label>
            <label>
              <span>Đến ngày</span>
              <input type="date" value={dateTo} onChange={(e) => setDateRange(r => ({ ...r, dateTo: e.target.value }))} />
            </label>
          </div>

          {fields.entityCodes.length > 0 && (
            <label>
              <span>Lọc theo mã (bỏ trống = tất cả)</span>
              <select multiple value={selectedEntityCodes} onChange={(e) => setSelectedEntityCodes([...e.target.selectedOptions].map(o => o.value))}>
                {fields.entityCodes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          <label className="report-picker">
            <span>Kiểu hiển thị</span>
            <select value={vizType} onChange={(e) => setVizType(e.target.value)}>
              {VIZ_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </label>

          {vizType === 'pivot' && (
            <div className="inline-form">
              <label>
                <span>Trường theo hàng</span>
                <select value={pivotRowField} onChange={(e) => setPivotRowField(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {selectedDimensions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label>
                <span>Trường theo cột</span>
                <select value={pivotColField} onChange={(e) => setPivotColField(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {selectedDimensions.filter(f => f !== pivotRowField).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="export-actions">
            <button type="button" disabled={!canRun || loading} onClick={run}>{loading ? 'Đang chạy...' : 'Chạy'}</button>
            <button type="button" disabled={!result} onClick={saveCurrent}>Lưu báo cáo của tôi</button>
            {result && vizType !== 'table' && (
              <button type="button" onClick={() => setShowTable(v => !v)}>{showTable ? '📊 Xem lại biểu đồ' : '📋 Xem bảng chi tiết'}</button>
            )}
          </div>

          {result && (
            <>
              {result.truncated && <p className="form-warning">⚠️ Kết quả bị cắt bớt (quá nhiều dòng) — thu hẹp bộ lọc/khoảng ngày để xem đầy đủ.</p>}
              <ReportBody visualization={buildVisualization(result.columns)} showTable={showTable} result={result} />
            </>
          )}
        </>
      )}
    </div>
  );
}
