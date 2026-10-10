// scripts/seedVoucherCheckConsumer.js — Tạo/cập nhật 1 "Đối tác" (Consumer)
// RIÊNG cho rp-server gọi vào Endpoint realtime "voucher-check" (tra cứu
// voucher nội bộ — xem scripts/seedVoucherCheckEndpoint.js +
// api-voucher-check-redeem.md mục "Kiểm tra voucher nội bộ") — THAY THẾ
// việc vào api-admin tự tay tạo "Đối tác" + tick endpoint, theo đúng yêu
// cầu người dùng (bản 9.03): chạy script, không cấu hình qua web.
//
// YÊU CẦU TRƯỚC: đã chạy "node scripts/seedVoucherCheckEndpoint.js" (tạo
// sẵn Endpoint realtime "voucher-check" — đối tác KHÔNG tick được endpoint
// chưa tồn tại).
//
// AN TOÀN (giữ nguyên nguyên tắc "bí mật chỉ hiện đúng 1 lần" của
// routes/admin/consumers.js): API key gốc CHỈ in ra STDOUT, không lưu vào
// file/.env nào — dùng NGAY trong 1 lệnh nối chuỗi, không copy tay qua web:
//
//   cd api-server
//   APIKEY=$(node scripts/seedVoucherCheckConsumer.js) && \
//     (cd ../rp-server && node scripts/seedVoucherApiConnection.js "$APIKEY")
//
// Mọi thông báo KHÁC (trạng thái, lỗi) đều in ra STDERR — STDOUT CHỈ chứa
// đúng API key khi tạo mới/luân chuyển, để dùng được trong $(...) ở trên.
//
// IDEMPOTENT — khớp theo tên đối tác (biến VOUCHER_CONSUMER_NAME, mặc định
// "rp-server (voucher-check)"): đã tồn tại thì KHÔNG tạo trùng, KHÔNG tự
// đổi key (tránh làm hỏng kết nối đang chạy) — chỉ in lại thông báo "đã có"
// (STDOUT rỗng, exit 1 để chặn lệnh nối chuỗi phía sau chạy với key rỗng).
// Muốn LUÂN CHUYỂN (sinh key mới, key cũ hết tác dụng ngay): chạy lại với
// VOUCHER_CONSUMER_ROTATE=true.
require('dotenv').config();
const crypto = require('crypto');
const { sql, getPool } = require('../db');
const { sha256Hex } = require('../lib/hash');
const { invalidate } = require('../lib/apiConsumers');

const CONSUMER_NAME = process.env.VOUCHER_CONSUMER_NAME || 'rp-server (voucher-check)';
const ENDPOINT = process.env.VOUCHER_CHECK_ENDPOINT || 'voucher-check';
const SCOPE = 'realtime';

