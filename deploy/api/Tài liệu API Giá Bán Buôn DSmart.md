Tài Liệu API: Giá Bán Buôn DSmart

*Phiên bản chính thức --- Đội phát triển DSmart/Report gửi đội phát
triển Hệ thống Văn phòng số HCRC (HCC)*

*22/11/2026 --- cập nhật 23/11/2026 (bản 11.16): thêm field `results` ở
MỌI response apply/delete (xem mục 5.2/5.3/6.2/6.3) --- CHỈ THÊM, các
field cũ (`ok`/`error`/`overwritten`/`alreadyGone`) GIỮ NGUYÊN, hệ thống
đang đọc theo bản 22/11 không cần sửa gì vẫn chạy đúng.*

1\. Tổng Quan

API này thay thế việc hệ thống HCC tự kết nối SQL Server trực tiếp xuống
DSmart16 Trung Tâm (HO) và từng siêu thị để ghi/xoá giá bán buôn (bảng
CSPRICE). Gồm 3 endpoint: thiết lập/cập nhật giá (upsert), xoá giá, và
kiểm tra kết nối.

Mọi request LUÔN ghi/xoá đồng thời ở HO VÀ đúng các siêu thị trong
storeScope --- HO không phụ thuộc storeScope (xem mục 4).

2\. Xác Thực

Header bắt buộc trên MỌI request:

X-API-Key: \<API Key do đội DSmart/Report cấp\>

KHÔNG dùng header Authorization: Bearer --- hệ thống chỉ chấp nhận
X-API-Key cho loại xác thực API key tĩnh. API Key được cấp riêng cho hệ
thống HCC, gắn với scope \"wholesalePrice\" (chỉ gọi được đúng 3
endpoint ở tài liệu này, không gọi được endpoint khác).

Thiếu header hoặc key sai → HTTP 401.

3\. Base URL & Danh Sách Endpoint

