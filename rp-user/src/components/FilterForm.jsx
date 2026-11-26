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
import DateInput from './DateInput';
import { resolveQuickDatePreset, quickDatePresetOptions } from '../lib/dateRange';

export default function FilterForm({ reportId, filters, values, onChange, onSubmit, loading }) {
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
          {/* f.hint (bản 9.27, theo yêu cầu người dùng) — ghi chú giải
              thích ý nghĩa bộ lọc ngay dưới nhãn, vd "Kênh mua" ở báo cáo
              Mua hàng cần giải thích rõ mã giao dịch nào thuộc kênh nào —
              KHÔNG bắt buộc, chỉ hiện khi definition.filters[].hint có
              khai (xem seedPurchaseOrderReports.js). */}
          {f.hint && <span className="hint filter-field-hint">{f.hint}</span>}
          {f.type === 'date' ? (
            <DateInput
              value={values[f.field] || ''}
              onChange={(e) => setValue(f.field, e.target.value)}
            />
          ) : f.type === 'dateRange' ? (
            <>
              {/* quickPresets (bản 10.83, theo yêu cầu người dùng) — nút
                  lọc nhanh "Ngày hôm trước"/"Trong ngày"/"Trong tháng",
                  CHỈ hiện khi definition.filters[].quickPresets = true
                  (báo cáo khác không đổi gì) — bấm 1 nút tự điền ĐỦ 2 ô
                  ngày bên dưới, vẫn sửa tay lại được như cũ sau khi bấm. */}
              {f.quickPresets && (
                <span className="inline-actions">
                  {quickDatePresetOptions().map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue(f.field, resolveQuickDatePreset(opt.value))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </span>
              )}
              <span className="date-range">
                <DateInput
                  value={values[f.field]?.from || ''}
                  onChange={(e) => setValue(f.field, { ...values[f.field], from: e.target.value })}
                />
                <span>—</span>
                <DateInput
                  value={values[f.field]?.to || ''}
                  onChange={(e) => setValue(f.field, { ...values[f.field], to: e.target.value })}
                />
                {/* Nút "Xoá" (bản 11.31, theo yêu cầu người dùng — "Tôi cần
                    làm ở tất cả các chỗ có 2 ngày chọn như bc này luôn
                    nhé") — ÁP DỤNG CHUNG cho MỌI filter kiểu 'dateRange'
                    (component dùng chung này), không riêng báo cáo nào.
                    Trước đây chỉ đổi được sang ngày khác (chạm ô mở lại
                    lịch), KHÔNG có cách bỏ trống về lại rỗng — chỉ hiện
                    nút khi ĐANG có ít nhất 1 ô đã điền, bấm xoá SẠCH cả 2
                    ô về rỗng cùng lúc. */}
                {(values[f.field]?.from || values[f.field]?.to) && (
                  <button
                    type="button"
                    className="date-range-clear"
                    title="Xoá ngày đã chọn"
                    onClick={() => setValue(f.field, { from: '', to: '' })}
                  >
                    ✕
                  </button>
                )}
              </span>
            </>
          ) : f.type === 'multiSelect' ? (
            <SearchableSelect
              multi
              options={f.hasDynamicOptions ? (dynamicOptions[f.field] || []) : (f.options || [])}
              value={values[f.field] || []}
              onChange={(v) => setValue(f.field, v)}
              loading={!!loadingFields[f.field]}
              placeholder="Tất cả"
            />
          ) : f.type === 'thresholdNumber' ? (
            // Lọc "Tồn dưới"/"Tồn trên" X (bản 8.68, báo cáo hàng tồn) —
            // mặc định "Tồn dưới" + 1 (tức tồn < 1, tương đương "không còn
            // hàng" — khớp hành vi ngưỡng=0 của các báo cáo tồn kho cũ),
            // người dùng đổi được cả chiều lẫn số.
            <span className="date-range">
              <select
                value={values[f.field]?.mode || f.default?.mode || 'below'}
                onChange={(e) => setValue(f.field, { ...(values[f.field] || f.default), mode: e.target.value })}
              >
                <option value="below">Tồn dưới</option>
                <option value="above">Tồn trên</option>
              </select>
              <input
                type="number"
                value={values[f.field]?.value ?? f.default?.value ?? 1}
                onChange={(e) => setValue(f.field, { ...(values[f.field] || f.default), value: Number(e.target.value) })}
              />
            </span>
          ) : f.type === 'select' ? (
            <SearchableSelect
              options={f.hasDynamicOptions ? (dynamicOptions[f.field] || []) : (f.options || [])}
              value={values[f.field] ?? f.default ?? ''}
              onChange={(v) => setValue(f.field, v)}
              loading={!!loadingFields[f.field]}
              placeholder="Chọn..."
            />
          ) : f.type === 'onlyFutureDate' ? (
            // Bản 11.11 (báo cáo "Thay đổi giá từ thời điểm") — checkbox
            // đơn, tick = chỉ hiện giá áp dụng SAU hôm nay (xem
            // rp-server/lib/reportEngine.js).
            <input
              type="checkbox"
              checked={!!values[f.field]}
              onChange={(e) => setValue(f.field, e.target.checked)}
            />
          ) : f.type === 'numberMin' || f.type === 'numberMax' ? (
            // Bản 9.43 (báo cáo Tồn kho) — ô nhập số TỰ DO cho "điều kiện
            // lớn hơn"/"điều kiện nhỏ hơn" (xem rp-server/lib/reportEngine.js
            // — filterDef.column dùng chung 1 measure, filterDef.field riêng
            // từng ô để không đè giá trị lên nhau).
            <input
              type="number"
              value={values[f.field] ?? ''}
              onChange={(e) => setValue(f.field, e.target.value === '' ? '' : Number(e.target.value))}
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
      <button type="submit" disabled={loading}>{loading ? 'Đang lọc...' : 'Lọc'}</button>
    </form>
  );
}
