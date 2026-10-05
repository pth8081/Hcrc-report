# Cập nhật bản 8.84 — Dropdown "Chọn nhóm" thay thẻ lưới ở trang Dashboard (rp-user)

## Yêu cầu của người dùng

Gửi 2 ảnh chụp:
- Trang "Báo cáo" — dùng dropdown "Chọn báo cáo" để chuyển qua lại giữa
  các báo cáo.
- Trang "Dashboard" — dùng thẻ lưới (2 thẻ "🏆 Top 5 chi nhánh"/"⚡
  Realtime") để chọn nhóm.

Kèm lời nhắn: "tôi muốn làm chọn dạng droplist như Module Báo cáo để sau
này nhiều nhóm Dashboard sẽ gọn hơn, bạn nghiên cứu và gửi demo cho mình
nhé."

## Đã làm

### 1. Nghiên cứu trước khi đổi

- Nhóm Dashboard KHÔNG có bảng CSDL riêng — được suy ra ở client từ
  `tile.group`/`tile.groupLabel`/`tile.groupIcon` trong
  `dashboard.tiles[]` (toàn bộ dashboard tải 1 lần qua
  `GET /api/dashboards/:id`), nên đổi WIDGET chọn nhóm không đụng gì tới
  dữ liệu hay API.
- `selectGroup(groupKey)` (hàm có sẵn, dùng chung bởi cả thẻ lưới cũ và
  dropdown mới) vẫn ghi `lastGroup` vào
  `app.UserDashboardPreferences` (bản 8.45/8.46) — nhớ đúng nhóm lần mở
  trước, không đổi hành vi.
- Phân quyền 2 cấp `RoleReportAccess`/`RoleDashboardGroupAccess` (bản
  8.42/8.43) lọc tile Ở SERVER trước khi về client — đổi UI chọn nhóm
  không thể ảnh hưởng tới việc ai xem được gì.
- Trang "Báo cáo" đã có sẵn class `.report-picker` cho dropdown "Chọn
  báo cáo" — dùng lại ĐÚNG class này cho dropdown "Chọn nhóm" mới, không
  cần viết CSS riêng, đồng bộ hình thức với Module Báo cáo.

### 2. Code

`rp-user/src/modules/dashboard/DashboardPage.jsx` — thay khối thẻ lưới
`.dashboard-group-grid` bằng:

```jsx
{groups.length > 1 && (
  <label className="report-picker">
    <span>Chọn nhóm</span>
    <select value={activeGroup} onChange={(e) => selectGroup(e.target.value)}>
      {groups.map(g => (
        <option key={g.key} value={g.key}>{g.icon ? `${g.icon} ` : ''}{g.label} ({g.count} ô)</option>
      ))}
    </select>
  </label>
)}
```

`rp-user/src/styles.css` — xoá các rule CSS chết của thẻ lưới cũ
(`.dashboard-group-grid`, `.dashboard-group-card`,
`.dashboard-group-card.active`, `.dashboard-group-card-icon/-label/-count`)
— đã kiểm tra không còn nơi nào dùng. **Không đụng**
`.dashboard-group`/`.dashboard-group-title` (khác tầng — tiêu đề nhóm
Mart/Minimart BÊN TRONG 1 nhóm Dashboard đã chọn, không phải bộ chọn
nhóm).

### 3. Đã gửi demo trước khi chốt

Theo đúng yêu cầu "gửi demo cho mình nhé" — build + chạy thật, chụp ảnh
Playwright với ĐÚNG 2 nhóm/tên/số ô trong ảnh người dùng gửi ("🏆 Top 5
chi nhánh" 16 ô, "⚡ Realtime" 4 ô), gửi 2 ảnh demo (dropdown đang chọn
từng nhóm, danh sách ô đổi đúng theo). Người dùng duyệt ("Đẹp rồi, bạn
chốt luôn đi") rồi mới merge.

## Đã kiểm chứng

- Build `rp-user && npx vite build` sạch.
- Demo Playwright (mock `/api/me`, `/api/dashboards`, `/api/dashboards/1`,
  `/api/dashboards/1/preferences`, `/api/reports/*`): mặc định hiện đúng
  nhóm đầu "🏆 Top 5 chi nhánh (16 ô)" kèm 16 ô; chọn "⚡ Realtime (4 ô)"
  từ dropdown → đúng 4 ô hiện ra (xác nhận logic lọc tile theo nhóm vẫn
  đúng). Không tràn ngang (`scrollWidth - clientWidth = 0`).

## Các bước triển khai

1. `git pull origin main`.
2. `cd rp-user && npm run build`, copy `dist/` mới (chỉ frontend, KHÔNG
   cần restart `hcrc-rp-server`).
3. Kiểm tra: trang Dashboard (dashboard có ≥ 2 nhóm) → thấy dropdown
   "Chọn nhóm" thay thẻ lưới cũ → chọn nhóm khác → danh sách ô đổi đúng
   theo nhóm vừa chọn.

## File thay đổi

- `rp-user/src/modules/dashboard/DashboardPage.jsx` — đổi widget chọn
  nhóm từ thẻ lưới sang dropdown.
- `rp-user/src/styles.css` — xoá CSS chết của thẻ lưới cũ.
