// components/SearchableSelect.jsx — Dropdown tìm kiếm + chọn nhiều, PORT
// NGUYÊN VẸN từ rp-user/src/components/SearchableSelect.jsx (bản 10.56,
// theo yêu cầu người dùng — "đổi lại hết toàn bộ" các ô chọn siêu thị kiểu
// checkbox phẳng sang dropdown tìm kiếm, vì danh sách siêu thị dài tick rất
// lâu). KHÔNG dùng chung qua "shared/" — mỗi app tự chứa đủ code khi copy
// riêng lên máy chủ triển khai, cùng nguyên tắc đã áp dụng cho
// lib/reportEngine.js giữa rp-server/api-server. Sửa cả 3 nơi (rp-user/
// etl-admin/api-admin) khi cần đổi hành vi chung.
//
// Dùng được cả 2 chế độ qua prop `multi`:
//   - multi=false (single select) — bấm 1 dòng là chọn xong, đóng dropdown.
//   - multi=true — checkbox từng dòng + "Chọn tất cả"/"Bỏ chọn tất cả",
//     đóng bằng bấm ra ngoài hoặc phím Escape, value là MẢNG.
//
// options: [{ value, label }] — component này không tự tải dữ liệu, ai gọi
// tự lo (xem UsersPage.jsx:"Gán siêu thị").
import { useEffect, useMemo, useRef, useState } from 'react';

// Bỏ dấu tiếng Việt khi so khớp tìm kiếm — NFD tách dấu thành ký tự tổ hợp
// riêng rồi xoá, cộng riêng đ/Đ (KHÔNG tách được qua NFD, là 1 ký tự
// Unicode riêng chứ không phải "d" + dấu). Áp dụng cho CẢ chuỗi gõ tìm LẪN
// nhãn option — gõ có dấu hay không dấu đều ra đúng kết quả.
function normalizeVN(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Tách danh sách dán vào thành từng mã riêng — chấp nhận xuống dòng, dấu
// phẩy, chấm phẩy, Tab (đúng các kiểu phân tách phổ biến khi copy từ Excel/
// Google Sheets).
const PASTE_SPLIT_RE = /[,;\n\t]+/;

function splitPastedTokens(text) {
  return String(text || '').split(PASTE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
}

export default function SearchableSelect({ options, multi = false, value, onChange, placeholder = 'Chọn...', loading = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) setPasteResult(null);
  }, [open]);

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
    const q = normalizeVN(search.trim());
    if (!q) return options;
    return options.filter(o => normalizeVN(o.label).includes(q) || normalizeVN(o.value).includes(q));
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

  // Dán danh sách để tự chọn — CHỈ can thiệp khi nội dung dán có từ 2 mã
  // trở lên; dán đúng 1 từ vẫn rơi về hành vi TÌM KIẾM bình thường. Khớp
  // theo cả `value` (mã) LẪN `label` (tên hiển thị), không phân biệt hoa/
  // thường/dấu tiếng Việt.
  function handlePaste(e) {
    if (!multi) return;
    const text = e.clipboardData?.getData('text') || '';
    const tokens = splitPastedTokens(text);
    if (tokens.length < 2) { setPasteResult(null); return; }
    e.preventDefault();
    const matched = [];
    let unmatchedCount = 0;
    for (const t of tokens) {
      const nt = normalizeVN(t);
      const found = options.find(o => normalizeVN(String(o.value)) === nt || normalizeVN(o.label) === nt);
      if (found) matched.push(found.value); else unmatchedCount++;
    }
    const uniqueMatched = [...new Set(matched)];
    onChange(uniqueMatched);
    setSearch('');
    setPasteResult({ matched: uniqueMatched.length, total: tokens.length, unmatched: unmatchedCount });
  }

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
            placeholder={multi ? 'Tìm kiếm, hoặc dán cả danh sách (mỗi mã 1 dòng/phẩy)...' : 'Tìm kiếm...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPasteResult(null); }}
            onPaste={handlePaste}
            autoFocus
          />
          {pasteResult && (
            <div className={`searchable-select-paste-feedback${pasteResult.unmatched > 0 ? ' searchable-select-paste-feedback--warn' : ''}`}>
              {pasteResult.unmatched > 0
                ? `Đã chọn ${pasteResult.matched}/${pasteResult.total} mã khớp — ${pasteResult.unmatched} mã không có trong danh sách.`
                : `Đã chọn đúng ${pasteResult.matched} mã khớp từ danh sách vừa dán.`}
            </div>
          )}
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
