# Hướng dẫn triển khai gộp — bản 9.69 đến 9.70 (làm 1 lần)

**Mục đích**: gộp các bước triển khai từ bản 9.69 tới bản 9.70 hiện tại
thành **1 lượt làm duy nhất**, cho server đang chạy bản 9.68 và cần bắt
kịp bản mới nhất (xem `deploy/Hướng dẫn triển khai gộp — bản 9.59 đến
9.68.md` nếu server còn đang ở bản 9.58 hoặc cũ hơn — 2 bản này KHÔNG lặp
lại nội dung đó).

Cả 2 bản đều KHÔNG đổi schema CSDL, KHÔNG đổi file `.env`/biến môi
trường, KHÔNG cần gán lại quyền xem/sửa nào.

---

## Tóm tắt những gì thay đổi (9.69 → 9.70)

| Bản | Nội dung |
|---|---|
| 9.69 | Đổi phông chữ báo cáo sang **Inter** ở CẢ 3 nơi (web rp-user, Excel, PDF) — theo yêu cầu người dùng, đã demo 4 lựa chọn qua Artifact trước khi chọn. Tự lưu trữ (không gọi ra internet lúc chạy). |
| 9.70 | Sửa lỗi THẬT: cột "Siêu thị/Cửa hàng" ở báo cáo `bc-doanh-thu-ldtd`/`bc-doanh-thu-hcrc`/`bc-top5-chi-nhanh` hiện **mã Điểm thô thay vì tên** khi siêu thị đó CHƯA có dòng doanh thu trong ngày (vd đang kiểm kê, chưa bắt đầu bán) — `remapRowsToDiem()` trước đây bỏ qua hẳn mã Điểm này, nay vẫn gán đúng tên/`LoaiChuoi` (dữ liệu tĩnh), cột doanh thu vẫn hiện trống như cũ. |

Xem đầy đủ lý do/chi tiết kỹ thuật ở `VERSION.md` (mục "9.69"/"9.70") và
`deploy/Nhật ký triển khai (từ bản 8.31).md`.

---

## A. Code — lấy về 1 lần

```bash
git pull origin main
```

---

## B. Các bước triển khai (gộp cả 2 bản, theo đúng thứ tự)

**LƯU Ý server KHÔNG có internet** (theo cách làm hiện tại: MỞ internet
tạm thời trên máy chủ, cài gói xong rồi ĐÓNG lại) — **bước 2 dưới đây là
bước DUY NHẤT cần internet** (tải gói npm mới của bản 9.69), mọi bước
còn lại không cần mạng ngoài. Phông Inter TỰ ĐÓNG GÓI vào bundle/file
xuất — không có dependency nào gọi ra internet lúc chạy sau khi cài
xong.

1. `git pull origin main` (đã làm ở mục A).
2. **MỞ internet tạm thời trên máy chủ**, rồi chạy:
   ```bash
   cd rp-user && npm install
   cd ../rp-server && npm install
   ```
   (gói mới: `@fontsource/inter` ở `rp-user`; `@openfonts/inter_vietnamese`
   thay cho `@openfonts/noto-sans_vietnamese` ở `rp-server` — bản 9.69).
   Cài xong là **ĐÓNG internet lại** như thường lệ.
3. `cd rp-user && npm run build` (bundle tĩnh của web phải build lại —
   đổi phông chữ ở `main.jsx`/`styles.css`).
4. Khởi động lại `rp-server` (áp dụng CẢ phông Inter cho Excel/PDF của
   bản 9.69 VÀ bản sửa lỗi tên siêu thị của bản 9.70 — 2 file đổi đều
   nằm trong `rp-server`, không cần làm gì thêm riêng cho bản 9.70).
5. Khởi động lại tiến trình phục vụ web tĩnh của `rp-user` (pm2/nginx...
   theo cách đang chạy) để nhận bundle mới ở bước 3.

Không cần động tới `etl`, `etl-admin`, `api-server`, `api-admin` ở cả 2
bản này.

---

## C. Kiểm tra sau khi triển khai

- [ ] **(9.69)** Mở rp-user bất kỳ trang nào — chữ dùng phông **Inter**
  (không còn phông hệ thống cũ) — có thể mở DevTools → Computed →
  `font-family` để xác nhận `Inter` là phông áp dụng.
- [ ] **(9.69)** Xuất **Excel** VÀ **PDF** 1 báo cáo bất kỳ có tiếng Việt
  dấu — phông Inter hiện đúng, không lỗi/thiếu dấu, không còn Calibri
  mặc định ở các báo cáo PHẲNG (lỗi cũ đã sửa luôn trong bản 9.69).
- [ ] **(9.70)** Mở báo cáo **"Doanh thu LĐTĐ"** hoặc **"Doanh thu
  HCRC"** đúng ngày có siêu thị đang kiểm kê/chưa mở bán — cột "Siêu
  thị/Cửa hàng" của đúng dòng đó hiện **TÊN** (không còn hiện mã số thô),
  trong khi cột Doanh thu/Tỷ lệ đạt của dòng đó vẫn hiện trống (không
  phải số `0`) — đúng hành vi "chưa có dữ liệu" như trước.
- [ ] **(9.70)** Dòng siêu thị đó được nhóm ĐÚNG vào "Tổng cộng MART"
  hoặc "Tổng cộng MINIMART" theo đúng `LoaiChuoi` đã khai ở "Ánh xạ Điểm
  - STK_ID" (hiệu ứng phụ có lợi của bản sửa lỗi — trước đây có thể rơi
  nhầm vào nhóm "không khớp nhóm nào").
- [ ] **(9.70)** Báo cáo **"Top 5 chi nhánh"** (dùng chung
  `remapRowsToDiem()`) vẫn hoạt động bình thường, không bị ảnh hưởng.

Không có bước nào ở 2 bản này làm mất dữ liệu đã có — chỉ đổi phông chữ
hiển thị/xuất file và sửa 1 hàm xử lý tên siêu thị trong bộ nhớ lúc chạy
báo cáo, không đụng tới dữ liệu đã lưu trong CSDL.
