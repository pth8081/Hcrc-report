# Quy ước bắt buộc cho dự án HCRC-report

## Mọi nút bấm gửi dữ liệu lên server PHẢI tự khoá + đổi màu lúc đang xử lý

**Theo yêu cầu người dùng (bản 8.60, áp dụng cho TOÀN BỘ hệ thống — rp-user
("report"), etl-admin, api-admin — và MỌI tính năng làm thêm SAU NÀY, không
chỉ các nút đã sửa ở bản 8.60).**

Bất kỳ nút bấm nào gọi `api.post`/`api.put`/`api.del` (hoặc `api.get` khi
đó là hành động người dùng chủ động bấm, vd "Lọc"/"Chạy"/"Kiểm tra" — khác
`useEffect` tải dữ liệu nền) đều PHẢI:

1. Có 1 biến trạng thái `useState` (boolean cho nút đơn, hoặc theo ID dòng
   nếu là nút lặp lại trong bảng — xem bên dưới) đặt `true` NGAY TRƯỚC khi
   gọi `await api....` và đặt lại `false` trong khối `finally` (LUÔN chạy,
   kể cả khi lỗi — thiếu `finally` sẽ khoá nút VĨNH VIỄN nếu request lỗi).
2. Gắn `disabled={biến_trạng_thái}` vào đúng nút đó (gộp thêm `||` với điều
   kiện `disabled` đã có sẵn, không xoá điều kiện cũ).
3. Đổi CHỮ hiển thị trên nút sang dạng "Đang ..." đúng động từ của hành
   động đó trong lúc `biến_trạng_thái === true` (Lưu→"Đang lưu...",
   Xoá→"Đang xoá...", Tạo→"Đang tạo...", Nhập→"Đang nhập...",
   Chạy/Chạy thử→"Đang chạy...", Kiểm tra→"Đang kiểm tra...").

Mẫu chuẩn (nút đơn — xem thật ở `etl-admin/src/pages/ConnectionStatusPage.jsx`,
`rp-user/src/modules/system/report-catalog/ReportCatalogPanel.jsx`):

```jsx
const [saving, setSaving] = useState(false);
async function handleSave() {
  setSaving(true);
  try {
    await api.post('/something', payload);
  } catch (err) {
    setError(err.message);
  } finally {
    setSaving(false);
  }
}
...
<button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
```

Mẫu cho bảng (1 nút/dòng, vd "Xoá"/"Chạy thử" mỗi dòng) — dùng ID dòng
đang xử lý, KHÔNG dùng 1 boolean chung (sẽ khoá nhầm MỌI dòng khác trong
khi chỉ 1 dòng đang xử lý):

