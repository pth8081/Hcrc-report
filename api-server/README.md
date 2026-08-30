# API Server

Cổng dữ liệu cho hệ thống ngoài **và nội bộ** (API key không phân biệt hai
bên — cấp cho app nội bộ y hệt đối tác ngoài) + trang quản trị tự cấu hình
(`api-admin/`). Ba nhóm route, ba mức xác thực hoàn toàn tách biệt:

- `/api/v1/reports/*` — báo cáo tổng hợp, đọc từ Data Warehouse (`HCRC_DWH`, chỉ đọc, nguồn mặc định qua `.env`). ĐỊNH NGHĨA (bộ lọc/cột) đọc từ `api.ReportCatalog` (CSDL `HCRC_API`, quản lý qua `api-admin/`, ĐỘC LẬP với danh mục báo cáo bên Report Server). Xác thực: API key.
- `/api/v1/realtime/{endpoint}/*` — tra cứu realtime, `endpoint` KHÔNG cố định trong code — admin tự tạo qua `api-admin/` (chọn nguồn OLTP rồi duyệt bảng/cột thật, không gõ tay — `api.RealtimeEndpointDefs`), thêm loại dữ liệu realtime mới không cần lập trình viên viết route. Mỗi endpoint có 2 route: `/{endpoint}/{key}` (tra 1 khoá) và `/{endpoint}/list` (danh sách phân trang). Xác thực: API key.
- `/admin/*` — trang quản trị (`api-admin/`): đối tác API, nguồn dữ liệu realtime, endpoint realtime, danh mục báo cáo, kết nối hiện tại/lịch sử/top truy vấn. Xác thực: cookie phiên (tài khoản riêng, CSDL riêng `HCRC_API`).

