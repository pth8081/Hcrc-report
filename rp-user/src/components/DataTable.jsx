// components/DataTable.jsx — Bảng dữ liệu chung, dùng ở mọi màn hình (báo
// cáo, danh sách người dùng, log...). Không phân trang/sort ở đây — nơi gọi
// tự quyết định (report viewer đã phân trang ở API, các trang CRUD danh sách
// ngắn không cần).
//
// columnGroups (TUỲ CHỌN — bản 8.53, xem deploy/Cập nhật bản 8.53) =
// [{label, color, keys}], do server trả kèm result.columnGroups khi
// definition.columnGroups có khai (ReportsPage.jsx/DashboardTile.jsx qua
// ReportBody.jsx) — vẽ ĐÚNG khuôn tiêu đề gộp 2 dòng theo màu từng nhóm như
// lib/exportExcel.js/lib/exportPdf.js đã làm cho file xuất, để bảng xem
// NGAY TRÊN WEB đẹp khớp hệt Excel/PDF thay vì bảng phẳng 1 dòng không màu
// như trước. KHÔNG truyền columnGroups (mọi nơi gọi khác — UsersPage,
// RolesPage...) thì vẽ bảng phẳng y hệt trước đây, không đổi gì.
import { resolveGroupColor, SUBTOTAL_COLOR } from '../lib/reportGroupColors';

// Dòng "Tổng cộng"/"Tổng nhóm" — row.__isSubtotal (xem
// compositeReportRunner.js) — tô nền tím nhạt + chữ đậm, ĐÚNG màu
// SUBTOTAL_COLOR dùng ở Excel (lib/reportCellFormat.js), không phân biệt
// dòng tổng nhóm (vd "Tổng cộng MART") với dòng tổng toàn báo cáo
// (__isGrandTotal thêm) vì Excel cũng tô 2 loại dòng này CÙNG 1 màu.
function rowStyle(row) {
  return row.__isSubtotal ? { background: SUBTOTAL_COLOR, fontWeight: 700 } : undefined;
}

// Dựng cấu trúc tiêu đề 2 dòng từ columnGroups — cột KHÔNG thuộc nhóm nào
// gộp dọc (rowSpan 2, giữ nguyên 1 ô như bảng phẳng); cột thuộc 1 nhóm thì
// dòng 1 là ô gộp ngang theo đúng số cột liền kề cùng nhóm (tô màu nhóm),
// dòng 2 là tên từng cột con (cũng tô màu nhóm, nhạt hơn 1 chút để phân
// biệt 2 dòng) — ĐÚNG cấu trúc merge r1/r2 của lib/exportExcel.js.
function buildGroupedHeader(columns, columnGroups) {
  const keyToGroup = new Map();
  for (const g of columnGroups) {
    for (const k of g.keys || []) keyToGroup.set(k, g);
  }
  const segments = [];
  let i = 0;
  while (i < columns.length) {
    const col = columns[i];
    const group = keyToGroup.get(col.key);
    if (!group) {
      segments.push({ type: 'single', col });
      i += 1;
      continue;
    }
    const start = i;
    while (i < columns.length && keyToGroup.get(columns[i].key) === group) i += 1;
    segments.push({ type: 'group', group, cols: columns.slice(start, i) });
  }
  return segments;
}

export default function DataTable({ columns, rows, emptyMessage = 'Không có dữ liệu.', scrollClassName = '', columnGroups = null }) {
  if (!rows.length) return <p className="empty-message">{emptyMessage}</p>;

  const segments = columnGroups && columnGroups.length ? buildGroupedHeader(columns, columnGroups) : null;
  const tableClassName = segments ? 'data-table data-table--grouped' : 'data-table';

  return (
    <div className={`table-scroll ${scrollClassName}`.trim()}>
      <table className={tableClassName}>
        <thead>
          {segments ? (
            <>
              <tr className="group-header-row">
                {segments.map((seg, idx) => seg.type === 'single'
                  ? <th key={seg.col.key} rowSpan={2}>{seg.col.label}</th>
                  : (
                    <th key={`g-${idx}`} colSpan={seg.cols.length} style={{ background: resolveGroupColor(seg.group.color) }}>
                      {seg.group.label}
                    </th>
                  ))}
              </tr>
              <tr className="group-subheader-row">
                {segments.filter(seg => seg.type === 'group').flatMap(seg => seg.cols.map(col => (
                  <th key={col.key} style={{ background: resolveGroupColor(seg.group.color) }}>{col.label}</th>
                )))}
              </tr>
            </>
          ) : (
            <tr>
              {columns.map(col => <th key={col.key}>{col.label}</th>)}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} style={rowStyle(row)}>
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
