export default function DataTable({ columns, rows, emptyMessage = 'Không có dữ liệu.' }) {
  if (!rows.length) return <p className="empty-message">{emptyMessage}</p>;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.Id ?? row.id ?? i}>
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
