// selection (TUỲ CHỌN — bản 8.62, kết quả của hook lib/useRowSelection) —
// thêm 1 cột checkbox đầu bảng (cả ô "chọn tất cả" ở header) để chọn nhiều
// dòng rồi xoá hàng loạt; không truyền thì bảng vẽ như cũ, không đổi gì.
export default function DataTable({ columns, rows, emptyMessage = 'Không có dữ liệu.', selection = null }) {
  if (!rows.length) return <p className="empty-message">{emptyMessage}</p>;

  const allColumns = selection
    ? [{
        key: '_select',
        label: (
          <input
            type="checkbox"
            checked={rows.length > 0 && rows.every(r => selection.isSelected(r))}
            onChange={() => selection.toggleAll(rows)}
          />
        ),
        render: (row) => (
          <input type="checkbox" checked={selection.isSelected(row)} onChange={() => selection.toggle(row)} />
        )
      }, ...columns]
    : columns;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{allColumns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.Id ?? row.id ?? i}>
              {allColumns.map(col => (
                <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
