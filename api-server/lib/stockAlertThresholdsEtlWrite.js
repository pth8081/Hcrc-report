// lib/stockAlertThresholdsEtlWrite.js — Ghi THẲNG vào bảng etl.
// StockAlertThresholds trong CSDL ETL (HCRC_ETL, pool "ETL_DB" — xem db.js)
// — bản 8.70, theo yêu cầu người dùng: thay vì làm thêm API trong etl,
// api-server kết nối CHÉO sang CSDL ETL rồi ghi thẳng, dùng LẠI đúng tài
// khoản SQL Server etl/.env ADMIN_* đã có sẵn (etl_admin — đã có quyền ghi
// bảng này vì chính etl app cũng dùng tài khoản đó) — KHÔNG tạo tài khoản
// SQL mới. Mirror ĐÚNG logic etl/lib/stockAlertThresholdsImport.js:
// replaceStockAlertThresholds() — REPLACE THEO TỪNG MaDiem có trong rows
// (không xoá sạch toàn bảng), 2 codebase tách biệt nên không require chéo
// được, phải lặp lại logic ở đây.
const { sql } = require('../db');

const INSERT_BATCH_SIZE = 500;

function sqlNStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}
function sqlNStrOrNull(value) {
  return value === null || value === undefined || value === '' ? 'NULL' : sqlNStr(value);
}

// Kiểm tra lại hình dạng rows TRƯỚC khi ghi — dữ liệu đến qua HTTP từ
// rp-server (đã tự kiểm tra/lọc theo storeScope phía đó), nhưng vẫn không
// tin tưởng mù quáng dữ liệu qua dây nối service-to-service: validate lại
// đúng 3 trường bắt buộc, tránh NaN/chuỗi rỗng lọt xuống SQL.
function validateRows(rows) {
  if (!Array.isArray(rows)) return 'rows phải là mảng';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r.maHang !== 'string' || !r.maHang.trim()) return `Dòng ${i + 1}: thiếu maHang`;
    if (typeof r.maDiem !== 'string' || !r.maDiem.trim()) return `Dòng ${i + 1}: thiếu maDiem`;
    if (!Number.isFinite(Number(r.nguongCanhBao))) return `Dòng ${i + 1}: nguongCanhBao không hợp lệ`;
  }
  return null;
}

async function replaceStockAlertThresholdsInEtl(pool, rows, importedBy) {
  const error = validateRows(rows);
  if (error) { const err = new Error(error); err.status = 400; throw err; }

  const rowsByMaDiem = new Map();
  for (const r of rows) {
    const maDiem = r.maDiem.trim();
    if (!rowsByMaDiem.has(maDiem)) rowsByMaDiem.set(maDiem, []);
    rowsByMaDiem.get(maDiem).push(r);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const [maDiem, chunkRows] of rowsByMaDiem) {
      await new sql.Request(tx).input('maDiem', sql.NVarChar(50), maDiem)
        .query('DELETE FROM etl.StockAlertThresholds WHERE MaDiem = @maDiem');
      for (let i = 0; i < chunkRows.length; i += INSERT_BATCH_SIZE) {
        const chunk = chunkRows.slice(i, i + INSERT_BATCH_SIZE);
        if (!chunk.length) continue;
        const values = chunk.map(r => `(${sqlNStr(r.maHang.trim())}, ${sqlNStr(maDiem)}, ${Number(r.nguongCanhBao)}, ${sqlNStrOrNull(r.tenHang)}, ${sqlNStrOrNull(r.nhaCungCap)}, ${importedBy ? sqlNStr(importedBy) : 'NULL'})`).join(',\n');
        await new sql.Request(tx).query(`
          INSERT INTO etl.StockAlertThresholds (MaHang, MaDiem, NguongCanhBao, TenHang, NhaCungCap, ImportedBy)
          VALUES ${values};
        `);
      }
    }
    await tx.commit();
    return rows.length;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

module.exports = { replaceStockAlertThresholdsInEtl };
