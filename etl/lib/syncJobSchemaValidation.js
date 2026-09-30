// lib/syncJobSchemaValidation.js — Đối chiếu 1 cấu hình job Type='table' với
// schema THẬT của nguồn dữ liệu đã chọn (dùng chung lib/schemaBrowser.js với
// dropdown trên etl-admin/) — TÁCH RIÊNG khỏi routes/admin/syncJobs.js (bản
// 8.13) để lib/syncJobsImport.js (nhập hàng loạt qua Excel) dùng LẠI đúng
// logic này thay vì chép lại — tạo 1 job qua form hay qua Excel đều phải bị
// chặn giống hệt nhau nếu sai tên bảng/cột.
const schemaBrowser = require('./schemaBrowser');

async function assertTableConfigMatchesSchema(dataSourceId, schemaName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const tableExists = tables.some(t => t.schemaName === schemaName && t.tableName === tableName);
  if (!tableExists) throw new Error(`Bảng "${schemaName}.${tableName}" không tồn tại trên nguồn dữ liệu đã chọn`);
  const cols = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = [...new Set(requiredColumns.filter(Boolean))].filter(c => !colNames.has(c));
  if (missing.length) throw new Error(`Bảng "${schemaName}.${tableName}" không có cột: ${missing.join(', ')}`);
}

// Kiểm tra toàn bộ cấu hình job Type='table' lúc TẠO (bảng chính + bảng liên
// kết nếu có).
async function validateTableJobSchema(b) {
  const mainColumns = [b.keyColumn, b.dateColumn, b.updatedAtColumn, ...(b.dimensionColumns || []), ...(b.measureColumns || [])];
  if (b.joinTable) {
    if (!b.joinSchema || !b.mainJoinColumn || !b.lookupJoinColumn) {
      throw new Error('Có joinTable thì phải kèm joinSchema/mainJoinColumn/lookupJoinColumn');
    }
    mainColumns.push(b.mainJoinColumn);

    // lib/tableSyncEngine.js:transformRow() gộp dimensionColumns (bảng
    // chính) và lookupDimensionColumns (bảng liên kết) vào CÙNG 1 object
    // `dimensions` theo TÊN CỘT (không tách namespace bảng chính/bảng liên
    // kết) — trùng tên thì cột ghi SAU (bảng liên kết) ĐÈ LÊN cột bảng chính
    // TRONG IM LẶNG, mất dữ liệu mà không có lỗi/cảnh báo gì lúc job chạy.
    // Chặn ngay lúc LƯU cấu hình, không để lộ ra mãi sau này lúc soát báo
    // cáo thấy thiếu 1 chiều dữ liệu.
    const mainDimNames = new Set(b.dimensionColumns || []);
    const overlap = [...new Set(b.lookupDimensionColumns || [])].filter(c => mainDimNames.has(c));
    if (overlap.length) {
      throw new Error(`Cột Dimension trùng tên giữa bảng chính và bảng liên kết: ${overlap.join(', ')} — 2 bên PHẢI có tên khác nhau (cột trùng tên sẽ bị đè lẫn nhau khi ghi báo cáo), đổi tên cột hiển thị ở 1 trong 2 bên`);
    }
  }
  await assertTableConfigMatchesSchema(b.dataSourceId, b.sourceSchema, b.sourceTable, mainColumns);
  if (b.joinTable) {
    await assertTableConfigMatchesSchema(b.dataSourceId, b.joinSchema, b.joinTable, [
      b.lookupJoinColumn, ...(b.lookupDimensionColumns || [])
    ]);
  }
}

module.exports = { assertTableConfigMatchesSchema, validateTableJobSchema };
