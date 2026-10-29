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

// Bỏ dấu tiếng Việt khi so khớp tìm kiếm (bản 9.16, theo yêu cầu người
// dùng — danh sách Nhà cung cấp rất dài, gõ nhanh trên điện thoại hay bỏ
// dấu, trước đây gõ "cong ty" KHÔNG tìm ra "Công ty" vì so khớp CHUỖI
// NGUYÊN VĂN có dấu) — NFD tách dấu thành ký tự tổ hợp riêng rồi xoá, cộng
// riêng đ/Đ (KHÔNG tách được qua NFD, là 1 ký tự Unicode riêng chứ không
// phải "d" + dấu). Áp dụng cho CẢ chuỗi gõ tìm LẪN nhãn option — gõ có dấu
// hay không dấu đều ra đúng kết quả.
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
// Google Sheets: 1 cột nhiều dòng -> xuống dòng; nhiều ô cùng dòng -> Tab;
// hoặc người dùng tự gõ tay cách nhau dấu phẩy/chấm phẩy).
const PASTE_SPLIT_RE = /[,;\n\t]+/;

function splitPastedTokens(text) {
  return String(text || '').split(PASTE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
}

export default function SearchableSelect({ options, multi = false, value, onChange, placeholder = 'Chọn...', loading = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Kết quả lần dán gần nhất (bản 10.35, theo yêu cầu người dùng — "copy
  // paste dán vào ô chọn, tự động select theo đúng điều kiện dán vào") —
  // hiện 1 dòng tóm tắt khớp/không khớp bao nhiêu mã ngay dưới ô tìm kiếm,
  // tự ẩn khi đóng dropdown hoặc gõ/dán lần khác.
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

  // Dán danh sách để tự chọn (bản 10.35, theo yêu cầu người dùng — "copy
  // paste dán vào cái ô chọn, tự động nó sẽ select theo đúng cái điều kiện
  // mà tôi dán vào") — CHỈ can thiệp khi nội dung dán có từ 2 mã trở lên
  // (có dấu phân tách xuống dòng/phẩy/chấm phẩy/Tab); dán đúng 1 từ vẫn rơi
  // về hành vi TÌM KIẾM bình thường như trước (không đổi gì), tránh can
  // thiệp bất ngờ khi người dùng chỉ paste 1 từ khoá để lọc danh sách nhìn
  // bằng mắt. Khớp theo cả `value` (mã) LẪN `label` (tên hiển thị, phòng
  // khi người dùng copy nguyên cột TÊN thay vì MÃ từ Excel), không phân
  // biệt hoa/thường/dấu tiếng Việt (dùng lại normalizeVN ở trên). Danh
  // sách chọn được THAY THẾ hẳn bằng đúng tập mã khớp được dán vào (không
  // cộng dồn với lựa chọn cũ) — đúng yêu cầu "select theo đúng điều kiện
  // dán vào".
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
