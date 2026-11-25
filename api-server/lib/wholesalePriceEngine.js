// lib/wholesalePriceEngine.js — Ghi/xoá giá bán buôn (CSPRICE) hộ đối tác
// "Hệ thống Văn phòng số HCRC (HCC)", qua 3 endpoint routes/v1/wholesalePrice.js
// (/wholesale-price/apply, /wholesale-price/delete, /ping) — thay cho việc
// đối tác tự kết nối SQL Server trực tiếp xuống HO (DSmart16) VÀ từng siêu
// thị như trước (xem Yeu-Cau-API-Gia-Ban-Buon-DSmart*.docx, đối tác cung
// cấp). LUÔN ghi/xoá CẢ HO lẫn đúng các siêu thị trong storeScope — HO
// KHÔNG phụ thuộc storeScope (theo xác nhận người dùng, vì tài liệu gốc mô
// tả hệ thống cũ ghi CẢ HO lẫn fan-out từng siêu thị, không phụ thuộc lựa
// chọn phạm vi siêu thị nào).
//
// Câu lệnh SQL ghi CSPRICE (cột/giá trị cố định TYPE='04'/VAT_INCL=1/
// STATUS=1, cách tra đơn vị/hệ số quy đổi/mã thuế từ SKU_DEF) lấy NGUYÊN
// VĂN từ "Tham Khảo: Câu Lệnh SQL Ghi Vào CSPRICE" do đối tác cung cấp —
// KHÔNG tự đoán cột/giá trị. CHỈ thêm lớp an toàn OUTPUT...INTO (xem dưới).
//
// OUTPUT INSERTED.../DELETED... KHÔNG dùng INTO ngay ra client — SQL Server
// CẤM cú pháp này nếu bảng đích đang có BẤT KỲ trigger nào đang bật (lỗi
// thật đã gặp ở lib/voucherRedeemService.js bản 10.15: "The target table
// ... cannot have any enabled triggers if the statement contains an OUTPUT
// clause without INTO clause" — CSDL 1 vài siêu thị CÓ bật trigger trên
// bảng vận hành dù CSDL gốc không có). CSPRICE là bảng ERP/DSmart gốc của
// TỪNG siêu thị, không có cách nào biết trước siêu thị nào có trigger —
// LUÔN dùng `OUTPUT ... INTO @bảng_biến_tạm` vô điều kiện để né giới hạn
// này hoàn toàn, giống đúng cách đã sửa ở voucherRedeemService.js/
// realtimeWriteEngine.js, KHÔNG đổi ý nghĩa dữ liệu so với SQL gốc đối tác
// gửi (chỉ đổi NƠI OUTPUT ghi tạm, vẫn đọc lại y hệt số dòng/khoá vừa ghi).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

class ValidationError extends Error {} // lỗi DO DỮ LIỆU đầu vào — 400
class SkuNotFoundError extends Error {} // lỗi DO DỮ LIỆU (skuId không có trong danh mục/thiếu dữ liệu) — 400
class StoreConfigError extends Error {} // lỗi HỆ THỐNG phía mình (chưa cấu hình nguồn dữ liệu cho siêu thị/HO) — 502
class IntegrityError extends Error {} // lỗi HỆ THỐNG (khớp nhiều hơn 1 dòng — không nên xảy ra) — 500

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HO_STORE_CODE = 'HO'; // StoreCode dành riêng cho dòng api.DataSources của HO (DSmart16 Trung Tâm)

function assertNonEmptyString(value, field, maxLen) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`Thiếu ${field}`);
  if (value.length > maxLen) throw new ValidationError(`${field} vượt quá ${maxLen} ký tự`);
  return value.trim();
}

function assertDate(value, field) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new ValidationError(`${field} phải đúng định dạng YYYY-MM-DD`);
  }
  return value;
}

function validateStoreScope(storeScope) {
  if (!storeScope || typeof storeScope !== 'object') throw new ValidationError('Thiếu storeScope');
  if (storeScope.mode !== 'ALL' && storeScope.mode !== 'SPECIFIC') {
    throw new ValidationError('storeScope.mode phải là "ALL" hoặc "SPECIFIC"');
  }
  if (!Array.isArray(storeScope.storeCodes)) throw new ValidationError('storeScope.storeCodes phải là mảng chuỗi');
  const storeCodes = storeScope.storeCodes.map(c => String(c).trim()).filter(Boolean);
  return { mode: storeScope.mode, storeCodes };
}