```jsx
const [runningId, setRunningId] = useState(null);
async function runNow(item) {
  setRunningId(item.Id);
  try {
    await api.post(`/things/${item.Id}/run-now`);
  } finally {
    setRunningId(null);
  }
}
...
<button onClick={() => runNow(it)} disabled={runningId === it.Id}>
  {runningId === it.Id ? 'Đang chạy...' : 'Chạy thử'}
</button>
```
Nếu 1 dòng có NHIỀU nút hành động khác nhau (vd "Chạy thử" + "Kiểm tra
schema" + "Xoá" trên cùng 1 dòng), mỗi hành động dùng 1 biến ID riêng
(`runningId`/`checkingId`/`deletingId`) — bấm "Chạy thử" ở dòng A không
được khoá nhầm nút "Xoá" ở CHÍNH dòng A hay bất kỳ nút nào ở dòng khác.

CSS đã có sẵn rule `button:disabled` (nền xám, chữ xám, con trỏ
`not-allowed`) ở cả 3 file `styles.css` (etl-admin/api-admin/rp-user) —
chỉ cần gắn đúng `disabled={...}`, KHÔNG cần thêm CSS riêng cho từng nút.

**Lý do**: tránh người dùng bấm lại nhiều lần liên tiếp khi chưa thấy phản
hồi rõ ràng, gây gửi trùng nhiều yêu cầu lên server cùng lúc (vd tạo trùng
nhiều job đồng bộ, chạy trùng nhiều lượt xuất Excel/PDF).

## Mọi bảng có nút "Xoá" từng dòng PHẢI có checkbox chọn nhiều + nút xoá hàng loạt

**Theo yêu cầu người dùng (bản 8.62, áp dụng cho TOÀN BỘ hệ thống — rp-user,
etl-admin, api-admin — và MỌI bảng làm thêm SAU NÀY có nút "Xoá" từng dòng,
không chỉ các bảng đã sửa ở bản 8.62).**

Hạ tầng dùng chung đã có sẵn, KHÔNG viết lại logic chọn dòng từ đầu:
- `src/lib/useRowSelection.js` (có ở cả 3 app) — hook quản lý tập ID đang
  chọn (`selectedIds`, `toggle`, `toggleAll`, `isSelected`, `clear`).
- `src/components/DataTable.jsx` (có ở cả 3 app) — nhận thêm prop tuỳ chọn
  `selection` (= kết quả `useRowSelection()`), tự vẽ cột checkbox đầu bảng
  (gồm checkbox "chọn tất cả" ở header) khi được truyền; không truyền thì
  bảng vẽ như cũ, không ảnh hưởng bảng khác.

Mẫu chuẩn — xem thật ở `etl-admin/src/pages/SyncJobsPage.jsx` (có cả
trường hợp khó: view nhóm theo siêu thị với NHIỀU `<DataTable>` cùng chia
sẻ 1 `selection`):

```jsx
import { useRowSelection } from '../lib/useRowSelection';
...
const selection = useRowSelection(); // mặc định lấy row.Id — truyền getId riêng nếu khoá khác (vd row.ReportId, row.Endpoint)
const [bulkDeleting, setBulkDeleting] = useState(false);

async function deleteSelected() {
  if (selection.selectedIds.size === 0) return;
  if (!confirm(`Xoá ${selection.selectedIds.size} mục đã chọn?`)) return;
  setBulkDeleting(true);
  try {
    for (const id of selection.selectedIds) {
      await api.del(`/things/${id}`); // gọi LẶP LẠI đúng API xoá 1 dòng đã có — không viết API "xoá theo danh sách" riêng
    }
    selection.clear();
    reload();
  } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
}
...
<DataTable columns={columns} rows={rows} selection={isAdmin ? selection : null} />

{isAdmin && selection.selectedIds.size > 0 && (
  <div className="inline-actions">
    <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
      {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
    </button>
  </div>
)}
```

Lưu ý:
- Nút "Xoá N mục đã chọn" PHẢI theo đúng quy ước khoá nút ở mục trên
  (`bulkDeleting` + `disabled` + đổi chữ "Đang xoá...").
- Chỉ hiện checkbox/nút xoá hàng loạt cho người có quyền sửa/xoá (gộp cùng
  điều kiện `isAdmin`/`canEdit(...)` đã dùng cho nút "Xoá" từng dòng của
  đúng trang đó — không hiện cho người chỉ xem).
- `getId` truyền vào `useRowSelection` phải khớp ĐÚNG field dùng trong URL
  xoá 1 dòng hiện có của trang đó (phần lớn là `Id`, nhưng có trang dùng
  `ReportId`/`DashboardId`/`Endpoint`...).
- Bảng báo cáo có `columnGroups` (tiêu đề 2 dòng, xem rp-user DataTable) —
  KHÔNG áp dụng chọn nhiều/xoá hàng loạt (không có khái niệm "xoá 1 dòng
  báo cáo"), chỉ áp dụng cho bảng quản trị CRUD phẳng.

**Lý do**: trước đây muốn xoá nhiều dòng phải bấm "Xoá" + xác nhận từng
dòng một — chậm và dễ bỏ sót khi cần dọn nhiều (vd nhiều siêu thị/job
đồng bộ cùng lúc).
