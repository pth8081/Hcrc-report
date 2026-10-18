# Quy ước bắt buộc cho dự án HCRC-report

## Mọi báo cáo PHẢI có 1 file hướng dẫn triển khai RIÊNG + cập nhật file tổng hợp

**Theo yêu cầu người dùng (bản 9.64, áp dụng cho TOÀN BỘ báo cáo đã có VÀ
MỌI báo cáo làm thêm SAU NÀY — lý do: người dùng cần tự triển khai lại
được nếu CHUYỂN SERVER, không muốn phải lục lại hội thoại cũ).**

Bất kỳ báo cáo mới nào được tạo (1 `ReportId` mới trong `app.ReportCatalog`,
qua `rp-server/scripts/seed*.js`) PHẢI có 1 file `.md` RIÊNG ở gốc repo (vd
`bc-<reportId>.md`, hoặc tên tiếng Việt như các file hiện có —
`báo cáo doanh thu cuối ngày.md`, `bc-don-dat-hang.md`), gồm tối thiểu:
1. Báo cáo này làm gì (nghiệp vụ, công thức tính nếu có điểm dễ hiểu nhầm).
2. Nguồn dữ liệu — VIEW/bảng cần tạo trên CSDL nguồn (SQL đầy đủ nếu có
   VIEW mới; nếu DÙNG CHUNG domain/VIEW với báo cáo khác đã có file riêng
   thì TRỎ THẲNG sang file đó, không chép lại).
3. Các bước triển khai theo ĐÚNG THỨ TỰ (job đồng bộ ETL, script tạo báo
   cáo, gán quyền xem) — đủ chi tiết để 1 người CHƯA biết gì về báo cáo này
   làm theo được, kể cả khi dựng lại trên server hoàn toàn mới.
4. Cách kiểm tra sau khi triển khai xong (báo cáo có đúng số liệu không).

**Đồng thời cập nhật file tổng hợp `hướng_dẫn_báo_cáo.md`** — KHÔNG phải
chép nội dung báo cáo mới vào đó (file đó là tài liệu KIẾN TRÚC/mẫu dùng
chung, không phải danh mục từng báo cáo) — mà cập nhật mục **"Danh mục báo
cáo"** ở cuối file đó (bảng ReportId/Tiêu đề/File hướng dẫn riêng), thêm 1
dòng cho báo cáo mới, trỏ đúng sang file riêng vừa tạo ở trên.

Nếu báo cáo mới KHÔNG có gì đặc thù (dùng lại NGUYÊN domain/VIEW của 1 báo
cáo khác đã có file riêng, chỉ khác cách hiển thị/bộ lọc) — vẫn PHẢI có file
riêng, nhưng được phép NGẮN GỌN, chỉ nêu điểm khác + trỏ sang file gốc cho
phần dùng chung (không bắt buộc viết lại toàn bộ Bước 1/Bước 2 từ đầu).

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

## Trang quản lý "kết nối" (nguồn dữ liệu/đối tác API) PHẢI có nút "Nhân bản" bên cạnh "Sửa"

**Theo yêu cầu người dùng (bản 9.22, áp dụng cho các trang quản lý kết nối
đã có ở bản 9.22 — Nguồn dữ liệu ETL/API/Biểu mẫu, Job đồng bộ, Kết nối
API/đối tác bên ngoài — và MỌI trang "kết nối" tương tự làm thêm SAU NÀY:
username/password/API key có thể giống nhau giữa nhiều bản ghi, chỉ khác
tên).**

Nút "Nhân bản" tạo 1 bản ghi MỚI copy NGUYÊN VẸN mọi cột (kể cả cột bí mật
ĐÃ MÃ HOÁ) từ bản ghi gốc, CHỈ đổi `Name`/`Title` — không giải mã, không
gửi mật khẩu/API key qua request body hay hiện ra trình duyệt lúc nhân
bản (an toàn hơn gõ lại thủ công).

Backend — route riêng `POST /:id/duplicate` (KHÔNG tái dùng `POST /` hay
`PUT /:id`, vì 2 route đó yêu cầu/validate mật khẩu dạng chữ thường qua
body — nhân bản không có và không cần mật khẩu thật):
```js
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name (tên bản sao mới)' });
    const pool = await getPool('...');
    const existing = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT <mọi cột, kể cả *Encrypted/*Hash> FROM ... WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy' });
    const src = existing.recordset[0];
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      /* .input(...src...) từng cột còn lại, giữ NGUYÊN giá trị src.* */
      .query('INSERT INTO ... (Name, ...) OUTPUT INSERTED.Id VALUES (@name, ...)');
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) { next(err); }
});
```

