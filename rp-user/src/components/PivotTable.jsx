// components/PivotTable.jsx — Bảng Pivot/cross-tab cho
// visualization.type='pivot' (xem hướng_dẫn_báo_cáo.md mục 8) + drill-down:
// click 1 ô số để xổ ra đúng các dòng gốc tạo nên ô đó, dùng lại DataTable,
// KHÔNG gọi lại API (buildPivot() giữ nguyên mảng dòng gốc theo từng ô,
// xem lib/pivot.js).
import { useState } from 'react';
import { buildPivot } from '../lib/pivot';
import DataTable from './DataTable';

const numberFmt = (v) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : '—');

export default function PivotTable({ columns, rows, visualization }) {
  const { rowField, colField, valueField, agg = 'sum' } = visualization;
  const [selectedCell, setSelectedCell] = useState(null); // { rowKey, colKey } | null

  // Dòng "Tổng cộng"/"Tổng nhóm" (__isSubtotal, xem compositeReportRunner.js)
  // không đưa vào pivot — pivot TỰ TÍNH tổng riêng (rowTotal/colTotal/
  // grandTotal), cộng lẫn dòng tổng có sẵn sẽ tính đúp.
  const pivotRows = rows.filter(r => !r.__isSubtotal);
  if (!pivotRows.length) return <p className="empty-message">Không có dữ liệu.</p>;

  const pivot = buildPivot(pivotRows, { rowField, colField, valueField, agg });
  const aggLabel = { sum: 'Tổng', avg: 'Trung bình', count: 'Số dòng' }[agg] || agg;

  function toggleCell(rowKey, colKey) {
    setSelectedCell(prev => (prev && prev.rowKey === rowKey && prev.colKey === colKey ? null : { rowKey, colKey }));
  }

  return (
    <>
      <div className="table-scroll">
        <table className="data-table pivot-table">
          <thead>
            <tr>
              <th></th>
              {pivot.colKeys.map(ck => <th key={ck}>{ck}</th>)}
              <th>{aggLabel} hàng</th>
            </tr>
          </thead>
          <tbody>
            {pivot.rowKeys.map(rk => (
              <tr key={rk}>
                <th>{rk}</th>
                {pivot.colKeys.map(ck => {
                  const isSelected = selectedCell?.rowKey === rk && selectedCell?.colKey === ck;
                  const value = pivot.cellValue(rk, ck);
                  return (
                    <td
                      key={ck}
                      className={`pivot-cell${isSelected ? ' pivot-cell--selected' : ''}${value !== null ? ' pivot-cell--clickable' : ''}`}
                      onClick={value !== null ? () => toggleCell(rk, ck) : undefined}
                    >
                      {numberFmt(value)}
                    </td>
                  );
                })}
                <td className="pivot-cell pivot-cell--total">{numberFmt(pivot.rowTotal(rk))}</td>
              </tr>
            ))}
            <tr className="pivot-total-row">
              <th>{aggLabel} cột</th>
              {pivot.colKeys.map(ck => <td key={ck} className="pivot-cell--total">{numberFmt(pivot.colTotal(ck))}</td>)}
              <td className="pivot-cell--total">{numberFmt(pivot.grandTotal())}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <div className="pivot-drill">
          <p className="pivot-drill-title">
            Chi tiết: <strong>{selectedCell.rowKey}</strong> / <strong>{selectedCell.colKey}</strong>
            <button type="button" className="link-button" onClick={() => setSelectedCell(null)}>Đóng</button>
          </p>
          <DataTable columns={columns} rows={pivot.cellRawRows(selectedCell.rowKey, selectedCell.colKey)} />
        </div>
      )}
    </>
  );
}