Report Server (`rp-server/`) là MỘT trong những bên gọi `/api/v1/*` này — khi
một báo cáo bên đó cấu hình `SourceType='apiReport'\|'apiRealtime'` (xem
`rp-server/README.md` mục "Báo cáo lấy dữ liệu qua API Server"), thường dùng
cho dữ liệu realtime mà API Server đã có sẵn kết nối, tránh Report Server tự
mở thêm một đường kết nối trực tiếp riêng tới cùng hệ thống đó. Cấp một API
key riêng cho `rp-server` giống bất kỳ đối tác nào khác (xem mục "Cấp API key
cho một hệ thống đối tác" bên dưới), scope `reports` và/hoặc `realtime` tuỳ
loại nguồn dùng.

## Cài đặt

```bash
cd api-server
npm install
cp .env.example .env   # điền DWH_*, ADMIN_* (CSDL HCRC_API), ADMIN_JWT_SECRET, API_ENCRYPTION_KEY
```

Tạo khoá mã hoá (dùng để mã hoá mật khẩu các nguồn lưu trong `api.DataSources`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Chạy `api-db/schema.sql` trên CSDL `HCRC_API` (một lần — an toàn chạy lại
nhiều lần). Tạo tài khoản quản trị đầu tiên cho `api-admin/`:

```bash
npm run seed:admin -- ten-dang-nhap mat-khau "Họ Tên" admin
```

## Tạo một endpoint realtime mới (không cần code)

Qua `api-admin/`, 2 bước:

1. **Trang "Nguồn dữ liệu"** — thêm một nguồn (`api.DataSources`): server/
   database/tài khoản **chỉ đọc**, kiểm tra kết nối trước khi lưu. Nhiều
   endpoint có thể dùng chung 1 nguồn, hoặc mỗi endpoint 1 nguồn khác nhau
   (nhiều máy chủ OLTP) — không giới hạn.
2. **Trang "Endpoint realtime"** — tạo endpoint mới: đặt tên (vd
   `inventory`, `don-hang-dang-xu-ly`), chọn nguồn ở bước 1, DUYỆT bảng/view
   thật của nguồn đó (không gõ tay), chọn 1 bảng, DUYỆT cột thật, chọn cột
   khoá (`KeyColumn` — dùng cho tra 1 khoá), cột sắp xếp (`OrderColumn` —
   dùng cho danh sách phân trang), và các cột muốn hiển thị.

Sau khi lưu, endpoint hoạt động NGAY qua 2 route dùng chung cho mọi endpoint
— `GET /api/v1/realtime/{endpoint}/{key}` và
`GET /api/v1/realtime/{endpoint}/list` — không deploy lại, không viết route
mới. Xem `lib/realtimeEngine.js` cho phần chạy câu SELECT động (tên bảng/cột
đã xác nhận tồn tại thật lúc lưu, kiểm tra định dạng lúc chạy chỉ là lớp
phòng thủ thứ hai — cùng nguyên tắc với ETL, xem tài liệu kiến trúc "Quản
Trị ETL HCRC" nếu muốn đối chiếu).

Endpoint chưa tồn tại/đã tắt sẽ trả lỗi 404 rõ ràng thay vì âm thầm dùng cấu
hình cũ — không có "endpoint mặc định" ngầm định cho nhóm realtime này
(khác `/api/v1/reports`, vẫn có `HCRC_DWH` làm mặc định qua `.env`).

## Cấp quyền gọi API cho một hệ thống đối tác

3 cách xác thực — chọn MỘT khi tạo đối tác (`authMethod`), không đổi được
sau đó (đổi nghĩa là tạo đối tác mới, giữ nguyên `Scopes`/`AllowedIps` cũ
nếu cần thì tự khai lại):

### 1. API key tĩnh (`authMethod: "apiKey"`, mặc định)

```bash
curl -X POST http://localhost:4002/admin/consumers \
  -H "Content-Type: application/json" -b "hcrc_api_admin_token=..." \
  -d '{"name":"HeThongDoiTacA","authMethod":"apiKey","scopes":["reports","realtime"],"rateLimitPerMinute":120}'
```

Response trả về `apiKey` — **chỉ hiện đúng một lần**, CSDL chỉ lưu bản băm
SHA-256 (`api.ApiConsumers.ApiKeyHash`). Đối tác gửi kèm header `X-API-Key`
mỗi request. Mất key thì luân chuyển (`POST /admin/consumers/:id/rotate`),
không lấy lại được key cũ.

### 2. OAuth2 Client Credentials (`authMethod: "oauth2"`)

Đối tác đổi `clientId`/`clientSecret` (cấp một lần lúc tạo, y hệt API key)
lấy access token ngắn hạn, rồi gọi API kèm token đó — không gửi bí mật qua
dây mỗi request:

```bash
# Bước 1 — đối tác đổi lấy token (client_id/secret qua form body HOẶC Basic Auth, cả 2 đều được):
curl -X POST http://localhost:4002/api/v1/oauth/token \
  -d "grant_type=client_credentials&client_id=...&client_secret=..."
# -> { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }

# Bước 2 — gọi API thật:
curl http://localhost:4002/api/v1/reports/doanh-thu-thang/run \
  -H "Authorization: Bearer <access_token>"
```

Token là JWT ký bằng `OAUTH_JWT_SECRET` (`.env`, RIÊNG khỏi `ADMIN_JWT_SECRET`),
tự chứa `scopes`/`allowedIps` — xác minh KHÔNG cần tra CSDL mỗi request. Đánh
đổi: đổi quyền cho 1 đối tác chỉ có hiệu lực với token phát hành SAU, token
cũ vẫn dùng được tới khi hết hạn (`OAUTH_TOKEN_TTL_SECONDS`, mặc định 1 giờ)
— đúng tinh thần token ngắn hạn của OAuth2.

### 3. HMAC ký từng request (`authMethod: "hmac"`)

Chuẩn phổ biến ở cổng thanh toán/ngân hàng (VNPay/MoMo...) — đối tác tự ký
mỗi request bằng bí mật dùng chung, không gửi bí mật qua dây:

```
X-Key-Id:    <định danh công khai, cấp lúc tạo đối tác>
X-Timestamp: <unix giây lúc ký>
X-Signature: hex(HMAC-SHA256(secret, "METHOD\npath\ntimestamp\nrawBody"))
```

`path` gồm cả query string, `rawBody` là chuỗi thô (rỗng nếu GET không body).
`X-Timestamp` phải nằm trong 5 phút quanh giờ máy chủ — chống phát lại
(replay), xem `lib/hmacAuth.js`. Bí mật (`HmacSecretEncrypted`) mã hoá bằng
`API_ENCRYPTION_KEY` — PHẢI giải mã lại được để tính chữ ký so sánh (khác
`ApiKeyHash`/`ClientSecretHash`, băm một chiều).

### Giới hạn IP theo từng đối tác

Tuỳ chọn — thêm lớp phòng thủ nữa nếu key bị lộ. Đặt trong `api.ApiConsumers.AllowedIps`
(ô "IP cho phép" trên `api-admin/`), phân tách dấu phẩy, chấp nhận cả IP đơn
lẫn dải CIDR (chỉ IPv4):

```
203.0.113.10,198.51.100.0/24
```

Để trống = không giới hạn (chỉ cần đúng key, hành vi mặc định). Kiểm tra
**sau khi** key đã xác thực hợp lệ (xem `lib/apiAuth.js`, `lib/ipMatch.js`)
— key đúng nhưng gọi từ IP ngoài danh sách vẫn bị từ chối (`403`). Khác
`lib/adminIpAllowlist.js` (đó là 1 danh sách CHUNG cho `/admin/*`, áp dụng
như nhau cho mọi người vận hành) — đây là RIÊNG từng đối tác, cho `/api/v1/*`.

**Giới hạn IP CHỈ đáng tin khi `TRUST_PROXY_HOPS` đặt đúng số lớp Nginx đứng
trước** (mặc định 1) — sai số này, `req.ip` luôn là IP của Nginx cho MỌI
request, giới hạn IP riêng từng đối tác trở nên vô nghĩa (mọi đối tác trông
như cùng gọi từ 1 IP). Xem thêm mục "Triển khai sau Nginx / public Internet".

**Giới hạn tần suất riêng theo từng đối tác** (`api.ApiConsumers.RateLimitPerMinute`,
ô "Giới hạn/phút" khi tạo/sửa đối tác) — áp dụng THẬT (`lib/consumerRateLimit.js`,
cửa sổ cố định 60 giây, đếm trong bộ nhớ tiến trình), SAU khi xác thực xong,
độc lập với bộ giới hạn theo IP nặc danh TRƯỚC xác thực (`server.js`, chặn
spam chưa biết đối tác nào). Vượt quá → `429` kèm header `Retry-After`. Với
`authMethod='oauth2'`, giá trị này nhúng thẳng vào access token JWT lúc cấp
(giống `scopes`/`allowedIps`) — đổi giới hạn chỉ có hiệu lực với token cấp
SAU, token cũ vẫn theo giới hạn cũ tới khi hết hạn.

Xác thực hợp lệ (bất kỳ 1 trong 3 cách trên) + scope `reports`/`realtime` vẫn
chưa đủ để gọi được báo cáo/endpoint — xem các mục dưới.

## Tuỳ biến dữ liệu trả về cho từng đối tác

2 lớp ĐỘC LẬP, không thay được nhau:

**1. Đối tác được gọi báo cáo nào (`api.ConsumerReportAccess`)** — MẶC ĐỊNH
một đối tác mới **không gọi được báo cáo nào**, dù `apiKey` có scope
`reports` hợp lệ. Gán qua nút "Báo cáo được gọi" ở trang "Đối tác"
(`api-admin/`), hoặc thẳng `PUT /admin/consumers/:id/report-access` với
`{ "reportIds": [...] }` — GHI ĐÈ toàn bộ danh sách mỗi lần gọi (không phải
thêm/bớt từng cái). Y HỆT cơ chế này áp dụng cho endpoint realtime qua
`api.ConsumerRealtimeAccess` + nút "Realtime được gọi" + `PUT
/admin/consumers/:id/realtime-access` với `{ "endpoints": [...] }` — **quan
trọng khi nhiều chi nhánh/siêu thị dùng chung API Server** (mỗi chi nhánh 1
`api.DataSources` + endpoint riêng): thiếu bước gán này, 1 đối tác có scope
`realtime` đọc được realtime của MỌI chi nhánh, không riêng chi nhánh của họ.

**2. Chọn cột theo yêu cầu (`?fields=`)** — trong báo cáo họ ĐƯỢC gọi, đối
tác có thể chỉ lấy đúng cột cần thay vì nhận hết:

```bash
curl "http://localhost:4002/api/v1/reports/doanh-thu-thang/run?fields=entityCode,tyLeLoiNhuan" \
  -H "X-API-Key: ..."
```

Xin cột không có trong định nghĩa báo cáo → `400` rõ ràng (kèm danh sách cột
sai tên), không âm thầm bỏ qua.

## Cột tính toán (công thức)

Giống hệt cơ chế bên `rp-server/` (xem `rp-server/README.md` mục "Cột tính
toán") — một phần tử `columns` trong `DefinitionJson` có thể là công thức:

```json
{ "key": "tyLeLoiNhuan", "label": "Tỷ lệ lợi nhuận (%)", "formula": "ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)" }
```

Chạy ở `lib/reportEngine.js` (qua `lib/formulaEngine.js`, KHÔNG dùng
`eval()`), cú pháp kiểm tra ngay lúc lưu. Dùng khi báo cáo đó có
`SourceType='apiReport'` bên rp-server — API Server là nơi thực sự chạy
query, nên công thức phải khai ở đây, rp-server chỉ forward kết quả.

## Triển khai sau Nginx / public Internet

`/api/v1/*` thiết kế để lộ ra Internet (đối tác gọi từ bất kỳ đâu); `/admin/*`
thì KHÔNG — Nginx chỉ nên proxy `/api/v1/*` ra ngoài, `/admin/*` chỉ mở trong
mạng nội bộ/VPN. `lib/adminIpAllowlist.js` (biến `ADMIN_ALLOWED_IPS`) chỉ là
lớp phòng thủ BỔ SUNG, không thay được cấu hình Nginx.

**`TRUST_PROXY_HOPS`** (mặc định 1) — BẮT BUỘC khớp đúng số lớp reverse proxy
đứng trước tiến trình này. Sai giá trị này, `req.ip` luôn là IP của Nginx cho
MỌI request, làm hỏng ngầm: giới hạn IP riêng từng đối tác, `ADMIN_ALLOWED_IPS`,
giới hạn tần suất theo IP nặc danh, và cột `IpAddress` trong `api.RequestLog`
(log sẽ ghi IP Nginx thay vì IP đối tác thật — mất khả năng truy vết khi có
sự cố). Xem mẫu cấu hình Nginx thật ở `deploy/nginx.conf` (thư mục gốc repo).

**Chống dò mật khẩu đăng nhập `/admin/auth/login`** — `lib/loginRateLimit.js`,
tối đa 10 lần sai liên tiếp theo (IP + username) trong 15 phút, đăng nhập
đúng xoá ngay bộ đếm — độc lập với giới hạn tần suất chung của toàn server.

## Còn thiếu để dùng thật

- **Bộ lọc động cho endpoint realtime** — `/list` mới hỗ trợ phân trang, chưa lọc theo điều kiện (khác `/api/v1/reports` đã có `filters`) — cần nếu danh sách quá lớn để xem hết từng trang.
- **OpenAPI spec** — chưa viết, nên có trước khi giao cho hệ thống ngoài tích hợp thật.

## API — `/api/v1/*` (đối tác — API key, OAuth2, hoặc HMAC)

| Endpoint | Scope | Mô tả |
|---|---|---|
| `GET /api/v1/health` | — | Kiểm tra tình trạng, không cần xác thực |
| `POST /api/v1/oauth/token` | — | Đổi `client_id`/`client_secret` lấy access token (chỉ đối tác `authMethod='oauth2'`) |
| `GET /api/v1/reports/:reportId/run` | `reports` | Chạy báo cáo (định nghĩa trong `api.ReportCatalog`) — cần được gán quyền qua `api.ConsumerReportAccess`; lọc qua query string, `?fields=` chọn cột, trả JSON phân trang |
| `GET /api/v1/realtime/:endpoint/:key` | `realtime` | Tra 1 khoá — `endpoint` bất kỳ đã tạo qua trang "Endpoint realtime" (vd `inventory`, `loyalty`, `vouchers`, hoặc endpoint mới tự đặt) |
| `GET /api/v1/realtime/:endpoint/list` | `realtime` | Danh sách cùng endpoint, phân trang |

## API — `/admin/*` (nội bộ, cookie phiên)

| Endpoint | Vai trò | Mô tả |
|---|---|---|
| `POST /admin/auth/login`, `/logout`, `GET /me` | — | Đăng nhập/đăng xuất |
| `GET/POST/PUT/DELETE /admin/consumers` | `admin` sửa, ai đăng nhập cũng xem được | CRUD đối tác API |
| `POST /admin/consumers/:id/rotate` | `admin` | Luân chuyển bí mật (apiKey/clientSecret/hmacSecret tuỳ `AuthMethod` của đối tác) — định danh công khai (ClientId/HmacKeyId) giữ nguyên |
| `GET/PUT /admin/consumers/:id/report-access` | `admin` sửa | Báo cáo đối tác được gọi (`api.ConsumerReportAccess`) |
| `GET/PUT /admin/consumers/:id/realtime-access` | `admin` sửa | Endpoint realtime đối tác được gọi (`api.ConsumerRealtimeAccess`) |
| `GET/POST/PUT/DELETE /admin/data-sources` | `admin` sửa | CRUD nguồn dữ liệu OLTP (kết nối vật lý) |
| `POST /admin/data-sources/test` | `admin` | Kiểm tra kết nối một cấu hình chưa lưu |
| `GET /admin/data-sources/:id/tables` | — | Duyệt bảng/view thật của một nguồn |
| `GET /admin/data-sources/:id/tables/:schema/:table/columns` | — | Duyệt cột thật của một bảng/view |
| `GET/POST/PUT/DELETE /admin/realtime-endpoints` | `admin` sửa | CRUD định nghĩa endpoint realtime (`api.RealtimeEndpointDefs`) |
| `GET/POST/PUT/DELETE /admin/report-catalog` | `admin` sửa | CRUD danh mục báo cáo tổng hợp (`api.ReportCatalog`) |
| `GET /admin/live/stream` | — | SSE: request đang chạy realtime |
| `GET /admin/live/pools` | — | Số kết nối CSDL đang dùng/tối đa (DWH) |
| `GET /admin/history` | — | Lịch sử request, lọc + phân trang |
| `GET /admin/stats/top?since=1h\|24h\|7d` | — | Top endpoint/đối tác theo số lượt gọi |
