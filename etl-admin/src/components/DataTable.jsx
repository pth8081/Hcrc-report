// Cột "actions" (quy ước đặt key 'actions' cho cột Sửa/Bật-Tắt/Xoá ở mọi
// trang CRUD — luôn là cột CUỐI) ghim CỐ ĐỊNH bên phải khi cuộn ngang (bản
// 9.05, theo báo cáo người dùng: bảng rộng trên điện thoại, cuộn hết cỡ vẫn
// không thấy nút "Sửa"/"Xoá" vì cuộn ngang trên di động khó kéo hết tới
// cuối) — xem rule position:sticky trên .data-table__actions-cell ở
// styles.css (áp dụng ĐỒNG BỘ cả 3 app, xem CLAUDE.md).
//
// Cột ĐẦU TIÊN (sau checkbox chọn nhiều nếu có — vd "Tên" ở trang "Đối tác
// API") ghim CỐ ĐỊNH bên TRÁI (bản 9.73, theo báo cáo người dùng: bảng
// "Đối tác API" có quá nhiều nút hành động (Sửa/Nhân bản/Tắt/Báo cáo được
// gọi/Realtime được gọi/.../Xoá) khiến cột "actions" ghim bên phải PHẢI
// cuộn ngang rất xa mới thấy — lúc đó cột "Tên" (bên trái) đã cuộn mất,
// không biết đang xem dòng đối tác nào) — mirror ĐÚNG kỹ thuật
// position:sticky đã có cho `actions`, chỉ khác cạnh ghim (left thay vì
// right). position:sticky không có tác dụng gì (vô hại) khi bảng KHÔNG
// cần cuộn ngang, nên áp dụng ĐỒNG LOẠT cho MỌI bảng không cần cờ bật/tắt
// riêng — giống đúng cách `actions` đã làm.
function cellClassName(col, colIdx, firstDataColIdx) {
  const classes = [];
  if (colIdx === firstDataColIdx) classes.push('data-table__sticky-start-cell');
  if (col.key === 'actions') classes.push('data-table__actions-cell');
  return classes.length ? classes.join(' ') : undefined;
}

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
  // Cột checkbox chọn nhiều (nếu có) KHÔNG ghim — chỉ ghim cột DỮ LIỆU đầu
  // tiên ngay sau nó (đủ để biết đang xem dòng nào, không cần ghim cả 2).
  const firstDataColIdx = selection ? 1 : 0;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{allColumns.map((col, idx) => <th key={col.key} className={cellClassName(col, idx, firstDataColIdx)}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.Id ?? row.id ?? i}>
              {allColumns.map((col, idx) => (
                <td key={col.key} className={cellClassName(col, idx, firstDataColIdx)}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
