// lib/voucherRedeemedFeedService.js — "Danh sách voucher đã thu hồi (feed
// cho đối tác)" (bản 10.7, theo yêu cầu người dùng): thay vì đối tác tự
// quét/so sánh danh sách đầy đủ mỗi lần (như GET /realtime/voucher-redeemed/
// list đã có, xem api-voucher-redeemed-gui-doi-tac.md mục 2 — không có mốc
// thời gian, đối tác phải tự đối soát CARD_ID), đối tác chạy 1 JOB ĐỊNH KỲ
// gọi GET /vouchers/[:configKey/]redeemed/since?sinceId=<Id lần trước> —
// CHỈ nhận những voucher MỚI thu hồi kể từ lần gọi trước, dùng con trỏ
// (cursor) là Id tăng dần, KHÔNG dùng mốc thời gian (tránh lỗi đếm trùng/bỏ
// sót khi nhiều dòng cùng 1 giây — xem queryRedeemedFeed() bên dưới).
//
// NGUỒN DỮ LIỆU — DÙNG LẠI NGUYÊN VẸN api.VoucherRedemptions (đã có sẵn từ
// trước, xem api-db/schema.sql — ghi 1 dòng MỖI LẦN POST /vouchers/redeem
// thành công, có sẵn Id IDENTITY tăng dần + index theo RedeemedAt/Barcode)
// — KHÔNG tạo bảng mới. Bảng này vốn chỉ dùng cho báo cáo nội bộ
// (bc-voucher.md khối C), giờ TÁI DÙNG làm nguồn "since" cho đối tác.
//
// RECONCILE (hàm reconcileOrphanRedemptions() bên dưới) — xử lý 2 lỗ hổng
// ĐÃ BIẾT khiến api.VoucherRedemptions có thể THIẾU 1 vài dòng dù PMCRDINF
// đã đổi STATUS=0 thật:
//   1. RedeemAuditFailedError (xem lib/voucherRedeemService.js) — STATUS đã
//      đổi thật nhưng INSERT api.VoucherRedemptions thất bại sau 3 lần thử
//      (mất kết nối CSDL ADMIN đúng lúc) — "voucher mồ côi" không có dòng
//      audit.
//   2. Voucher ĐÃ thu hồi TỪ TRƯỚC khi api.VoucherRedemptions tồn tại (dữ
//      liệu lịch sử) — cũng không có dòng tương ứng.
// Chạy ĐỊNH KỲ mỗi 15 phút (xem server.js): với MỖI api.VoucherSettings có
// DataSourceId, quét PMCRDINF STATUS=0, voucher nào CHƯA có dòng trong
// api.VoucherRedemptions (đúng ConfigKey) thì CHÈN THÊM 1 dòng, đánh dấu rõ
// TransNum='RECONCILED' + ConsumerId=NULL (phân biệt với dòng ghi THẬT lúc
// redeem — KHÔNG có transNum/consumerId thật vì không biết ai/giao dịch
// nào), RedeemedAt = THỜI ĐIỂM PHÁT HIỆN (không phải thời điểm thu hồi thật
// — không có cách nào biết chính xác hơn, PMCRDINF không lưu mốc này).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

const VOUCHER_TABLE = 'PMCRDINF';
const KEY_COL = 'CARD_ID';
const STATUS_COL = 'STATUS';
const USED_VALUE = 0;
const RECONCILED_TRANS_NUM = 'RECONCILED';

const DEFAULT_FIELDS = ['Barcode', 'ValueAmt', 'StkId', 'TransNum', 'RedeemedAt'];
const ALL_FIELDS = DEFAULT_FIELDS; // hiện tại trùng nhau — tách riêng để dễ mở rộng field mới sau mà không phải sửa 2 nơi

function parseAllowedFields(fieldsJson) {
  if (!fieldsJson) return DEFAULT_FIELDS;
  try {
    const parsed = JSON.parse(fieldsJson);
    const filtered = Array.isArray(parsed) ? parsed.filter(f => ALL_FIELDS.includes(f)) : [];
    return filtered.length ? filtered : DEFAULT_FIELDS;
  } catch {
    return DEFAULT_FIELDS; // JSON hỏng (không nên xảy ra, admin UI luôn gửi đúng) — fail-safe về mặc định, không chặn API
  }
}

// ConfigKey NULL ở api.VoucherRedemptions = dòng CŨ trước bản 9.59 (nhiều
// cấu hình) — TẤT CẢ đều thuộc 'default' (duy nhất lúc đó), nên khi tra
// configKey='default' phải gộp CẢ NULL lẫn 'default' mới đủ (xem
// routes/v1/vouchers.js:hasConfigAccess() áp dụng nguyên tắc 'default'
// tương tự).
function buildConfigKeyWhere(configKey) {
  return configKey === 'default' ? '(ConfigKey = @configKey OR ConfigKey IS NULL)' : 'ConfigKey = @configKey';
}

