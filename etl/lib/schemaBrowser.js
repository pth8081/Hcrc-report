// lib/schemaBrowser.js — Duyệt bảng/cột/khoá ngoại THẬT của một nguồn đã
// đăng ký, dùng cho bước "chọn bảng" trên etl-admin/ (xem tài liệu kiến trúc
// "Quản Trị ETL HCRC", mục 03). Không cache — luôn hỏi trực tiếp nguồn để
// chắc chắn đúng thời điểm cấu hình. Tài khoản chỉ đọc là đủ: catalog view
// của cả MSSQL và MySQL/MariaDB chỉ hiện bảng mà tài khoản đang kết nối có
// quyền SELECT.
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
