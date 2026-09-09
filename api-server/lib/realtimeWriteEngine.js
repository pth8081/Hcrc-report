// lib/realtimeWriteEngine.js — Chạy 1 endpoint GHI ngược lại nguồn dữ liệu
// vận hành (api.RealtimeWriteEndpointDefs, admin tự tạo qua api-admin/,
// không cần code — xem routes/admin/realtimeWriteEndpoints.js). ĐÂY LÀ
// ĐƯỜNG DUY NHẤT trong toàn hệ thống được phép UPDATE ngược lại nguồn (ETL,
// lib/realtimeEngine.js đọc, mọi báo cáo khác đều CHỈ ĐỌC) — dùng cho việc
// đối tác ngoài báo "đã dùng" (vd voucher dùng 1 lần là thu luôn, xác nhận
// với người dùng — xem hướng_dẫn_báo_cáo.md mục 13).
//
// CHỈ hỗ trợ đúng 1 kiểu thao tác: đổi 1 CỘT TRẠNG THÁI của ĐÚNG 1 dòng
// (khớp KeyColumn) sang giá trị cố định (UsedValue) — không phải engine ghi
// tổng quát, không cập nhật nhiều cột, không cộng/trừ số dư.
//
// Tên bảng/cột đến từ lib/schemaBrowser.js (dropdown trên api-admin/), đối
// chiếu lại với schema thật lúc LƯU (assertSchemaMatches trong
// routes/admin/realtimeWriteEndpoints.js) — nhưng đó chỉ 1 lần lúc lưu,
// assertSafeIdentifier dưới đây vẫn là LỚP CHỐNG CHÈN SQL DUY NHẤT áp dụng
// lúc CHẠY (giống hệt lib/realtimeEngine.js — cố tình không import chéo,
// mỗi engine tự chứa đủ khi copy riêng lên máy chủ triển khai).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

const IDENT_RE = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(name) {
  if (!IDENT_RE.test(name)) throw new Error(`Tên không hợp lệ trong cấu hình endpoint ghi: "${name}"`);
  return name;
}

function quoteIdent(name) {
  return `[${assertSafeIdentifier(name)}]`;
}

class NotFoundError extends Error {}

async function loadEndpointDef(endpoint) {
  const adminPool = await getPool('ADMIN');
  const result = await adminPool.request().input('endpoint', sql.VarChar(50), endpoint).query(`
    SELECT Endpoint, DataSourceId, SchemaName, TableName, KeyColumn, StatusColumn, UsedValue
    FROM api.RealtimeWriteEndpointDefs WHERE Endpoint = @endpoint AND IsActive = 1
  `);
  if (!result.recordset.length) throw new NotFoundError(`Endpoint ghi "${endpoint}" không tồn tại hoặc đã tắt`);
  return result.recordset[0];
}

// Trả { result: 'updated' | 'alreadyUsed' | 'notFound' }. 1 câu UPDATE DUY
// NHẤT có điều kiện StatusColumn <> UsedValue (hoặc NULL, chưa từng đặt)
// NGAY TRONG WHERE — atomic ở tầng CSDL, 2 request cùng lúc cho cùng 1 khoá
// (đối tác gọi trùng do thử lại) CHỈ 1 request đổi được dòng, request còn
// lại rơi vào nhánh "không đổi dòng nào" bên dưới — không có cửa sổ race
// giữa "đọc trạng thái" và "ghi trạng thái" như cách làm SELECT rồi mới
// UPDATE riêng 2 câu lệnh.
async function runRedeem(endpoint, keyValue) {
  const def = await loadEndpointDef(endpoint);
  const pool = await getPoolForDataSource(def.DataSourceId);
  const table = `${quoteIdent(def.SchemaName)}.${quoteIdent(def.TableName)}`;
  const keyCol = quoteIdent(def.KeyColumn);
  const statusCol = quoteIdent(def.StatusColumn);

  const updateRequest = pool.request();
  updateRequest.input('keyValue', sql.NVarChar(200), String(keyValue));
  updateRequest.input('usedValue', sql.NVarChar(50), def.UsedValue);
  const updateResult = await updateRequest.query(`
    UPDATE ${table} SET ${statusCol} = @usedValue
    OUTPUT INSERTED.${keyCol} AS KeyValue
    WHERE ${keyCol} = @keyValue AND (${statusCol} <> @usedValue OR ${statusCol} IS NULL)
  `);
  if (updateResult.recordset.length > 0) return { result: 'updated' };

  // Không đổi dòng nào — phân biệt KHÔNG TỒN TẠI khoá (404) với ĐÃ ở đúng
  // UsedValue từ trước (idempotent, gọi trùng không báo lỗi).
  const checkRequest = pool.request();
  checkRequest.input('keyValue', sql.NVarChar(200), String(keyValue));
  const checkResult = await checkRequest.query(`SELECT ${statusCol} AS CurrentStatus FROM ${table} WHERE ${keyCol} = @keyValue`);
  if (!checkResult.recordset.length) return { result: 'notFound' };
  return { result: 'alreadyUsed' };
}

module.exports = { runRedeem, loadEndpointDef, assertSafeIdentifier, NotFoundError };
