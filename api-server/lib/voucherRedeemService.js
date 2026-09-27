// lib/voucherRedeemService.js — API check/redeem cho app "HCRC Voucher
// Redemption" (xem api-voucher-check-redeem.md) — api-server đóng vai trò
// "Core API" mà tài liệu app đó gọi tới, đọc/ghi TRỰC TIẾP bảng thật của
// DSMART16 (Live) — KHÔNG qua Data Warehouse.
//
// Bảng/cột CỐ ĐỊNH trong code (PMCRDINF: CARD_ID/BARCODE/VALUE_AMT/BAL_AMT/
// STATUS/DUE_DATE/ISS_DATE/STK_ID — xem hướng_dẫn_báo_cáo.md mục 13, đã xác
// nhận với người dùng: STATUS=1 là CHƯA thu hồi, STATUS=0/khác 1 là ĐÃ thu
// hồi) — KHÔNG cấu hình linh hoạt qua UI như RealtimeEndpointDefs/
// RealtimeWriteEndpointDefs, vì hợp đồng JSON của app voucher đã cố định sẵn
// theo tài liệu app đó, không cần tổng quát hoá. Chỉ CHỌN NGUỒN (api.
// DataSources nào trỏ DSMART16 Live) là cấu hình được, qua api.VoucherSettings
// (1 dòng, xem routes/admin/voucherSettings.js).
//
// KHÔNG có local cache/hàng đợi retry như tài liệu app gốc mô tả (app đó có
// DB riêng + Core API riêng) — ở đây api-server LÀ nguồn duy nhất, mỗi lượt
// check/redeem đọc/ghi thẳng DSMART16, mất kết nối thì báo lỗi ngay (đã xác
// nhận với người dùng, không xây hàng đợi đồng bộ lại).
//
// redeemVoucher() CHỈ đổi STATUS (như quyết định cũ ở mục 13, KHÔNG ghi
// PMCRDRCV) — nhưng PMCRDINF không có cột "ngày đã dùng", nên ghi thêm 1
// dòng vào api.VoucherRedemptions (bảng CỦA HCRC, không đụng schema DSMART16)
// để giữ mốc thời gian — nguồn DUY NHẤT cho phần "đã dùng" của báo cáo
// voucher (bc-voucher.md khối C). Xác nhận với người dùng: hiện tại CHỈ CÓ 1
// kênh redeem (app này).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

const TABLE = 'PMCRDINF';
const KEY_COL = 'BARCODE';
const STATUS_COL = 'STATUS';
const USED_VALUE = 0; // đã xác nhận: 0 = đã thu hồi/đã dùng, 1 = chưa thu hồi

class ConfigError extends Error {}
class NotFoundError extends Error {}

// STATUS đã đổi thật (không lùi lại được) nhưng KHÔNG ghi được dòng vào
// api.VoucherRedemptions (mất kết nối CSDL ADMIN đúng lúc, timeout...) — xem
// redeemVoucher() bên dưới. Đây LÀ tình huống "Core đã xác nhận thu hồi
// THÀNH CÔNG nhưng hệ thống ghi nhận cục bộ bị lỗi" mà tài liệu app voucher
// gốc mô tả (mục mã lỗi 500) — route (routes/v1/vouchers.js) bắt riêng lớp
// này để trả đúng cảnh báo "KHÔNG quét lại mã này", KHÔNG để rơi vào lỗi
// 500 chung chung.
class RedeemAuditFailedError extends Error {
  constructor(message, { barcode, transNum, valueAmt, redeemedAt }) {
    super(message);
    this.barcode = barcode;
    this.transNum = transNum;
    this.valueAmt = valueAmt;
    this.redeemedAt = redeemedAt;
  }
}

async function loadDataSourceId() {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().query('SELECT DataSourceId FROM api.VoucherSettings WHERE Id = 1');
  const dataSourceId = result.recordset[0]?.DataSourceId;
  if (!dataSourceId) {
    throw new ConfigError('Chưa cấu hình Nguồn dữ liệu cho Voucher — vào api-admin → "Cấu hình Voucher" chọn đúng Nguồn dữ liệu trỏ DSMART16 (Live)');
  }
  return dataSourceId;
}

