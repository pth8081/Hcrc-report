# Hướng dẫn cập nhật hệ thống lên bản 8.27

Gửi IT/DBA thực hiện đúng theo thứ tự bên dưới. File này CHỈ nói về việc
**đưa code đã có sẵn trong Git lên máy chủ đang chạy thật** — không giải
thích tính năng (xem `VERSION.md` mục 8.27 trong mã nguồn nếu cần biết chi
tiết).

Đợt này bỏ việc đồng bộ LẶP LẠI "Cùng kỳ năm trước" cho 2 báo cáo "(Thành
viên)" — 2 Sync Job tương ứng không còn cần thiết, có thể tắt để đỡ tốn tài
nguyên. **KHÔNG đụng tới phần Live (70 Sync Job từng cửa hàng)** — vẫn chạy
bình thường.

**Đã XÁC NHẬN không đổi cấu trúc CSDL nào ở đợt này** — KHÔNG cần chạy lại
file `schema.sql` nào.

---

## Bước 1 — Lấy code mới nhất

```bash
git pull origin main
```

---

## Bước 2 — Cập nhật lại 2 báo cáo "(Thành viên)" (BẮT BUỘC, làm TRƯỚC bước 3)

```bash
cd rp-server
node scripts/seedLdtdHcrcReports.js
cd ..
```

An toàn chạy lại nhiều lần (khớp theo `ReportId` để UPDATE). Sau bước này,
2 báo cáo "Báo cáo doanh thu cuối ngày HCRC/LDTD (Thành viên)" đọc "Cùng kỳ
năm trước" thẳng từ domain gốc — không cần `pm2 restart` gì (rp-server đọc
`DefinitionJson` từ CSDL mỗi lượt chạy báo cáo, không cache).

---

## Bước 3 — Tắt 2 Sync Job không còn cần thiết (SAU bước 2)

```bash
cd etl
node scripts/disableThanhVienHistorySync.js            # xem trước — chỉ liệt kê, KHÔNG tắt
node scripts/disableThanhVienHistorySync.js --confirm   # thực sự tắt (IsActive = 0)
cd ..
```

Không cần restart tiến trình ETL — scheduler tự nạp lại trạng thái `IsActive`
trong tối đa 60 giây (xem `etl/jobs/scheduler.js`).

---

## Bước 4 — Kiểm tra sau khi cập nhật

- [ ] Mở báo cáo "Báo cáo doanh thu cuối ngày HCRC (Thành viên)" (hoặc
      LDTD), chế độ "Đầy đủ (kèm Cùng kỳ năm trước)" — cột "Cùng kỳ năm
      2025"/"Tỷ lệ % LFL" vẫn hiện số bình thường (không trống, không đổi
      khác bản gốc).
- [ ] etl-admin → Đồng bộ: 2 job "Doanh thu/Giao dịch chi nhánh (Thành
      viên) - Lịch sử (DSMART16_EOM)" hiện trạng thái **Tắt**.
- [ ] 70 job "...(TV) - \<tên cửa hàng\>" (phần Live) vẫn **Bật**, chạy bình
      thường như trước — không bị ảnh hưởng.

Có mục nào không đúng như trên, báo lại người phụ trách để kiểm tra tiếp.
