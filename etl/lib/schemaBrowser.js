// lib/schemaBrowser.js — Duyệt bảng/VIEW/cột/khoá ngoại THẬT của một nguồn
// đã đăng ký, dùng cho bước "chọn bảng" trên etl-admin/ (xem tài liệu kiến
// trúc "Quản Trị ETL HCRC", mục 03). Không cache — luôn hỏi trực tiếp nguồn
// để chắc chắn đúng thời điểm cấu hình. Tài khoản chỉ đọc là đủ: catalog
// view của cả MSSQL và MySQL/MariaDB chỉ hiện bảng/VIEW mà tài khoản đang
// kết nối có quyền SELECT. Chọn VIEW hoạt động y hệt chọn bảng thật —
// tableSyncEngine.js dùng thẳng tên đã chọn làm FROM lúc đồng bộ, không có
// nhánh xử lý riêng cho VIEW (xem chú thích trong dbAdapters/mssql.js).
// listForeignKeys() thường trả rỗng cho VIEW (không có ràng buộc khoá ngoại
// thật) — bình thường, chỉ mất phần gợi ý tự động chọn bảng liên kết.
const { getConnection } = require('./dataSourcePool');

async function listTables(dataSourceId) {
  const { pool, adapter } = await getConnection(dataSourceId);
  return adapter.listTables(pool);
}

async function listColumns(dataSourceId, schemaName, tableName) {
  const { pool, adapter } = await getConnection(dataSourceId);
  return adapter.listColumns(pool, schemaName, tableName);
}

async function listForeignKeys(dataSourceId, schemaName, tableName) {
  const { pool, adapter } = await getConnection(dataSourceId);
  return adapter.listForeignKeys(pool, schemaName, tableName);
}

module.exports = { listTables, listColumns, listForeignKeys };