// Trả về trang kết quả + con trỏ kế tiếp. KHÔNG join lại PMCRDINF — mọi
// trường cần đều đã có sẵn trong chính api.VoucherRedemptions (ghi lúc
// redeem), tránh round-trip thêm sang DSMART16 mỗi lượt đối tác gọi.
async function queryRedeemedFeed({ configKey, sinceId, pageSize, allowedFields }) {
  const pool = await getPool('ADMIN');
  const where = buildConfigKeyWhere(configKey);
  const result = await pool.request()
    .input('configKey', sql.VarChar(50), configKey)
    .input('sinceId', sql.BigInt, sinceId)
    .input('pageSize', sql.Int, pageSize)
    .query(`
      SELECT TOP (@pageSize) Id, Barcode, ValueAmt, StkId, TransNum, RedeemedAt
      FROM api.VoucherRedemptions
      WHERE ${where} AND Id > @sinceId
      ORDER BY Id ASC
    `);
  const rows = result.recordset;
  const nextSinceId = rows.length ? rows[rows.length - 1].Id : sinceId;
  const hasMore = rows.length === pageSize; // trang đầy -> rất có thể còn trang sau, đối tác gọi tiếp bằng nextSinceId tới khi hasMore=false
  const mappedRows = rows.map(r => {
    const out = {};
    for (const field of allowedFields) out[field] = r[field];
    return out;
  });
  return {
    sinceId,
    nextSinceId,
    pageSize,
    hasMore,
    columns: allowedFields.map(f => ({ key: f, label: f })),
    rows: mappedRows
  };
}

// Danh sách CardId đã có dòng trong api.VoucherRedemptions cho ĐÚNG
// configKey đó (gộp NULL cho 'default', xem buildConfigKeyWhere) — dùng để
// biết barcode nào CHƯA có, tránh quét lại dòng đã ghi.
async function loadKnownBarcodes(adminPool, configKey) {
  const where = buildConfigKeyWhere(configKey);
  const result = await adminPool.request()
    .input('configKey', sql.VarChar(50), configKey)
    .query(`SELECT DISTINCT Barcode FROM api.VoucherRedemptions WHERE ${where}`);
  return new Set(result.recordset.map(r => r.Barcode));
}

async function reconcileOneConfig(adminPool, configRow) {
  const { ConfigKey, DataSourceId } = configRow;
  if (!DataSourceId) return 0; // chưa chọn Nguồn dữ liệu cho cấu hình này — bỏ qua, không phải lỗi
  const pool = await getPoolForDataSource(DataSourceId);
  const [usedResult, knownBarcodes] = await Promise.all([
    pool.request().input('usedValue', sql.Int, USED_VALUE)
      .query(`SELECT ${KEY_COL} AS CardId, VALUE_AMT AS ValueAmt, STK_ID AS StkId FROM ${VOUCHER_TABLE} WHERE ${STATUS_COL} = @usedValue`),
    loadKnownBarcodes(adminPool, ConfigKey)
  ]);

  const missing = usedResult.recordset.filter(r => r.CardId != null && !knownBarcodes.has(String(r.CardId)));
  for (const row of missing) {
    // INSERT từng dòng (số lượng "mồ côi" kỳ vọng RẤT ÍT — chỉ lỗi hiếm gặp
    // + lịch sử cũ 1 lần đầu nâng cấp — không cần tối ưu batch insert).
    await adminPool.request()
      .input('cardId', sql.VarChar(24), String(row.CardId))
      .input('stkId', sql.VarChar(50), row.StkId != null ? String(row.StkId) : null)
      .input('valueAmt', sql.Decimal(18, 2), row.ValueAmt)
      .input('transNum', sql.VarChar(50), RECONCILED_TRANS_NUM)
      .input('configKey', sql.VarChar(50), ConfigKey)
      .query(`
        INSERT INTO api.VoucherRedemptions (Barcode, StkId, ValueAmt, TransNum, ConsumerId, ConfigKey)
        SELECT @cardId, @stkId, @valueAmt, @transNum, NULL, @configKey
        WHERE NOT EXISTS (
          SELECT 1 FROM api.VoucherRedemptions
          WHERE Barcode = @cardId AND (ConfigKey = @configKey OR (@configKey = 'default' AND ConfigKey IS NULL))
        )
      `); // WHERE NOT EXISTS lặp lại (dù đã lọc ở knownBarcodes) — phòng 2 lượt job chạy chồng lấn (isSchedulerLeader() chỉ chặn nhiều WORKER, không chặn chồng lấn nếu job trước chạy quá 15 phút)
  }
  return missing.length;
}

async function reconcileOrphanRedemptions() {
  const adminPool = await getPool('ADMIN');
  const configs = (await adminPool.request()
    .query('SELECT ConfigKey, DataSourceId FROM api.VoucherSettings')).recordset;

  let totalReconciled = 0;
  for (const configRow of configs) {
    try {
      totalReconciled += await reconcileOneConfig(adminPool, configRow);
    } catch (err) {
      console.error(`⛔ Lỗi đối soát voucher "mồ côi" cho cấu hình "${configRow.ConfigKey}":`, err.message);
    }
  }
  return totalReconciled;
}

module.exports = { queryRedeemedFeed, reconcileOrphanRedemptions, parseAllowedFields, DEFAULT_FIELDS, ALL_FIELDS };
