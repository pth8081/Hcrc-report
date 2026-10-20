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
//
// standaloneColumnColors (TUỲ CHỌN — bản 8.58, xem deploy/Cập nhật bản
// 8.58) = {colKey: 'tên màu'}, do server trả kèm result.standaloneColumnColors
// — tô màu HEADER 1 cột đơn lẻ KHÔNG thuộc columnGroups nào (vd "Trung bình
// GD"), khác hẳn columnGroups (không vẽ thêm dòng tiêu đề nhóm riêng).
import { resolveGroupColor, resolveRowFillColor, resolveStandaloneColumnColor, computeZebraFlags, ZEBRA_COLOR } from '../lib/reportGroupColors';

// Màu nền 1 Ô dữ liệu — dòng Tổng cộng/Tổng cộng nhóm dùng ĐÚNG màu của
// nhóm cột đó (resolveRowFillColor, bản 8.58 — xem lib/reportGroupColors.js),
// dòng thường dùng màu zebra nếu tới lượt; không có gì đặc biệt thì để
// trống (nền mặc định, không ép trắng — tránh đè màu nền khác nếu sau này
// có nơi gọi khác dùng).
function cellStyle(row, col, columnGroups, isZebra) {
  const sttStyle = col.key === 'stt' ? { textAlign: 'center' } : undefined;
  const subtotalColor = resolveRowFillColor(row, col, columnGroups || []);
  if (subtotalColor) return { ...sttStyle, background: subtotalColor, fontWeight: 700 };
  if (isZebra) return { ...sttStyle, background: ZEBRA_COLOR };
  return sttStyle;
}

// headerStyle (bản 9.44, theo yêu cầu người dùng — "thêm cột STT và căn
// giữa") — PDF/Excel đã canh giữa cột STT ở DÒNG DỮ LIỆU (xem exportPdf.js/
// exportExcel.js) nhưng web (file này) trước đây KHÔNG có logic riêng cho
// cột 'stt' — merge thêm textAlign:'center' vào style tiêu đề + dữ liệu cột
// này, không đổi gì các cột khác.
function headerStyle(col, baseStyle) {
  if (col.key !== 'stt') return baseStyle;
  return { ...(baseStyle || {}), textAlign: 'center' };
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

// columnSuperGroups (TUỲ CHỌN, bản 9.73 — mirror lib/exportExcel.js/
// lib/exportPdf.js, xem chú thích đầy đủ ở addReportSheet()) = [{label,
// color, groupLabels: [...g.label khớp đúng columnGroups]}] — thêm 1 dòng
// tiêu đề CAO HƠN columnGroups hiện có (vd "Doanh thu" gộp ngang 4 nhóm
// con). Dựng từ `segments` đã có (buildGroupedHeader) — đoạn segment nào
// liên tiếp CÙNG 1 super-group thì gộp lại 1 ô colSpan tổng; đoạn KHÔNG
// thuộc super-group nào (vd "Giá trị hàng hỏng hủy", hoặc cột đơn lẻ như
// "TT"/"Ngành hàng") render 1 ô TRỐNG (không chữ) cùng màu nền của chính
// nhóm/cột đó — rowSpan của ô "single"/"group" gốc GIỮ NGUYÊN (2), KHÔNG
// tự mở rộng lên 3 (HTML rowSpan chỉ mở rộng XUỐNG từ nơi đặt cell, không
// mở lên) — ô trống thêm ở dòng MỚI này đứng PHÍA TRÊN đóng vai trò "merge
// dọc" bằng mắt thường (cùng màu, liền khối), không phải merge cell thật.
function buildSuperHeader(segments, columnSuperGroups) {
  const labelToSuper = new Map();
  for (const sg of columnSuperGroups) {
    for (const gl of sg.groupLabels || []) labelToSuper.set(gl, sg);
  }
  const cells = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.type === 'group') {
      const sg = labelToSuper.get(seg.group.label);
      if (sg) {
        let colSpan = 0;
        while (i < segments.length && segments[i].type === 'group' && labelToSuper.get(segments[i].group.label) === sg) {
          colSpan += segments[i].cols.length;
          i += 1;
        }
        cells.push({ type: 'super', superGroup: sg, colSpan });
        continue;
      }
    }
    cells.push({ type: 'blank', seg, span: seg.type === 'group' ? seg.cols.length : 1 });
    i += 1;
  }
  return cells;
}

// Cột "actions" (quy ước đặt key 'actions' cho cột Sửa/Bật-Tắt/Xoá ở mọi
// trang CRUD phẳng — luôn là cột CUỐI, KHÔNG xuất hiện ở bảng báo cáo có
// columnGroups) ghim CỐ ĐỊNH bên phải khi cuộn ngang (bản 9.05, theo báo cáo
// người dùng: bảng rộng trên điện thoại, cuộn hết cỡ vẫn không thấy nút
// "Sửa"/"Xoá" vì cuộn ngang trên di động khó kéo hết tới cuối) — xem rule
// position:sticky trên .data-table__actions-cell ở styles.css (áp dụng
// ĐỒNG BỘ cả 3 app, xem CLAUDE.md).
function actionsClassName(colKey) {
  return colKey === 'actions' ? 'data-table__actions-cell' : undefined;
}