function validateApplyInput(body) {
  const custId = assertNonEmptyString(body?.custId, 'custId', 50);
  const skuId = assertNonEmptyString(body?.skuId, 'skuId', 50);
  const price = Number(body?.price);
  if (!Number.isFinite(price) || price < 0) throw new ValidationError('price phải là số không âm');
  const frDate = assertDate(body?.frDate, 'frDate');
  const toDate = assertDate(body?.toDate, 'toDate');
  if (frDate > toDate) throw new ValidationError('frDate phải <= toDate');
  const storeScope = validateStoreScope(body?.storeScope);
  return { custId, skuId, price, frDate, toDate, storeScope };
}

function validateDeleteInput(body) {
  const custId = assertNonEmptyString(body?.custId, 'custId', 50);
  const skuId = assertNonEmptyString(body?.skuId, 'skuId', 50);
  const storeScope = validateStoreScope(body?.storeScope);
  return { custId, skuId, storeScope };
}

// Bản 11.23 (theo tài liệu "Yêu Cầu API Giá Bán Buôn DSmart 2.docx" đối
// tác gửi — mục "wholesale-price/validate", thay cho endpoint
// "dealer/:custId" bản 11.22 KHÔNG đúng khuôn đối tác cần) — custIds/
// skuIds mỗi cái là mảng chuỗi, CHO PHÉP RỖNG/thiếu 1 trong 2 (đối tác có
// thể chỉ cần kiểm tra riêng custId hoặc riêng skuId 1 lượt), nhưng PHẢI
// có ÍT NHẤT 1 mã ở 1 trong 2 mảng — gọi mà cả 2 rỗng không có ý nghĩa gì.
// Giới hạn 500 mã/mảng — đủ cho 1 lượt "xem trước file tải lên" thông
// thường, tránh IN(...) quá dài nếu lỡ gửi nhầm cả danh sách khổng lồ.
const MAX_VALIDATE_IDS = 500;
function assertIdArray(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} phải là mảng chuỗi`);
  if (value.length > MAX_VALIDATE_IDS) throw new ValidationError(`${field} vượt quá ${MAX_VALIDATE_IDS} mã mỗi lượt gọi`);
  return value.map((v, i) => assertNonEmptyString(String(v), `${field}[${i}]`, 50));
}
function validateValidateInput(body) {
  const custIds = assertIdArray(body?.custIds, 'custIds');
  const skuIds = assertIdArray(body?.skuIds, 'skuIds');
  if (!custIds.length && !skuIds.length) throw new ValidationError('Thiếu custIds/skuIds — phải có ít nhất 1 mã ở 1 trong 2 mảng');
  return { custIds, skuIds };
}

// Trả { targets, missingStoreCodes } — targets LUÔN có HO ở vị trí đầu
// (StoreCode="HO", xem HO_STORE_CODE) + đúng các storeCodes tìm thấy cấu
// hình ở api.DataSources; missingStoreCodes là các storeCode KHÔNG tìm
// thấy dòng Nguồn dữ liệu tương ứng (báo lỗi riêng cho từng mã đó, không
// lẫn với lỗi ghi CSDL thật).
async function loadStoreDataSources(storeCodes) {
  const adminPool = await getPool('ADMIN');
  const codes = [HO_STORE_CODE, ...storeCodes];
  const request = adminPool.request();
  const placeholders = codes.map((code, i) => {
    request.input(`c${i}`, sql.NVarChar(50), code);
    return `@c${i}`;
  });
  const result = await request.query(`
    SELECT Id, StoreCode FROM api.DataSources WHERE IsActive = 1 AND StoreCode IN (${placeholders.join(',')})
  `);
  const byCode = new Map(result.recordset.map(r => [r.StoreCode, r.Id]));

  if (!byCode.has(HO_STORE_CODE)) {
    throw new StoreConfigError(`Chưa cấu hình Nguồn dữ liệu cho HO (StoreCode="${HO_STORE_CODE}") ở trang "Nguồn dữ liệu"`);
  }
  const targets = [{ storeCode: HO_STORE_CODE, dataSourceId: byCode.get(HO_STORE_CODE) }];
  const missingStoreCodes = [];
  for (const code of storeCodes) {
    if (byCode.has(code)) targets.push({ storeCode: code, dataSourceId: byCode.get(code) });
    else missingStoreCodes.push(code);
  }
  return { targets, missingStoreCodes };
}

// Tra đơn vị tính/hệ số quy đổi/mã thuế theo skuId TRÊN ĐÚNG pool của 1 mục
// tiêu (HO hoặc 1 siêu thị) — SKU_DEF là danh mục RIÊNG từng nơi, không tra
// 1 lần dùng chung cho mọi target.
async function lookupSkuUnitInfo(pool, skuId) {
  const result = await pool.request().input('skuId', sql.NVarChar(50), skuId)
    .query('SELECT PICEUNIT, UNITCONV, TAX_CODE FROM dbo.SKU_DEF WHERE SKU_ID = @skuId');
  const row = result.recordset[0];
  if (!row || row.PICEUNIT == null || row.UNITCONV == null || row.TAX_CODE == null) {
    throw new SkuNotFoundError(`skuId "${skuId}" không tồn tại trong SKU_DEF hoặc thiếu Đơn vị tính/Hệ số quy đổi/Mã thuế`);
  }
  return { unit: row.PICEUNIT, unitConv: row.UNITCONV, taxCode: row.TAX_CODE };
}

// Ghi (upsert) giá bán buôn trên ĐÚNG 1 pool — trả { overwritten }.
async function applyPriceOnPool(pool, { custId, skuId, price, frDate, toDate }) {
  const { unit, unitConv, taxCode } = await lookupSkuUnitInfo(pool, skuId);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const updateResult = await new sql.Request(tx)
      .input('custId', sql.NVarChar(50), custId)
      .input('skuId', sql.NVarChar(50), skuId)
      .input('unit', unit)
      .input('unitConv', unitConv)
      .input('price', sql.Decimal(18, 2), price)
      .input('taxCode', taxCode)
      .input('frDate', sql.VarChar(10), frDate)
      .input('toDate', sql.VarChar(10), toDate)
      .query(`
        DECLARE @Updated TABLE (CustId NVARCHAR(50), SkuId NVARCHAR(50));
        UPDATE dbo.CSPRICE
        SET TYPE = '04', UNIT_SYMB = @unit, BASE_UNIT = @unit, UNITCONV = @unitConv,
            LASTWSPR = WSPRICE, WSPRICE = @price,
            VAT_INCL = 1, TAX_CODE = @taxCode, STATUS = 1, FR_DATE = @frDate, TO_DATE = @toDate,
            MODI_DATE = GETDATE(), OPEN_DATE = GETDATE()
        OUTPUT INSERTED.CUST_ID, INSERTED.SKU_ID INTO @Updated
        WHERE CUST_ID = @custId AND SKU_ID = @skuId;
        SELECT CustId, SkuId FROM @Updated;
      `);

    if (updateResult.recordset.length > 1) {
      throw new IntegrityError(`Khớp ${updateResult.recordset.length} dòng CSPRICE cho (custId="${custId}", skuId="${skuId}") — vượt quá 1, dừng để tránh ghi sai`);
    }
    if (updateResult.recordset.length === 1) {
      await tx.commit();
      return { overwritten: true };
    }

    // UPDATE khớp 0 dòng — chưa có giá, INSERT dòng mới.
    const insertResult = await new sql.Request(tx)
      .input('custId', sql.NVarChar(50), custId)
      .input('skuId', sql.NVarChar(50), skuId)
      .input('unit', unit)
      .input('unitConv', unitConv)
      .input('price', sql.Decimal(18, 2), price)
      .input('taxCode', taxCode)
      .input('frDate', sql.VarChar(10), frDate)
      .input('toDate', sql.VarChar(10), toDate)
      .query(`
        DECLARE @Inserted TABLE (CustId NVARCHAR(50), SkuId NVARCHAR(50));
        INSERT INTO dbo.CSPRICE (CUST_ID, TYPE, SKU_ID, UNIT_SYMB, BASE_UNIT, UNITCONV, WSPRICE, VAT_INCL, TAX_CODE, OPEN_DATE, MODI_DATE, STATUS, FR_DATE, TO_DATE)
        OUTPUT INSERTED.CUST_ID, INSERTED.SKU_ID INTO @Inserted
        VALUES (@custId, '04', @skuId, @unit, @unit, @unitConv, @price, 1, @taxCode, GETDATE(), GETDATE(), 1, @frDate, @toDate);
        SELECT CustId, SkuId FROM @Inserted;
      `);
    if (insertResult.recordset.length !== 1) {
      throw new IntegrityError(`INSERT CSPRICE không trả đúng 1 dòng cho (custId="${custId}", skuId="${skuId}")`);
    }
    await tx.commit();
    return { overwritten: false };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// Xoá giá bán buôn trên ĐÚNG 1 pool — trả { alreadyGone }. Khớp 0 dòng
// KHÔNG phải lỗi (coi như đã đạt mục tiêu "không còn giá này", theo đúng
// yêu cầu đối tác).
async function deletePriceOnPool(pool, { custId, skuId }) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await new sql.Request(tx)
      .input('custId', sql.NVarChar(50), custId)
      .input('skuId', sql.NVarChar(50), skuId)
      .query(`
        DECLARE @Deleted TABLE (CustId NVARCHAR(50));
        DELETE FROM dbo.CSPRICE
        OUTPUT DELETED.CUST_ID INTO @Deleted
        WHERE CUST_ID = @custId AND SKU_ID = @skuId;
        SELECT CustId FROM @Deleted;
      `);
    if (result.recordset.length > 1) {
      throw new IntegrityError(`Khớp ${result.recordset.length} dòng CSPRICE cho (custId="${custId}", skuId="${skuId}") lúc xoá — vượt quá 1, dừng để tránh xoá nhầm`);
    }
    await tx.commit();
    return { alreadyGone: result.recordset.length === 0 };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// Chạy applyPriceOnPool/deletePriceOnPool trên NHIỀU target (HO + các siêu
// thị trong storeScope) song song, best-effort — 1 target lỗi không chặn
// các target khác. Trả { results, allOk } — results theo đúng thứ tự
// targets, mỗi phần tử { storeCode, ok, overwritten?/alreadyGone?, error?, kind? }.
async function runOnAllTargets(targets, fn) {
  const settled = await Promise.allSettled(targets.map(async (t) => {
    const pool = await getPoolForDataSource(t.dataSourceId);
    return fn(pool, t);
  }));
  const results = settled.map((s, i) => {
    const storeCode = targets[i].storeCode;
    if (s.status === 'fulfilled') return { storeCode, ok: true, ...s.value };
    const err = s.reason;
    const kind = (err instanceof ValidationError || err instanceof SkuNotFoundError) ? 'data' : 'system';
    return { storeCode, ok: false, error: err.message, kind };
  });
  return { results, allOk: results.every(r => r.ok) };
}

// Bản 11.23 (ĐÚNG theo tài liệu "Yêu Cầu API Giá Bán Buôn DSmart
// 2.docx" đối tác gửi, mục "wholesale-price/validate" — THAY cho
// lookupDealer() bản 11.22, sai khuôn đối tác cần) — kiểm tra HÀNG LOẠT
// custId/skuId cùng lúc, dùng lúc đối tác "xem trước file tải lên" TRƯỚC
// khi gọi apply, không còn tự mở kết nối SQL trực tiếp xuống DSMART16.
//
// custId hợp lệ = tồn tại trong dbo.DEALER VÀ BLOCK_CODE = 0 (ĐÚNG 2 điều
// kiện đối tác nêu rõ — chỉ tồn tại thôi CHƯA ĐỦ, khách bị khoá
// (BLOCK_CODE <> 0) vẫn phải báo KHÔNG hợp lệ).
// skuId hợp lệ = tồn tại trong dbo.SKU_DEF (bảng ĐÃ dùng sẵn ở
// lookupSkuUnitInfo() — cùng 1 nguồn, không cần bảng mới).
//
// Cả 2 TRÊN ĐÚNG pool HO (DEALER/SKU_DEF là bảng CHUNG, không theo từng
// siêu thị — dùng lại NGUYÊN kết nối HO đã cấu hình sẵn cho apply/delete).
async function validateCustIds(pool, custIds) {
  const results = {};
  if (!custIds.length) return results;
  const request = pool.request();
  const placeholders = custIds.map((id, i) => {
    request.input(`c${i}`, sql.NVarChar(50), id);
    return `@c${i}`;
  });
  const rows = await request.query(`SELECT CUST_ID, BLOCK_CODE FROM dbo.DEALER WHERE CUST_ID IN (${placeholders.join(',')})`);
  const byId = new Map(rows.recordset.map(r => [r.CUST_ID, r.BLOCK_CODE]));
  for (const id of custIds) {
    if (!byId.has(id)) {
      results[id] = { valid: false, reason: `custId "${id}" không tồn tại trong danh mục khách hàng (DEALER)` };
    } else if (Number(byId.get(id)) !== 0) {
      results[id] = { valid: false, reason: `custId "${id}" đã bị khoá (BLOCK_CODE khác 0)` };
    } else {
      results[id] = { valid: true };
    }
  }
  return results;
}

async function validateSkuIds(pool, skuIds) {
  const results = {};
  if (!skuIds.length) return results;
  const request = pool.request();
  const placeholders = skuIds.map((id, i) => {
    request.input(`s${i}`, sql.NVarChar(50), id);
    return `@s${i}`;
  });
  const rows = await request.query(`SELECT SKU_ID FROM dbo.SKU_DEF WHERE SKU_ID IN (${placeholders.join(',')})`);
  const found = new Set(rows.recordset.map(r => r.SKU_ID));
  for (const id of skuIds) {
    results[id] = found.has(id)
      ? { valid: true }
      : { valid: false, reason: `skuId "${id}" không tồn tại trong danh mục hàng hoá (SKU_DEF)` };
  }
  return results;
}

module.exports = {
  ValidationError, SkuNotFoundError, StoreConfigError, IntegrityError,
  validateApplyInput, validateDeleteInput, validateValidateInput,
  loadStoreDataSources, applyPriceOnPool, deletePriceOnPool, runOnAllTargets,
  validateCustIds, validateSkuIds,
  HO_STORE_CODE
};
