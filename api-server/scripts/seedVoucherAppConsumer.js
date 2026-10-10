// scripts/seedVoucherAppConsumer.js — Tạo/cập nhật "Đối tác" cho ỨNG DỤNG
// VOUCHER NGOÀI (thiết bị quét mã, gọi POST /api/v1/vouchers/check|redeem)
// — xem api-voucher-check-redeem.md mục 5 "Cấp quyền gọi cho đối tác (app
// voucher)". KHÁC HẲN scripts/seedVoucherCheckConsumer.js (đối tác RIÊNG
// cho rp-server tự gọi NỘI BỘ, scope "realtime", key chỉ in trần 1 dòng để
// script khác nối chuỗi) — đối tác NÀY cấp API key để CON NGƯỜI copy GỬI
// CHO ĐỘI PHÁT TRIỂN APP VOUCHER bên ngoài, scope `voucherCheck` +
// `voucherRedeem`, KHÔNG cần tick endpoint realtime nào (2 route
// check/redeem CỐ ĐỊNH trong code — chỉ cần đúng scope là gọi được, xem
// routes/v1/vouchers.js).
//
// Cách dùng:
//   node scripts/seedVoucherAppConsumer.js
// hoặc:
//   npm run seed:voucher-app-consumer
//
// IDEMPOTENT theo tên (biến VOUCHER_APP_CONSUMER_NAME, mặc định
// "App Voucher (thiết bị quét mã)"): đã tồn tại thì KHÔNG đổi key (tránh
// làm app ngoài đang chạy mất kết nối đột ngột) — chạy lại với
// VOUCHER_APP_CONSUMER_ROTATE=true để LUÂN CHUYỂN (sinh key MỚI, key CŨ hết
// tác dụng NGAY — nhớ báo đội app voucher cập nhật lại trước khi rotate).
require('dotenv').config();
const crypto = require('crypto');
const { sql, getPool } = require('../db');
const { sha256Hex } = require('../lib/hash');
const { invalidate } = require('../lib/apiConsumers');

const CONSUMER_NAME = process.env.VOUCHER_APP_CONSUMER_NAME || 'App Voucher (thiết bị quét mã)';
const SCOPES = ['voucherCheck', 'voucherRedeem'];

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

    if (process.env.VOUCHER_APP_CONSUMER_ROTATE === 'true') {
      rawKey = crypto.randomBytes(32).toString('base64url');
      await pool.request().input('id', sql.Int, consumerId).input('apiKeyHash', sql.Char(64), sha256Hex(rawKey))
        .query('UPDATE api.ApiConsumers SET ApiKeyHash = @apiKeyHash WHERE Id = @id');
      invalidate();
      console.log(`✅ Đã LUÂN CHUYỂN API key cho đối tác "${CONSUMER_NAME}" #${consumerId} — key CŨ hết tác dụng NGAY, nhớ báo đội app voucher cập nhật lại.`);
    } else {
      console.log(`ℹ️  Đối tác "${CONSUMER_NAME}" #${consumerId} đã tồn tại — KHÔNG tạo trùng, KHÔNG đổi key.`);
      console.log('   Cần gửi lại key cho đối tác nhưng đã làm mất (không lấy lại được key cũ)?');
      console.log('   Chạy lại với VOUCHER_APP_CONSUMER_ROTATE=true để lấy key MỚI (key cũ sẽ ngừng hoạt động ngay).');
    }

    const scopesList = (row.Scopes || '').split(',').filter(Boolean);
    const missing = SCOPES.filter((s) => !scopesList.includes(s));
    if (missing.length) {
      const merged = [...scopesList, ...missing];
      await pool.request().input('id', sql.Int, consumerId).input('scopes', sql.NVarChar(200), merged.join(','))
        .query('UPDATE api.ApiConsumers SET Scopes = @scopes WHERE Id = @id');
      invalidate();
      console.log(`✅ Đã thêm scope thiếu (${missing.join(', ')}) vào đối tác "${CONSUMER_NAME}".`);
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
      .input('scopes', sql.NVarChar(200), SCOPES.join(','))
      .input('rateLimit', sql.Int, 120)
      .input('allowedIps', sql.NVarChar(500), null)
      .query(`
        INSERT INTO api.ApiConsumers (Name, AuthMethod, ApiKeyHash, ClientId, ClientSecretHash, HmacKeyId, HmacSecretEncrypted, Scopes, RateLimitPerMinute, AllowedIps)
        OUTPUT INSERTED.Id
        VALUES (@name, @authMethod, @apiKeyHash, @clientId, @clientSecretHash, @hmacKeyId, @hmacSecretEncrypted, @scopes, @rateLimit, @allowedIps)
      `);
    consumerId = result.recordset[0].Id;
    invalidate();
    console.log(`✅ Đã TẠO MỚI đối tác "${CONSUMER_NAME}" #${consumerId} (scope: ${SCOPES.join(', ')}).`);
  }

  if (rawKey) {
    // Khác seedVoucherCheckConsumer.js (key in trần 1 dòng cho script khác
    // nối chuỗi đọc) — key NÀY dành để CON NGƯỜI copy gửi cho đội app
    // voucher, nên in rõ ràng, có khung dễ nhận ra, kèm ví dụ dùng luôn.
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  API KEY — GỬI CHO ĐỘI PHÁT TRIỂN APP VOUCHER (CHỈ HIỆN 1 LẦN)');
    console.log('════════════════════════════════════════════════════════════');
    console.log(rawKey);
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Đội app voucher gắn key này vào header MỌI request:');
    console.log(`  X-API-Key: ${rawKey}`);
    console.log('');
    console.log('Ví dụ gọi thử:');
    console.log(`  curl -X POST https://<host>/api/v1/vouchers/check \\`);
    console.log(`    -H "X-API-Key: ${rawKey}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"voucherCode": "ABC123456789", "scanMethod": "TEST"}'`);
    console.log('');
    console.log('Xem đầy đủ hợp đồng API (check/redeem, mã lỗi) ở api-voucher-check-redeem.md mục 2-3,');
    console.log('hoặc gửi file api-voucher-check-redeem-gui-doi-tac.md cho đối tác (bản KHÔNG có chi tiết nội bộ).');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