// yyMMddHHmmss (giờ UTC — cùng mốc với RedeemedAt lưu ở
// api.VoucherRedemptions, DEFAULT SYSUTCDATETIME()) + 6 ký tự ngẫu nhiên viết
// hoa — api-server tự sinh, KHÔNG phải số giao dịch thật của DSMART16 (không
// ghi PMCRDRCV, xem chú thích đầu file).
function generateTransNum(date) {
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${stamp}${suffix}`;
}

// Đọc trạng thái 1 voucher — KHÔNG làm thay đổi gì (chỉ SELECT). Trả
// {canRedeem, status: 'UNUSED'|'USED'|'INVALID', ...}.
async function checkVoucher(barcode) {
  const dataSourceId = await loadDataSourceId();
  const pool = await getPoolForDataSource(dataSourceId);
  const result = await pool.request()
    .input('barcode', sql.NVarChar(24), barcode)
    .query(`SELECT TOP 1 CARD_ID, BARCODE, VALUE_AMT, BAL_AMT, ${STATUS_COL}, DUE_DATE, ISS_DATE, STK_ID FROM ${TABLE} WHERE ${KEY_COL} = @barcode`);

  const row = result.recordset[0];
  if (!row) {
    return { canRedeem: false, status: 'INVALID', message: 'Voucher khong hop le hoac khong ton tai.' };
  }
  if (Number(row[STATUS_COL]) === USED_VALUE) {
    return { canRedeem: false, status: 'USED', message: 'Voucher nay da duoc su dung. Vui long quet ma voucher khac.' };
  }
  // voucherSerial: PMCRDINF không có cột "số serial" riêng — dùng tạm
  // CARD_ID (mã thẻ/voucher gốc, xem hướng_dẫn_báo_cáo.md mục 13). Đối
  // chiếu lại với team app nếu họ cần đúng 1 mã serial khác.
  return {
    canRedeem: true,
    status: 'UNUSED',
    voucherSerial: row.CARD_ID != null ? String(row.CARD_ID) : null,
    valueAmt: row.VALUE_AMT,
    issueDate: row.ISS_DATE,
    expiryDate: row.DUE_DATE
  };
}

// Đổi STATUS 1(chưa dùng) -> 0(đã dùng) — atomic (UPDATE...OUTPUT...WHERE,
// cùng kỹ thuật đã kiểm chứng ở lib/realtimeWriteEngine.js:runRedeem) + ghi
// api.VoucherRedemptions. Trả {result: 'redeemed'|'alreadyUsed'|'notFound', ...}.
async function redeemVoucher(barcode, consumerId) {
  const dataSourceId = await loadDataSourceId();
  const pool = await getPoolForDataSource(dataSourceId);

  const now = new Date();
  const updateResult = await pool.request()
    .input('barcode', sql.NVarChar(24), barcode)
    .input('usedValue', sql.Int, USED_VALUE)
    .query(`
      UPDATE ${TABLE} SET ${STATUS_COL} = @usedValue
      OUTPUT INSERTED.VALUE_AMT AS ValueAmt, INSERTED.STK_ID AS StkId
      WHERE ${KEY_COL} = @barcode AND (${STATUS_COL} <> @usedValue OR ${STATUS_COL} IS NULL)
    `);

  if (updateResult.recordset.length > 0) {
    const { ValueAmt, StkId } = updateResult.recordset[0];
    const transNum = generateTransNum(now);
    const redeemedAt = now.toISOString();

    // STATUS đã đổi thật ở trên (không lùi lại được) — bước ghi audit này là
    // CSDL/kết nối KHÁC (pool 'ADMIN', xem chú thích đầu file). Không có
    // giao dịch chung bao trùm được cả 2 (2 máy chủ SQL Server khác nhau).
    // Thử lại vài lần để thu hẹp cửa sổ rủi ro (mất kết nối tạm thời) trước
    // khi coi là thất bại thật — mất dòng audit nghĩa là mất mốc "ngày đã
    // dùng" DUY NHẤT của voucher này (PMCRDINF không có cột này).
    const INSERT_RETRY_ATTEMPTS = 3;
    let lastErr;
    for (let attempt = 1; attempt <= INSERT_RETRY_ATTEMPTS; attempt++) {
      try {
        const adminPool = await getPool('ADMIN');
        await adminPool.request()
          .input('barcode', sql.VarChar(24), barcode)
          .input('stkId', sql.VarChar(50), StkId != null ? String(StkId) : null)
          .input('valueAmt', sql.Decimal(18, 2), ValueAmt)
          .input('transNum', sql.VarChar(50), transNum)
          .input('consumerId', sql.Int, consumerId || null)
          .query(`
            INSERT INTO api.VoucherRedemptions (Barcode, StkId, ValueAmt, TransNum, ConsumerId)
            VALUES (@barcode, @stkId, @valueAmt, @transNum, @consumerId)
          `);
        return { result: 'redeemed', transNum, valueAmt: ValueAmt, redeemedAt };
      } catch (err) {
        lastErr = err;
        if (attempt < INSERT_RETRY_ATTEMPTS) await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }

    console.error(`🚨 [voucher] STATUS đã đổi thật cho barcode "${barcode}" (transNum ${transNum}) NHƯNG ghi api.VoucherRedemptions thất bại sau ${INSERT_RETRY_ATTEMPTS} lần thử — mất mốc thời gian đã dùng, cần đối soát tay. Lỗi gốc: ${lastErr.message}`);
    throw new RedeemAuditFailedError(
      'Voucher đã được xác nhận thu hồi THÀNH CÔNG nhưng hệ thống ghi nhận cục bộ bị lỗi. KHÔNG quét lại mã này — vui lòng báo quản trị viên để đối soát thủ công.',
      { barcode, transNum, valueAmt: ValueAmt, redeemedAt }
    );
  }

  // Không đổi dòng nào — phân biệt KHÔNG TỒN TẠI (404) với ĐÃ ở đúng
  // USED_VALUE từ trước (idempotent/race thua, không báo lỗi 500).
  const checkResult = await pool.request()
    .input('barcode', sql.NVarChar(24), barcode)
    .query(`SELECT ${STATUS_COL} FROM ${TABLE} WHERE ${KEY_COL} = @barcode`);
  if (!checkResult.recordset.length) return { result: 'notFound' };
  return { result: 'alreadyUsed' };
}

module.exports = { checkVoucher, redeemVoucher, ConfigError, NotFoundError, RedeemAuditFailedError };
