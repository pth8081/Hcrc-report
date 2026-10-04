// lib/useRowSelection.js — chọn nhiều dòng trong 1 bảng để xoá hàng loạt
// (bản 8.62). getId lấy ID duy nhất của 1 dòng (mặc định row.Id) — truyền
// riêng cho bảng dùng khoá khác (vd row.Endpoint, row.ReportId).
import { useState } from 'react';

export function useRowSelection(getId = (row) => row.Id) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  function toggle(row) {
    const id = getId(row);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(rows) {
    setSelectedIds(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev.has(getId(r)));
      return allSelected ? new Set() : new Set(rows.map(getId));
    });
  }

  function isSelected(row) {
    return selectedIds.has(getId(row));
  }

  function clear() {
    setSelectedIds(new Set());
  }

  return { selectedIds, toggle, toggleAll, isSelected, clear };
}
