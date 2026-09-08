// components/FilterForm.jsx — Vẽ form lọc ĐỘNG theo definition.filters của
// một báo cáo (rp-server trả về từ GET /api/reports/:id) — không có
// component riêng cho từng báo cáo, một component này dùng cho mọi báo cáo.
//
// type "select"/"multiSelect" dùng chung SearchableSelect.jsx (dropdown
// searchable + multi-select + "chọn tất cả" — yêu cầu áp dụng cho TẤT CẢ
// báo cáo, không riêng gì 1 báo cáo cụ thể). Lựa chọn (options) có 2 nguồn:
//   - Tĩnh: definition.filters[].options = [{value,label}] (khai sẵn trong
//     DefinitionJson, vd 4 lựa chọn "Khoảng thời gian xếp hạng").
//   - Động: definition.filters[].hasDynamicOptions = true — gọi GET
//     /api/reports/:reportId/filter-options/:field (xem routes/reports.js)
//     để lấy danh sách giá trị THẬT từ dữ liệu đã đồng bộ (vd danh sách chi
//     nhánh) — cần `reportId` (prop mới) để gọi đúng route.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import SearchableSelect from './SearchableSelect';

export default function FilterForm({ reportId, filters, values, onChange, onSubmit }) {
  const [dynamicOptions, setDynamicOptions] = useState({});
  const [loadingFields, setLoadingFields] = useState({});

  useEffect(() => {
    setDynamicOptions({});
    let cancelled = false;
    (filters || []).filter(f => f.hasDynamicOptions).forEach(f => {
      setLoadingFields(s => ({ ...s, [f.field]: true }));
      api.get(`/reports/${reportId}/filter-options/${encodeURIComponent(f.field)}`)
        .then(rows => {
          if (cancelled) return;
          setDynamicOptions(s => ({ ...s, [f.field]: rows.map(r => ({ value: r.value, label: r.label || r.value })) }));
        })
        .catch(() => { if (!cancelled) setDynamicOptions(s => ({ ...s, [f.field]: [] })); })
        .finally(() => { if (!cancelled) setLoadingFields(s => ({ ...s, [f.field]: false })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, filters]);

  function setValue(field, value) {
    onChange({ ...values, [field]: value });
  }

  return (
    <form className="filter-form" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {filters.map(f => (
        <label key={f.field} className="filter-field">
          <span>{f.label}</span>
          {f.type === 'date' ? (
            <input
              type="date"
              value={values[f.field] || ''}
              onChange={(e) => setValue(f.field, e.target.value)}
            />
          ) : f.type === 'dateRange' ? (
            <span className="date-range">
              <input
                type="date"
                value={values[f.field]?.from || ''}
                onChange={(e) => setValue(f.field, { ...values[f.field], from: e.target.value })}
              />
              <span>—</span>
              <input
                type="date"
                value={values[f.field]?.to || ''}
                onChange={(e) => setValue(f.field, { ...values[f.field], to: e.target.value })}
              />
            </span>
          ) : f.type === 'multiSelect' ? (
            <SearchableSelect
              multi
              options={f.hasDynamicOptions ? (dynamicOptions[f.field] || []) : (f.options || [])}
              value={values[f.field] || []}
              onChange={(v) => setValue(f.field, v)}
              loading={!!loadingFields[f.field]}
              placeholder="Tất cả"
            />
          ) : f.type === 'select' ? (
            <SearchableSelect
              options={f.hasDynamicOptions ? (dynamicOptions[f.field] || []) : (f.options || [])}
              value={values[f.field] ?? f.default ?? ''}
              onChange={(v) => setValue(f.field, v)}
              loading={!!loadingFields[f.field]}
              placeholder="Chọn..."
            />
          ) : (
            <input
              type="text"
              value={values[f.field] || ''}
              onChange={(e) => setValue(f.field, e.target.value)}
            />
          )}
        </label>
      ))}
      <button type="submit">Lọc</button>
    </form>
  );
}
