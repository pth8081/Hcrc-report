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
