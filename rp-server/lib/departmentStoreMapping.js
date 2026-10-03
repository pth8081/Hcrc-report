// lib/departmentStoreMapping.js — Suy ra "Mã Điểm" chuẩn
// (etl.DiemStkMapping.MaDiem) từ Department (vpdt/HCRC Workspace) của 1
// người dùng — bản 8.49, phục vụ gợi ý phạm vi dữ liệu ở trang "Người dùng"
// (dự kiến bản sau: app.UserStoreAccess). Thứ tự ưu tiên:
//   1) app.DepartmentStoreMapping (RP, admin tự khai qua upload/sửa tay) —
//      áp dụng khi tên Department KHÔNG khớp thẳng TenSieuThi.
//   2) Khớp THẲNG theo tên: tìm Mã Điểm có TenSieuThi (Ánh xạ Điểm - STK_ID,
//      CSDL ETL, đọc qua lib/diemStkMapping.js) == ĐÚNG chuỗi Department.
//   3) Không khớp gì -> null — Admin tự gán tay ở trang "Người dùng" hoặc
//      thêm 1 dòng vào "Ánh xạ Phòng ban -> Siêu thị".
// Cache riêng TTL ngắn (60s, giống lib/diemStkMapping.js/lib/permissions.js)
// cho lớp (1) — lớp (2) tận dụng cache sẵn có của lib/diemStkMapping.js,
// không cache trùng. Lỗi đọc CSDL KHÔNG ném ra ngoài (fail-soft, giống mọi
// nguồn mapping phụ khác trong repo) — trả null, Admin tự gán tay.
const { getPool } = require('../db');
const { loadDiemStkMapping } = require('./diemStkMapping');

const CACHE_TTL_MS = 60 * 1000;
let cache = null; // { expiresAt, mapping: Map<departmentRaw, maDiem> }

async function loadDepartmentStoreMapping() {
  if (cache && cache.expiresAt > Date.now()) return cache.mapping;
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DepartmentRaw, MaDiem FROM app.DepartmentStoreMapping');
    const mapping = new Map(result.recordset.map(r => [r.DepartmentRaw, r.MaDiem]));
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, mapping };
    return mapping;
  } catch (err) {
    console.warn(`⚠️  [departmentStoreMapping] Không đọc được app.DepartmentStoreMapping: ${err.message}`);
    return new Map();
  }
}

async function resolveMaDiemForDepartment(department) {
  if (!department) return null;
  const overrideMapping = await loadDepartmentStoreMapping();
  if (overrideMapping.has(department)) return overrideMapping.get(department);

  const diemMapping = await loadDiemStkMapping();
  for (const [maDiem, info] of diemMapping) {
    if (info.tenSieuThi && info.tenSieuThi === department) return maDiem;
  }
  return null;
}

function invalidateDepartmentStoreMappingCache() {
  cache = null;
}

module.exports = { resolveMaDiemForDepartment, invalidateDepartmentStoreMappingCache };