async function main() {
  const pool = await getPool('ADMIN');

  const existing = await pool.request().input('name', sql.NVarChar(200), CONSUMER_NAME)
    .query('SELECT Id, AuthMethod, Scopes FROM api.ApiConsumers WHERE Name = @name');

  let consumerId;
  let rawKey = null;

  if (existing.recordset.length) {
    const row = existing.recordset[0];
    consumerId = row.Id;
    if (row.AuthMethod !== 'apiKey') {
      console.error(`⛔ Đối tác "${CONSUMER_NAME}" đã tồn tại nhưng AuthMethod="${row.AuthMethod}" (không phải "apiKey") — script này không xử lý được, sửa tay qua api-admin.`);
      process.exit(1);
    }

    if (process.env.VOUCHER_CONSUMER_ROTATE === 'true') {
      rawKey = crypto.randomBytes(32).toString('base64url');
      await pool.request().input('id', sql.Int, consumerId).input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
        .query('UPDATE api.ApiConsumers SET ApiKeyHash = @apiKeyHash WHERE Id = @id');
      invalidate();
      console.error(`✅ Đã LUÂN CHUYỂN API key cho đối tác "${CONSUMER_NAME}" #${consumerId} — key CŨ hết tác dụng ngay.`);
    } else {
      console.error(`ℹ️  Đối tác "${CONSUMER_NAME}" #${consumerId} đã tồn tại — KHÔNG tạo trùng, KHÔNG đổi key.`);
      console.error('   Mất key cũ? Chạy lại với VOUCHER_CONSUMER_ROTATE=true để lấy key MỚI (key cũ sẽ ngừng hoạt động ngay).');
    }

    const scopesList = (row.Scopes || '').split(',').filter(Boolean);
    if (!scopesList.includes(SCOPE)) {
      scopesList.push(SCOPE);
      await pool.request().input('id', sql.Int, consumerId).input('scopes', sql.NVarChar(200), scopesList.join(','))
        .query('UPDATE api.ApiConsumers SET Scopes = @scopes WHERE Id = @id');
      invalidate();
      console.error(`✅ Đã thêm scope "${SCOPE}" vào đối tác "${CONSUMER_NAME}" (trước đó thiếu).`);
    }
  } else {
    rawKey = crypto.randomBytes(32).toString('base64url');
    const result = await pool.request()
      .input('name', sql.NVarChar(200), CONSUMER_NAME)
      .input('authMethod', sql.VarChar(20), 'apiKey')
      .input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
      .input('clientId', sql.VarChar(64), null)
      .input('clientSecretHash', sql.Char(64), null)
      .input('hmacKeyId', sql.VarChar(64), null)
      .input('hmacSecretEncrypted', sql.NVarChar(500), null)
      .input('scopes', sql.NVarChar(200), SCOPE)
      .input('rateLimit', sql.Int, 120)
      .input('allowedIps', sql.NVarChar(500), null)
      .query(`
        INSERT INTO api.ApiConsumers (Name, AuthMethod, ApiKeyHash, ClientId, ClientSecretHash, HmacKeyId, HmacSecretEncrypted, Scopes, RateLimitPerMinute, AllowedIps)
        OUTPUT INSERTED.Id
        VALUES (@name, @authMethod, @apiKeyHash, @clientId, @clientSecretHash, @hmacKeyId, @hmacSecretEncrypted, @scopes, @rateLimit, @allowedIps)
      `);
    consumerId = result.recordset[0].Id;
    invalidate();
    console.error(`✅ Đã TẠO MỚI đối tác "${CONSUMER_NAME}" #${consumerId} (scope: ${SCOPE}).`);
  }

  // Cấp quyền gọi endpoint "voucher-check" — idempotent, luôn đảm bảo có,
  // kể cả khi đối tác đã tồn tại từ trước nhưng thiếu bước tick này.
  const accessRow = await pool.request()
    .input('id', sql.Int, consumerId).input('endpoint', sql.VarChar(50), ENDPOINT)
    .query('SELECT 1 AS found FROM api.ConsumerRealtimeAccess WHERE ConsumerId = @id AND Endpoint = @endpoint');
  if (!accessRow.recordset.length) {
    await pool.request()
      .input('id', sql.Int, consumerId).input('endpoint', sql.VarChar(50), ENDPOINT)
      .query('INSERT INTO api.ConsumerRealtimeAccess (ConsumerId, Endpoint) VALUES (@id, @endpoint)');
    console.error(`✅ Đã cấp quyền gọi endpoint "${ENDPOINT}" cho đối tác "${CONSUMER_NAME}".`);
  }

  if (rawKey) {
    console.log(rawKey); // CHỈ dòng này ra stdout — dùng được trong $(...)
    console.error('');
    console.error('⚠️  API KEY TRÊN CHỈ HIỆN ĐÚNG 1 LẦN — dùng ngay (lệnh nối chuỗi) hoặc lưu lại an toàn.');
    process.exit(0);
  }

  console.error('');
  console.error('Không có key mới để đưa ra (đối tác đã tồn tại, không luân chuyển lần này).');
  process.exit(1); // chặn lệnh nối chuỗi phía sau chạy tiếp với key rỗng
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
