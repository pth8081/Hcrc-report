# Báo cáo `bc-ban-buon-theo-loai-hinh` — "Doanh thu Bán buôn theo loại hình (Mart/Mini Mart/Kho)"

Tài liệu triển khai riêng cho báo cáo MỚI (bản 10.98, theo yêu cầu người
dùng — tách doanh thu Bán buôn hàng ngày theo loại hình Mart/Mini
Mart/Kho/Tổng, dựa trên file mẫu `Bán buôn chi tiết theo khách hàng.xlsx`
đội vận hành đang tự xuất — đã xác nhận với người dùng: báo cáo này
**KHÔNG có Kế hoạch/% hoàn thành**, chỉ hiện doanh thu thực tế hàng ngày).

## 1. Báo cáo này làm gì

Mỗi dòng = **1 ngày**, 4 cột số liệu: **Mart**, **Mini Mart**, **Kho**,
**Tổng cộng** — cộng dồn **Doanh thu Bán buôn** (đúng công thức
`DoanhThuBanBuon` đã chốt ở "báo cáo doanh thu-nhập hàng theo ngành
hàng.md", dựa trên `TRANS_CODE IN ('211','212')`) trong ngày đó, xếp theo
loại hình của từng mã Điểm.

**Xếp loại hình** theo `etl.DiemStkMapping.LoaiChuoi` (admin tự khai ở
etl-admin → "Ánh xạ Điểm - STK_ID", xem mục 2 dưới) — mã Điểm nào **để
trống LoaiChuoi sẽ bị BỎ QUA hoàn toàn** khỏi cả 3 nhóm lẫn "Tổng cộng"
(không suy đoán, đúng quy ước bắt buộc ở `CLAUDE.md`).

**KHÔNG có Kế hoạch** — theo xác nhận trực tiếp của người dùng: *"Không
có target bán buôn, chỉ có doanh thu bán buôn hàng ngày"*.

## 2. Nguồn dữ liệu

TÁI DÙNG domain `doanhthu_nganhhang` **ĐÃ CÓ SẴN** (measure
`DoanhThuBanBuon`, gộp theo STK_ID/DEPT_ID/ngày — dùng chung VIEW nguồn
với "bc-doanh-thu-nganhhang.md"/"bc-doanh-thu-tong-hop-hcrc.md") —
**KHÔNG tạo VIEW/job đồng bộ mới**. Nếu domain này chưa có dữ liệu trên
server, xem "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục triển
khai domain `doanhthu_nganhhang`.

**Phân loại Mart/Mini Mart/Kho**: dùng chung bảng "Ánh xạ Điểm - STK_ID"
(`etl.DiemStkMapping`, quản lý ở etl-admin) đã có sẵn cột `LoaiChuoi`
(trước đây chỉ tài liệu hoá 2 giá trị MART/MINIMART, dùng cho "Báo cáo
nhanh doanh thu") — bản 10.98 thêm giá trị thứ 3 **`KHO`** (chữ hoa,
không dấu) cho mã Điểm là kho hàng (không bán lẻ). KHÔNG cần VIEW/bảng
mới — chỉ cần admin **gõ tay** đúng giá trị này vào ô `LoaiChuoi` đã có
sẵn trên giao diện, cho MỌI mã Điểm có phát sinh doanh thu bán buôn.

## 3. Các bước triển khai (theo đúng thứ tự)

| # | Việc | Ai làm |
|---|---|---|
| 1 | `git pull origin main` rồi khởi động lại `rp-server` | IT/Dev |
| 2 | Chạy `node rp-server/scripts/seedBanBuonTheoLoaiHinhReport.js [menuCode]` (thư mục `rp-server/`) — mặc định đặt ở menu `reports-kinh-doanh` ("Báo cáo kinh doanh") | Admin rp-user / IT-Dev |
| 3 | Vào Hệ thống → Phân quyền, gán quyền xem `bc-ban-buon-theo-loai-hinh` cho đúng vai trò cần dùng | Admin rp-user |
| 4 | Vào etl-admin → "Ánh xạ Điểm - STK_ID", khai đủ `LoaiChuoi` = `MART`/`MINIMART`/`KHO` cho **MỌI** mã Điểm có doanh thu bán buôn — thiếu mã nào, mã đó bị loại khỏi báo cáo (kể cả khỏi "Tổng cộng") | Admin etl-admin |

## 4. Cách kiểm tra sau khi triển khai xong

Mở báo cáo, chọn 1 khoảng ngày đã biết có giao dịch bán buôn — `Tổng cộng`
của 1 dòng phải bằng đúng `Mart + Mini Mart + Kho` của chính dòng đó.
Đối chiếu số `Mart`/`Mini Mart` với "Doanh thu theo ngành hàng" (cột
"DT bán buôn", cộng dồn mọi siêu thị cùng loại hình trong ngày đó) — phải
khớp, vì cùng 1 nguồn `DoanhThuBanBuon`.

Nếu 1 ngày biết chắc có doanh thu bán buôn nhưng báo cáo ra 0/thiếu —
kiểm tra lại mã Điểm phát sinh doanh thu hôm đó đã khai `LoaiChuoi`
chưa (bước 4 ở trên) — thiếu khai là nguyên nhân phổ biến nhất.
