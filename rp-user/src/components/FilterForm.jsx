// components/FilterForm.jsx — Vẽ form lọc ĐỘNG theo definition.filters của
// một báo cáo (rp-server trả về từ GET /api/reports/:id) — không có
// component riêng cho từng báo cáo, một component này dùng cho mọi báo cáo.
//
// GIỚI HẠN Ở BƯỚC KHUNG NÀY: type "select"/"multiSelect" chưa nối với danh
// mục thật (app.Categories) — đang vẽ dạng ô nhập tay. Khi cần, đổi field
// filter này sang tra cứu app.Categories theo CategoryType tương ứng.
export default function FilterForm({ filters, values, onChange, onSubmit }) {
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
            <input
              type="text"
              placeholder="Cách nhau bởi dấu phẩy"
              value={(values[f.field] || []).join(', ')}
              onChange={(e) => setValue(f.field, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
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