baseUrl do 2 bên thống nhất ngoài tài liệu này (vd
https://api.hcrc.vn/api/v1) --- mọi endpoint dưới đây là đường dẫn NỐI
THÊM vào baseUrl, giữ nguyên đúng path (bao gồm cả /ping, KHÔNG nằm dưới
/wholesale-price/).

  ---------------------------------- ------------ ----------------------------
  **Endpoint**                       **Method**   **Khi nào gọi**

  {baseUrl}/wholesale-price/apply    POST         Thêm giá mới HOẶC sửa giá
                                                  (cùng 1 nghiệp vụ upsert)

  {baseUrl}/wholesale-price/delete   POST         Xoá 1 mức giá đã thiết lập

  {baseUrl}/ping                     POST         Kiểm tra kết nối/cấu hình
                                                  (không đụng dữ liệu giá)
  ---------------------------------- ------------ ----------------------------

4\. Phạm Vi Siêu Thị (storeScope)

Gửi kèm CẢ 2 endpoint apply/delete, đúng khuôn:

{\"mode\": \"ALL\", \"storeCodes\": \[\"001\", \"002\", \...\]}\
hoặc\
{\"mode\": \"SPECIFIC\", \"storeCodes\": \[\"001\", \"003\"\]}

storeCodes LUÔN có giá trị ở CẢ 2 mode (kể cả mode=\"ALL\" --- gửi đủ
toàn bộ Mã Siêu Thị đang hoạt động tại thời điểm gọi, không chỉ gửi mỗi
mode).

**Mã Siêu Thị (storeCodes) PHẢI đúng mã đang dùng xuyên suốt hệ thống
HCRC (Mã Điểm, vd \"001\"/\"217\") --- 2 bên cần thống nhất/đối chiếu
danh sách đầy đủ trước khi go-live.**

Thao tác Xoá (delete) PHẢI gửi đúng storeScope đã dùng lúc Áp Giá
(apply) cho cùng cặp (custId, skuId) --- hệ thống KHÔNG tự suy luận phạm
vi khác với storeScope gửi kèm.

**Lưu ý quan trọng: HO (DSmart16 Trung Tâm) LUÔN được ghi/xoá ở MỌI
request apply/delete, KHÔNG phụ thuộc storeScope --- storeScope chỉ chi
phối phần fan-out xuống TỪNG SIÊU THỊ.**

5\. POST {baseUrl}/wholesale-price/apply

5.1. Request

  ------------ --------------- ---------- ---------------------------------
  **Field**    **Kiểu**        **Bắt      **Ràng buộc**
                               buộc**     

  custId       chuỗi           Có         Tối đa 50 ký tự, không rỗng

  skuId        chuỗi           Có         Tối đa 50 ký tự, không rỗng ---
                                          phải tồn tại trong danh mục
                                          SKU_DEF

  price        số              Có         \>= 0

  frDate       chuỗi           Có         frDate \<= toDate
               (YYYY-MM-DD)               

  toDate       chuỗi           Có         
               (YYYY-MM-DD)               

  storeScope   object          Có         Xem mục 4
  ------------ --------------- ---------- ---------------------------------

Ví dụ:

{\
\"custId\": \"C001\",\
\"skuId\": \"SKU001\",\
\"price\": 15000,\
\"frDate\": \"2026-01-01\",\
\"toDate\": \"2026-12-31\",\
\"storeScope\": { \"mode\": \"ALL\", \"storeCodes\": \[\"001\",
\"002\"\] }\
}

5.2. Response thành công (HTTP 200)

{ \"ok\": true, \"custId\": \"C001\", \"skuId\": \"SKU001\",
\"overwritten\": false, \"results\": \[ { \"storeCode\": \"HO\", \"ok\":
true, \"overwritten\": false }, { \"storeCode\": \"001\", \"ok\": true,
\"overwritten\": false } \] }

overwritten=false: đây là giá MỚI (chưa từng có dòng giá cho cặp
custId+skuId này). overwritten=true: đã GHI ĐÈ giá cũ.

**results (mới, bản 23/11/2026)**: mảng chi tiết TỪNG nơi đã ghi (LUÔN
có HO + đúng các storeCode trong storeScope đã gửi) --- mỗi phần tử {
\"storeCode\", \"ok\", \"overwritten\" } khi ok=true. Field này LUÔN có
mặt kể cả khi response thành công (allOk) --- dùng để biết CHÍNH XÁC nơi
nào vừa ghi đè/ghi mới.

5.3. Response lỗi

Lỗi dữ liệu đầu vào (field thiếu/sai định dạng, skuId không tồn tại\...)
→ HTTP 400. Lỗi hệ thống (DSmart/kết nối siêu thị lỗi, chưa cấu
hình\...) → HTTP 502. Luôn kèm:

{ \"ok\": false, \"error\": \"\<mô tả lỗi\>\" }

Khi lỗi xảy ra ở 1 vài siêu thị cụ thể (không phải toàn bộ), error liệt
kê rõ từng nơi lỗi, ví dụ:

{ \"ok\": false, \"error\": \"Ghi giá thất bại tại 1 hoặc nhiều nơi:
003: \<lý do\>\" }

**QUAN TRỌNG --- ghi KHÔNG phải tất cả-hoặc-không-gì**: mỗi nơi (HO/từng
siêu thị) được ghi ĐỘC LẬP --- 1 nơi lỗi KHÔNG chặn/không rollback các
nơi khác đã ghi thành công. response lỗi (ok=false) vẫn kèm field
**results** (mới, bản 23/11/2026) liệt kê ĐẦY ĐỦ từng nơi, ví dụ:

{ \"ok\": false, \"error\": \"Ghi giá thất bại tại 1 hoặc nhiều nơi: HO:
\<lý do\>\", \"results\": \[ { \"storeCode\": \"HO\", \"ok\": false,
\"error\": \"\<lý do\>\" }, { \"storeCode\": \"001\", \"ok\": true,
\"overwritten\": false } \] }

Hệ thống HCC NÊN đọc `results` để biết CHÍNH XÁC nơi nào đã ghi thành
công (coi là \"đã áp giá\", không cần gọi lại) và nơi nào còn lỗi (chỉ
cần gọi lại apply cho đúng storeCode đó, qua storeScope.mode=\"SPECIFIC\"
--- xem mục 4) --- KHÔNG nên coi ok=false là \"chưa áp giá ở bất kỳ
đâu\".

6\. POST {baseUrl}/wholesale-price/delete

6.1. Request

  ------------ --------------- ---------- ---------------------------------
  **Field**    **Kiểu**        **Bắt      **Ràng buộc**
                               buộc**     

  custId       chuỗi           Có         Tối đa 50 ký tự

  skuId        chuỗi           Có         Tối đa 50 ký tự

  storeScope   object          Có         PHẢI đúng storeScope đã dùng lúc
                                          apply --- xem mục 4
  ------------ --------------- ---------- ---------------------------------

6.2. Response thành công (HTTP 200)

{ \"ok\": true, \"alreadyGone\": false, \"results\": \[ { \"storeCode\":
\"HO\", \"ok\": true, \"alreadyGone\": false } \] }

alreadyGone=true: dòng giá này KHÔNG tồn tại sẵn (đã bị xoá từ trước)
--- vẫn coi là THÀNH CÔNG, không báo lỗi.

**results**: giống mục 5.2, mỗi phần tử { \"storeCode\", \"ok\",
\"alreadyGone\" } khi ok=true.

6.3. Response lỗi

Cùng khuôn mục 5.3 (bao gồm cả field **results**).

7\. POST {baseUrl}/ping

Không cần body. Response thành công:

{ \"ok\": true }

Chỉ xác thực key/scope --- không đụng dữ liệu giá.

8\. Idempotency

Cả apply (upsert) và delete đều AN TOÀN khi gọi lặp lại đúng 1 yêu cầu
với cùng dữ liệu --- gọi 2 lần cho kết quả cuối giống nhau, không tạo
trùng/lỗi. Hệ thống HCC có thể tự thử lại khi nghi ngờ lần gọi trước
timeout/thất bại.

9\. Trả Lời Câu Hỏi Đối Tác Đã Nêu

-   Phạm vi áp dụng giá xuống từng siêu thị: XÁC NHẬN --- đội API tự
    đồng bộ xuống đúng phạm vi storeScope qua hạ tầng của mình (HO luôn
    ghi thêm, không phụ thuộc storeScope --- xem mục 4), đối tác KHÔNG
    cần tự kết nối SQL Server xuống bất kỳ nơi nào nữa khi đã bật \"🌐
    Theo API\".

-   Xác thực: API key tĩnh qua header X-API-Key (xem mục 2) --- KHÔNG
    dùng Authorization: Bearer.

-   Môi trường sandbox/test: HIỆN CHƯA có môi trường test riêng --- 2
    bên cần thống nhất quy trình kiểm thử trước khi go-live thật (vd
    dùng 1 custId/skuId thử nghiệm, xoá sạch ngay sau khi test xong),
    tránh test thẳng lên dữ liệu giá thật.

-   Giới hạn tần suất (rate limit): cấu hình riêng theo từng đối tác
    (mặc định gợi ý 120 lượt/phút) --- báo trước khối lượng áp giá hàng
    loạt (tới 2.000 dòng/lượt, gọi tuần tự) để đội API đặt giới hạn phù
    hợp cho đúng API Key của hệ thống HCC, tránh bị chặn giữa chừng 1 lô
    lớn.

-   Thời gian chờ (timeout) khuyến nghị: 15 giây/request --- khớp đúng
    giá trị đối tác đã dùng trong code (REQUEST_TIMEOUT_MS = 15000).
    Phản hồi thông thường kỳ vọng dưới vài giây; vượt 15 giây coi như
    timeout, báo lỗi ngay, không tự động chuyển cơ chế khác.

-   Hỗ trợ gửi mảng nhiều dòng trong 1 lần gọi: CHƯA hỗ trợ ở phiên bản
    này --- mỗi request vẫn là 1 dòng giá, giữ nguyên đúng cách đối tác
    đang gọi tuần tự hiện tại (tới 2.000 lượt gọi/lô, có cơ chế dừng sớm
    khi gặp lỗi kết nối/cấu hình).

10\. Trước Khi Go-Live

-   2 bên thống nhất/đối chiếu đầy đủ danh sách Mã Siêu Thị (storeCodes)
    dùng chung.

-   Đội API cấp API Key + thống nhất baseUrl, rate limit phù hợp khối
    lượng thực tế.

-   Thống nhất quy trình kiểm thử tạm thời (mục 9) trước khi bật \"🌐
    Theo API\" chính thức --- không có môi trường sandbox tách biệt ở
    giai đoạn này.
