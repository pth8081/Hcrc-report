// components/DataTable.jsx — Bảng dữ liệu chung, dùng ở mọi màn hình (báo
// cáo, danh sách người dùng, log...). Không phân trang/sort ở đây — nơi gọi
// tự quyết định (report viewer đã phân trang ở API, các trang CRUD danh sách
// ngắn không cần).
export default function DataTable({ columns, rows, emptyMessage = 'Không có dữ liệu.' }) {
  if (!rows.length) return <p className="empty-message">{emptyMessage}</p>;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => <th key={col.key}>{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map(col => (
                <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
