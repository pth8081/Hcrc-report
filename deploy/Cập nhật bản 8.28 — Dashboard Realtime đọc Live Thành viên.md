# Hướng dẫn cập nhật hệ thống lên bản 8.28

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.28 trong mã nguồn nếu cần biết chi
tiết).

**File này gộp luôn thứ tự chạy từ bản 8.26 → 8.28** (theo yêu cầu người
dùng) — nếu máy chủ ĐÃ cập nhật xong 1-2 bản trước đó rồi thì bỏ qua đúng
bước đã làm, chỉ cần đảm bảo KHÔNG bỏ sót bước nào theo đúng THỨ TỰ dưới
đây (thứ tự quan trọng — làm sai thứ tự có thể khiến báo cáo tạm thiếu dữ
liệu, dù không hỏng gì vĩnh viễn).

---

## Bước 0 — Lấy code mới nhất (chỉ cần làm 1 lần cho cả 3 bản)

```bash
git pull origin main
```

---

## Bản 8.26 — Sửa lỗi "hôm nay" tính theo giờ UTC

```bash
cd rp-user && npm run build && cd ..
```
Copy `dist/` mới vào đúng chỗ Nginx/`serve-static.js` đang trỏ tới.
```bash
pm2 restart rp-server
```

---

## Bản 8.27 — Bỏ đồng bộ lặp lại "Cùng kỳ năm trước" cho báo cáo (Thành viên)

**Thứ tự bắt buộc — làm Bước A trước Bước B**:

**A.** Cập nhật lại 4 báo cáo (để 2 báo cáo "(Thành viên)" đổi sang đọc
"Cùng kỳ năm trước" từ domain gốc):
```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js
cd ..
```

**B.** Tắt 2 Sync Job không còn cần thiết:
```bash
cd etl
node scripts/disableThanhVienHistorySync.js            # xem trước
node scripts/disableThanhVienHistorySync.js --confirm   # thực sự tắt
cd ..
```

---

## Bản 8.28 — Dashboard "Realtime" đọc Live Thành viên

**Thứ tự bắt buộc — làm đủ 3 bước A/B/C, ĐÚNG THỨ TỰ, trước khi đổi Bước D**
(đổi Bước D trước khi A/B/C xong sẽ khiến 4 Ô Realtime hiện trống/thiếu chi
nhánh — không hỏng gì, chỉ cần làm đúng thứ tự để khỏi phải giải thích lại
với người dùng cuối):

**A. Tạo VIEW tại MỖI trong 35 siêu thị** (làm 1 lần/siêu thị, IT tại từng
nơi hoặc người có quyền truy cập tất cả) — xem nguyên văn 2 câu
`CREATE OR ALTER VIEW` trong "báo cáo doanh thu thành viên.md" mục "Bước 1"
(hoặc hỏi lại nếu cần gửi riêng). Kiểm tra: mỗi CSDL `DSMART16` tại từng
siêu thị có đủ `V_HCRC_DOANHTHU_CHINHANH` + `V_HCRC_GIAODICH_CHINHANH`.

**B. Tạo 35 Nguồn dữ liệu + 70 Sync Job Live** (1 lần, trên máy chủ report-
system, SAU khi ĐỦ 35 siêu thị xong Bước A — có thể chạy lại nhiều lần nếu
vài siêu thị chưa xong kịp, script tự bỏ qua + báo rõ):
```bash
cd etl
# Mở scripts/seedThanhVienLiveSync.js, điền đúng 35 dòng STORES (name/server/password)
node scripts/seedThanhVienLiveSync.js
cd ..
```
Kiểm tra etl-admin → Đồng bộ: đủ 70 job "...(TV) - \<tên siêu thị\>", trạng
thái Bật, "Lượt chạy gần nhất" có SUCCESS gần đây (chạy mỗi 2 phút).

**C. Xác nhận có dữ liệu thật** — chờ vài phút cho job Live chạy, thử mở
thẳng báo cáo "Báo cáo doanh thu cuối ngày HCRC (Thành viên)" (menu Báo
cáo, KHÔNG qua Dashboard), xem cột "Thực đạt" đã ra số cho các siêu thị đã
xong Bước A/B chưa.

**D. Trỏ Dashboard "Realtime" sang báo cáo Thành viên** (CHỈ làm sau khi A/B/C
đã ổn — xem Bước A/B/C ở trên):
```bash
cd rp-server
node scripts/seedTop5ChiNhanhReports.js
cd ..
```

---

## Kiểm tra sau cùng (sau khi đã làm đủ cả 3 bản)

- [ ] Dashboard: nút "Hôm nay"/ngày mặc định đúng lịch Việt Nam (bản 8.26).
- [ ] Báo cáo HCRC/LDTD (Thành viên): "Cùng kỳ năm 2025" vẫn có số bình
      thường (bản 8.27); etl-admin: 2 job "(Thành viên) - Lịch sử" đã Tắt.
- [ ] Dashboard → tab "Realtime Theo ngày": tiêu đề đổi thành "Doanh thu
      Realtime HCRC (Thành viên)", số liệu các siêu thị đã thiết lập Bước A/B
      hiện đúng, cập nhật theo chu kỳ 2 phút của job Live (nhanh hơn hẳn bản
      cũ 15 phút) — siêu thị NÀO CHƯA xong Bước A/B sẽ KHÔNG hiện trong bảng
      (đúng hành vi `requireTargetMatch`/thiếu dữ liệu Live, không phải lỗi).

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
