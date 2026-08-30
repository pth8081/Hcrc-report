# API Server

Cổng dữ liệu cho hệ thống ngoài — hai nhóm endpoint tách biệt hoàn toàn:

- `/api/v1/reports/*` — báo cáo tổng hợp, đọc từ Data Warehouse (độ trễ bằng độ trễ ETL).
- `/api/v1/inventory|loyalty|vouchers/*` — tra cứu realtime, đọc thẳng CSDL OLTP qua view riêng, không qua kho.

Xác thực bằng API key (`header X-API-Key`), không dùng mật khẩu/cookie như Report Server.

## Cài đặt

```bash
cd api-server
npm install
cp .env.example .env   # điền DWH_*, OLTP_*, API_KEYS_JSON
```

Cấp API key cho một hệ thống đối tác — thêm vào `API_KEYS_JSON` trong `.env`:

```json
[{ "key": "chuoi-ngau-nhien-du-dai", "name": "HeThongDoiTacA", "scopes": ["reports", "realtime"] }]
```

`scopes` quyết định nhóm endpoint nào key đó gọi được — thiếu scope nào thì bị 403 ở đúng nhóm đó.

## Chạy

```bash
npm start
```

## Còn thiếu để dùng thật

- **Tên view/cột thật cho 3 route realtime** (`routes/v1/realtime.js`) — đang là khung với TODO, cần schema OLTP thật (xem trao đổi trước) để thay đúng tên `api_rt.TonKho`/`api_rt.DiemThe`/`api_rt.Voucher`.
- **`API_KEYS_JSON` qua .env chỉ là tạm thời** — nên chuyển sang một bảng trong Data Warehouse khi có nhiều hơn vài đối tác, để thu hồi/luân chuyển key không cần deploy lại.
- **OpenAPI spec** — chưa viết, nên có trước khi giao cho hệ thống ngoài tích hợp thật.

## API

| Endpoint | Scope | Mô tả |
|---|---|---|
| `GET /api/v1/health` | — | Kiểm tra tình trạng, không cần key |
| `GET /api/v1/reports/:reportId/run` | `reports` | Chạy báo cáo, lọc qua query string, trả JSON phân trang |
| `GET /api/v1/inventory/:sku` | `realtime` | Tồn kho theo SKU |
| `GET /api/v1/loyalty/:memberCode` | `realtime` | Điểm thẻ thành viên |
| `GET /api/v1/vouchers/:code` | `realtime` | Trạng thái voucher |
