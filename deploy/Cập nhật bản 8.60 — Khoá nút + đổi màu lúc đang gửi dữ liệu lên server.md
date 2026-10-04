# Cập nhật bản 8.60 — Khoá nút + đổi màu lúc đang gửi dữ liệu lên server

## Vấn đề

Khi kiểm tra nút "Chạy thử" (trang Đồng bộ, etl-admin), người dùng nhận
thấy nút không phản ứng rõ ràng lúc bấm — lo ngại trường hợp người dùng
bấm lại nhiều lần liên tiếp trước khi yêu cầu trước xong, gây gửi trùng
nhiều yêu cầu lên server cùng lúc (vd chạy trùng nhiều lượt đồng bộ, tạo
trùng nhiều job/báo cáo).

Yêu cầu: mọi nút bấm gửi dữ liệu lên server phải **tự khoá (không bấm lại
được) + đổi màu rõ rệt** trong lúc đang xử lý, cho tới khi xong — áp dụng
cho **toàn bộ hệ thống** (rp-user "report", etl-admin "ETL", api-admin
"API"), và trở thành **quy tắc bắt buộc cho mọi nút làm thêm sau này**
(không chỉ các nút sửa ở bản này).

## Khảo sát hiện trạng

Trước khi sửa, rà soát toàn bộ 3 giao diện phát hiện:

1. Nút "Chạy thử" (và hầu hết nút khác trên cùng trang) **hoàn toàn không
   có** cờ khoá — bấm bao nhiêu lần gửi bấy nhiêu request.
