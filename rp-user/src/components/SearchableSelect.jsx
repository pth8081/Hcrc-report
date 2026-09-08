// components/SearchableSelect.jsx — Dropdown DÙNG CHUNG cho MỌI ô chọn/lọc
// trong toàn bộ rp-user (yêu cầu: "tất cả kiểu chọn và lọc trong report bạn
// luôn làm theo kiểu này" — searchable + multi-select + "chọn tất cả",
// KHÔNG phải ô nhập tay/gõ mã như trước, xem FilterForm.jsx). Dùng được cả
// 2 chế độ qua prop `multi`:
//   - multi=false (single select) — bấm 1 dòng là chọn xong, đóng dropdown.
//   - multi=true — checkbox từng dòng + "Chọn tất cả"/"Bỏ chọn tất cả",
//     đóng bằng bấm ra ngoài hoặc phím Escape, value là MẢNG (rỗng = coi
//     như "tất cả" ở tầng gọi, xem FilterForm.jsx/topSellingZeroStockRunner.js).
//
// options: [{ value, label }] — component này không tự tải dữ liệu, ai gọi
// tự lo (tĩnh trong definition.filters, hoặc gọi API khi hasDynamicOptions —
// xem FilterForm.jsx).
import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({ options, multi = false, value, onChange, placeholder = 'Chọn...', loading = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(multi ? (value || []) : []), [multi, value]);

  function toggleValue(v) {
    if (!multi) {
      onChange(v);
      setOpen(false);
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange([...next]);
  }

  function selectAll() { onChange(options.map(o => o.value)); }
  function clearAll() { onChange([]); }

  const summary = useMemo(() => {
    if (multi) {
      const count = (value || []).length;
      if (!count) return 'Tất cả';
      if (count === options.length && options.length > 0) return 'Tất cả';
      const labels = (value || [])
        .map(v => options.find(o => o.value === v)?.label || v)
        .slice(0, 2);
      return count > 2 ? `${labels.join(', ')} +${count - 2}` : labels.join(', ');
    }
    const found = options.find(o => o.value === value);
    return found ? found.label : (placeholder);
  }, [multi, value, options, placeholder]);

  return (
    <div className="searchable-select" ref={rootRef}>
      <button type="button" className="searchable-select-toggle" onClick={() => setOpen(v => !v)}>
        <span>{loading ? 'Đang tải...' : summary}</span>
        <span className="searchable-select-caret">▾</span>
      </button>
      {open && (
        <div className="searchable-select-panel">
          <input
            type="text"
            className="searchable-select-search"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {multi && (
            <div className="searchable-select-actions">
              <button type="button" onClick={selectAll}>Chọn tất cả</button>
              <button type="button" onClick={clearAll}>Bỏ chọn tất cả</button>
            </div>
          )}
          <div className="searchable-select-list">
            {filteredOptions.length === 0 && <div className="searchable-select-empty">Không có lựa chọn nào</div>}
            {filteredOptions.map(o => (
              <label key={o.value} className="searchable-select-option">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  checked={multi ? selectedSet.has(o.value) : value === o.value}
                  onChange={() => toggleValue(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