// selection (TUỲ CHỌN — bản 8.62, kết quả của hook lib/useRowSelection) —
// thêm 1 cột checkbox đầu bảng (cả ô "chọn tất cả" ở header) để chọn nhiều
// dòng rồi xoá hàng loạt; không truyền thì bảng vẽ như cũ, không đổi gì.
// Chỉ dùng cho các bảng quản trị phẳng (Vai trò, Danh mục...) — KHÔNG dùng
// cho báo cáo có columnGroups (không có ý nghĩa "xoá hàng loạt" ở đó).
function selectionColumn(rows, selection) {
  return {
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
  };
}

export default function DataTable({ columns, rows, emptyMessage = 'Không có dữ liệu.', scrollClassName = '', columnGroups = null, columnSuperGroups = null, standaloneColumnColors = null, selection = null, isReport = false }) {
  if (!rows.length) return <p className="empty-message">{emptyMessage}</p>;

  const allColumns = selection ? [selectionColumn(rows, selection), ...columns] : columns;
  const hasGroups = !!(columnGroups && columnGroups.length);
  // flatHeaderStyle (bản 9.42, theo yêu cầu người dùng — "chuyển tất cả báo
  // cáo Mua hàng/Vận hành/Báo cáo tự do/Báo cáo kinh doanh sang màu bản
  // 9.40") — nền xanh navy nhạt cho header bảng PHẲNG (không columnGroups),
  // khớp Excel/PDF (xem lib/exportExcel.js/lib/exportPdf.js). CHỈ áp dụng
  // khi `isReport` (components/ReportBody.jsx — nơi DUY NHẤT render bảng
  // báo cáo, dùng chung cho trang Báo cáo + ô Dashboard — truyền
  // isReport={true}) — các trang CRUD khác (Users/Roles/Danh mục/Audit
  // log/...) gọi DataTable KHÔNG truyền prop này, giữ nguyên bảng trắng
  // như trước, không bị ảnh hưởng.
  const flatHeaderStyle = isReport && !hasGroups ? { background: resolveGroupColor('green') } : undefined;
  const segments = hasGroups ? buildGroupedHeader(allColumns, columnGroups) : null;
  const hasSuperGroups = hasGroups && !!(columnSuperGroups && columnSuperGroups.length);
  const superCells = hasSuperGroups ? buildSuperHeader(segments, columnSuperGroups) : null;
  const tableClassName = segments ? 'data-table data-table--grouped' : 'data-table';
  const zebraFlags = hasGroups ? computeZebraFlags(rows) : rows.map(() => false);

  return (
    <div className={`table-scroll ${scrollClassName}`.trim()}>
      <table className={tableClassName}>
        <thead>
          {segments ? (
            <>
              {hasSuperGroups && (
                <tr className="group-superheader-row">
                  {superCells.map((cell, idx) => {
                    if (cell.type === 'super') {
                      return (
                        <th key={`sg-${idx}`} colSpan={cell.colSpan} style={{ background: resolveGroupColor(cell.superGroup.color), color: '#fff' }}>
                          {cell.superGroup.label}
                        </th>
                      );
                    }
                    const bg = cell.seg.type === 'group'
                      ? resolveGroupColor(cell.seg.group.color)
                      : resolveStandaloneColumnColor(cell.seg.col, standaloneColumnColors);
                    return <th key={`sgblank-${idx}`} colSpan={cell.span} style={bg ? { background: bg } : undefined} />;
                  })}
                </tr>
              )}
              <tr className="group-header-row">
                {segments.map((seg, idx) => {
                  if (seg.type === 'single') {
                    const standaloneColor = resolveStandaloneColumnColor(seg.col, standaloneColumnColors);
                    return <th key={seg.col.key} rowSpan={2} style={headerStyle(seg.col, standaloneColor ? { background: standaloneColor } : undefined)}>{seg.col.label}</th>;
                  }
                  return (
                    <th key={`g-${idx}`} colSpan={seg.cols.length} style={{ background: resolveGroupColor(seg.group.color) }}>
                      {seg.group.label}
                    </th>
                  );
                })}
              </tr>
              <tr className="group-subheader-row">
                {segments.filter(seg => seg.type === 'group').flatMap(seg => seg.cols.map(col => (
                  <th key={col.key} style={{ background: resolveGroupColor(seg.group.color) }}>{col.label}</th>
                )))}
              </tr>
            </>
          ) : (
            <tr>
              {allColumns.map(col => <th key={col.key} className={actionsClassName(col.key)} style={headerStyle(col, flatHeaderStyle)}>{col.label}</th>)}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, i) => (
            row.__isSectionHeader ? (
              // __isSectionHeader (bản 9.68, báo cáo "Doanh thu theo ngành
              // hàng"/"(LDTD)", xem lib/nganhHangBrgRunner.js) — dòng tiêu
              // đề ngang MERGE hết cột (vd "Toàn hệ thống BRG"/"LFL"/"NSO"),
              // theo yêu cầu người dùng ("Khối phải quy ngang... cover all
              // cột theo kiểu merge lại thành 1 dòng") — opt-in qua cờ này,
              // KHÔNG ảnh hưởng bảng nào khác (không set cờ này thì vẽ như
              // cũ, bình thường).
              <tr key={row.id ?? i}>
                <td colSpan={allColumns.length} style={{ background: `#${row.__sectionColor || '2b2f38'}`, color: '#fff', fontWeight: 700, padding: '8px 10px' }}>
                  {row.__sectionLabel}
                </td>
              </tr>
            ) : (
              <tr key={row.id ?? i}>
                {allColumns.map(col => (
                  <td key={col.key} className={actionsClassName(col.key)} style={cellStyle(row, col, columnGroups, zebraFlags[i])}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}