2. Một vài trang ĐÃ làm đúng từ trước (`ConnectionStatusPage.jsx` — bản
   8.57, `ReportCatalogPanel.jsx`'s nút "Chạy thử" riêng) — dùng
   `useState` + `disabled={đang_xử_lý}` + đổi chữ "Đang...". Đây là mẫu
   chuẩn để nhân rộng, không phát minh pattern mới.
3. **Nguyên nhân "phản ứng yếu" dù ĐÃ có `disabled` ở vài nơi**: cả 3 file
   `styles.css` không hề có rule `button:disabled` — nút khoá vẫn hiện
   y hệt màu accent đậm bình thường, chỉ khác con trỏ chuột không bấm
   được, mắt thường khó nhận ra.
4. Không có component `<Button>` dùng chung — mỗi trang tự viết tay
   `useState` + JSX nút riêng, không ai ép buộc nút mới phải theo đúng mẫu.

## Thay đổi

### 1. CSS (`etl-admin/src/styles.css`, `api-admin/src/styles.css`, `rp-user/src/styles.css`)

Thêm 1 rule chung ngay sau `button:hover` hiện có:

```css
button:disabled, button:disabled:hover {
  background: var(--line); border-color: var(--line); color: var(--ink-soft);
  opacity: 1; cursor: not-allowed;
}
```

Từ nay MỌI nút có `disabled={...}` (cũ lẫn mới) tự động hiện xám rõ rệt,
không cần style riêng cho từng nút.

### 2. Rà soát + sửa 43 file JSX (mọi nút gọi `api.get/post/put/del` lúc bấm)

Mẫu áp dụng (nút đơn):
```jsx
const [saving, setSaving] = useState(false);
async function handleSave() {
  setSaving(true);
  try {
    await api.post('/something', payload);
  } catch (err) {
    setError(err.message);
  } finally {
    setSaving(false); // LUÔN xoá, kể cả lỗi
  }
}
...
<button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
```

Mẫu áp dụng (nút lặp trong bảng — 1 nút/dòng, vd "Xoá"/"Chạy thử"):
dùng **ID dòng đang xử lý**, không dùng 1 cờ `boolean` chung (sẽ khoá
nhầm MỌI dòng khác trong khi chỉ 1 dòng đang xử lý). 1 dòng có nhiều nút
hành động khác nhau thì mỗi hành động dùng 1 biến ID riêng.

**etl-admin** (7 file): `SyncJobsPage.jsx` (file gốc phát hiện vấn đề —
"Chạy thử"/"Kiểm tra schema"/"Bật-Tắt"/"Xoá"/"Tạo"/"Nhập Excel"/"Tải file
mẫu"), `DataSourcesPage.jsx`, `DiemStkMappingPage.jsx`,
`CoreItemListPage.jsx`, `RolesPage.jsx`, `SalesTargetsPage.jsx`,
`UsersPage.jsx`. (`ConnectionStatusPage.jsx`/`SchemaMonitorPage.jsx`/
`AccountPage.jsx` đã đúng từ trước, chỉ xác nhận lại.)

**api-admin** (7 file): `ConsumersPage.jsx`, `AdminUsersPage.jsx`,
`DataSourcesPage.jsx`, `RealtimeEndpointsPage.jsx`,
`RealtimeWriteEndpointsPage.jsx`, `ReportCatalogPage.jsx`, `RolesPage.jsx`.
(`ConnectionStatusPage.jsx`/`VoucherSettingsPage.jsx`/`AccountPage.jsx` đã
đúng từ trước.)

**rp-user** (20 file): `DepartmentStoreMappingPage.jsx`,
`permissions/UsersPage.jsx`, `permissions/RolesPage.jsx`,
`HcrcWorkspaceSettingsPage.jsx`, `DashboardPage.jsx`, `AdhocReportPage.jsx`
(+ `FilterForm.jsx`/`ReportsPage.jsx` dùng chung nút "Lọc"/"Xuất"),
`ReportCatalogPanel.jsx`, `DashboardsPanel.jsx`, `DataSourcesPanel.jsx`,
`ExternalConnectionsPanel.jsx`, `ApiConnectionsPanel.jsx`,
`AnomalyAlertsPage.jsx`, `CategoriesPage.jsx`, `EmailSchedulesPage.jsx`,
`EmailSettingsPage.jsx`. (`AccountPage.jsx` đã đúng phần lớn — vá thêm 1
chỗ sót: nút gỡ thiết bị vân tay/khuôn mặt WebAuthn.)

**Cố ý KHÔNG đụng tới**: nút điều hướng/chuyển tab/mở-đóng modal thuần
client-side (không gọi server trong chính handler), và vài thao tác
"fire-and-forget" không `await` (vd kéo-thả sắp xếp lại Ô Dashboard) — các
thao tác này lặp lại nhiều lần là hợp lệ theo đúng thiết kế, ép khoá vào
sẽ phá UX bình thường.

### 3. `CLAUDE.md` (mới, gốc repo)

Ghi lại quy tắc trên thành quy ước bắt buộc — Claude Code (và bất kỳ ai
đọc) tự động áp dụng cho MỌI nút thao tác gửi dữ liệu lên server làm
**sau này**, không chỉ các nút đã sửa ở bản 8.60.

## Đã kiểm tra

- `npm run build` sạch cho cả 3 giao diện (etl-admin/api-admin/rp-user),
  không lỗi cú pháp/biên dịch.
- Demo thật bằng mock server + Playwright: bấm "Chạy thử" ở 1 dòng trong
  trang Đồng bộ → đúng nút đó chuyển xám + hiện "Đang chạy..." ngay, các
  nút khác CÙNG dòng ("Kiểm tra schema"/"Tắt"/"Xoá") và nút "Chạy thử" ở
  DÒNG KHÁC vẫn hoạt động bình thường (đúng thiết kế theo-từng-dòng,
  không khoá nhầm cả bảng); sau khi server trả lời, nút tự trở lại bình
  thường (xác nhận `finally` hoạt động đúng).

## Các bước triển khai

1. `git pull origin main`.
2. `cd etl-admin && npm run build`, copy `dist/` mới.
3. `cd api-admin && npm run build`, copy `dist/` mới.
4. `cd rp-user && npm run build`, copy `dist/` mới.
5. Không cần restart backend nào (`hcrc-etl`/`hcrc-api-server`/
   `hcrc-rp-server` không đổi) — thuần sửa frontend.
6. Kiểm tra: vào etl-admin → Đồng bộ, bấm "Chạy thử" 1 job → nút chuyển
   xám + hiện "Đang chạy..." ngay, không bấm lại được tới khi xong; thử
   tương tự ở vài trang khác (vd rp-user → Hệ thống → Phân quyền, bấm
   "Lưu").

Không đổi backend/API nào, không đổi cấu trúc CSDL.
