# Hướng dẫn cập nhật hệ thống lên bản 8.43

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.43 trong mã nguồn nếu cần biết chi
tiết).

**Có bảng CSDL mới** — cần chạy lại `schema.sql`. **KHÔNG ảnh hưởng tới
vai trò đang chạy**: chưa cấp quyền nhóm nào thì vai trò đó mặc định
KHÔNG thấy tile có nhóm (xem Bước 3, BẮT BUỘC cấp lại quyền sau khi
deploy, không tự động "vẫn như cũ").

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Chạy lại schema.sql

```bash
cd rp-db
# Chạy đúng cách đang dùng để áp schema.sql vào CSDL HCRC_RP — file tự
# kiểm tra IF OBJECT_ID(...) IS NULL, an toàn chạy lại nhiều lần.
```

---

## Bước 3 — Build lại + restart, RỒI CẤP LẠI QUYỀN NHÓM cho từng vai trò

```bash
cd rp-user && npm run build && cd ..
pm2 restart hcrc-rp-server
```

**QUAN TRỌNG**: sau bước này, MỌI vai trò (trừ Admin hệ thống) sẽ KHÔNG
còn thấy 2 nhóm "Top 5 chi nhánh"/"Realtime" trên Dashboard nữa (vì chưa
có dòng quyền nào trong bảng mới — mặc định từ chối, giống đúng cách
`RoleReportAccess`/`RoleDomainAccess` đã hoạt động từ trước). Đăng nhập
bằng tài khoản Admin hệ thống → "Hệ thống → Phân quyền" → với TỪNG vai trò
đang dùng Dashboard → "Gán quyền" → tick lại đúng nhóm cần cấp ("Xem
dashboard", thêm "Xem chi tiết" nếu cần xuất Excel/PDF) → Lưu.

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] "Hệ thống → Phân quyền" → "Gán quyền" 1 vai trò → thấy mục "Dashboard
      được xem (theo nhóm)" với 2 dòng (Top 5 chi nhánh, Realtime), mỗi
      dòng 2 checkbox.
- [ ] Vai trò CHƯA được cấp quyền nhóm nào → đăng nhập bằng tài khoản vai
      trò đó → vào Dashboard → KHÔNG thấy nhóm nào (hoặc trống trơn nếu
      dashboard chỉ có tile thuộc nhóm).
- [ ] Cấp "Xem dashboard" cho nhóm "Top 5 chi nhánh" (KHÔNG cấp "Xem chi
      tiết") → đăng nhập lại → thấy đúng nhóm đó, nhưng bấm "Xuất Excel/
      PDF" bị từ chối (403).
- [ ] Cấp thêm "Xem chi tiết" → đăng nhập lại → xuất Excel/PDF được bình
      thường.
- [ ] Tài khoản Admin hệ thống → luôn thấy hết mọi nhóm, xuất được bình
      thường, không bị ảnh hưởng gì bởi bản này.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