Frontend — mẫu chuẩn (xem thật ở `etl-admin/src/pages/DataSourcesPage.jsx`):
```jsx
const [duplicating, setDuplicating] = useState(null); // { source, newName } đang nhân bản, hoặc null
const [savingDuplicate, setSavingDuplicate] = useState(false);

function openDuplicate(source) {
  setDuplicating({ source, newName: `${source.Name} (bản sao)` });
}
async function saveDuplicate(e) {
  e.preventDefault();
  setSavingDuplicate(true);
  try {
    await api.post(`/data-sources/${duplicating.source.Id}/duplicate`, { name: duplicating.newName });
    setDuplicating(null);
    reload();
  } catch (err) { setError(err.message); } finally { setSavingDuplicate(false); }
}
...
<button type="button" onClick={() => openEdit(s)}>Sửa</button>{' '}
<button type="button" onClick={() => openDuplicate(s)}>Nhân bản</button>{' '}
...
{duplicating && (
  <div className="modal">
    <div className="modal-body">
      <h3>Nhân bản "{duplicating.source.Name}"</h3>
      <form className="stacked-form" onSubmit={saveDuplicate}>
        <input value={duplicating.newName} onChange={(e) => setDuplicating({ ...duplicating, newName: e.target.value })} required autoFocus />
        <div className="inline-actions">
          <button type="submit" disabled={savingDuplicate}>{savingDuplicate ? 'Đang nhân bản...' : 'Tạo bản sao'}</button>
          <button type="button" onClick={() => setDuplicating(null)}>Huỷ</button>
        </div>
      </form>
    </div>
  </div>
)}
```

Lưu ý quan trọng:
- Nút "Tạo bản sao" PHẢI theo đúng quy ước khoá nút ở mục đầu (`savingDuplicate` + `disabled` + "Đang nhân bản...").
- Chỉ hiện nút "Nhân bản" cho người có quyền sửa (gộp cùng điều kiện
  `isAdmin`/`canEdit(...)` đã dùng cho nút "Sửa" của đúng trang đó).
- Nếu bản ghi là 1 JOB/TÁC VỤ CÓ THỂ TỰ CHẠY (vd Sync Job, cron) — job mới
  tạo PHẢI ở trạng thái TẮT (hardcode `IsActive = 0` trong INSERT, không
  copy từ src) để tránh 2 job giống nhau chạy trùng ngay sau khi nhân bản;
  admin tự bật lại sau khi kiểm tra/chỉnh đúng ý (xem
  `etl/routes/admin/syncJobs.js`).
- **NGOẠI LỆ BẮT BUỘC — bản ghi là ĐỐI TÁC/CONSUMER CÓ BÍ MẬT DÙNG XÁC THỰC
  LẪN NHAU** (vd `api.ApiConsumers` — "Đối tác API"): KHÔNG BAO GIỜ copy
  `ApiKeyHash`/`ClientSecretHash`/`HmacSecretEncrypted` — 2 đối tác dùng
  chung 1 bí mật là lỗ hổng bảo mật (đối tác A có thể giả danh đối tác B).
  Route `/duplicate` cho loại này PHẢI luân chuyển bí mật — chạy lại ĐÚNG
  logic sinh bí mật mới của route tạo (`POST /`)/luân chuyển (`POST
  /:id/rotate`), rồi trả về bí mật mới MỘT LẦN trong response (giống cơ chế
  "hiện bí mật 1 lần" đã có) để frontend hiện banner `RevealedCredentials`
  — xem `api-server/routes/admin/consumers.js` và
  `api-admin/src/pages/ConsumersPage.jsx`.

**Lý do**: nhiều kết nối/đối tác có cấu hình giống nhau gần như hoàn toàn
(cùng server/database/username/password, hoặc cùng cách xác thực) — gõ lại
thủ công vừa chậm vừa dễ gõ sai mật khẩu, mà hiện mật khẩu ra để copy thì
lộ bí mật qua màn hình/trình duyệt không cần thiết.
