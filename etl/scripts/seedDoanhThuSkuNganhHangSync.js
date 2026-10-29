// scripts/seedDoanhThuSkuNganhHangSync.js — Tạo/CẬP NHẬT idempotent job đồng
// bộ (Doanh thu theo Mã hàng-Ngành hàng, Live DSMART16) cho báo cáo MỚI
// "Doanh thu theo ngành hàng (HCRC) - theo mã hàng"/"(LDTD) - theo mã hàng"
// (bản 10.41, theo yêu cầu người dùng — 2 báo cáo "Doanh thu theo ngành
// hàng" hiện có KHÔNG lọc được theo Mã hàng vì VIEW nguồn CỘNG GỘP SẴN
// theo (siêu thị, ngành hàng, ngày) — tạo domain/VIEW MỚI HOÀN TOÀN, giữ
// lại TỪNG MÃ HÀNG 1 dòng riêng, KHÔNG đụng domain/VIEW `doanhthu_nganhhang`
// đã có, zero rủi ro cho 2 báo cáo hiện tại).
//
// Tái dùng NGUYÊN VẸN "Nguồn dữ liệu" "DSMART16 - Live" đã có sẵn từ
// seedLdtdHcrcSync.js — KHÔNG tạo nguồn dữ liệu mới.
//
// ⚠️ CHỈ "Phase 1 — hệ gốc/trung tâm" (domain mới `doanhthu_sku_nganhhang`,
// đọc DSMART16 trung tâm) — CHƯA làm bản "Lịch sử (DSMART16_EOM)"/"(Thành
// viên)" ở bản này, theo đúng phạm vi đã thống nhất với người dùng (có thể
// thêm sau nếu cần, mirror seedNganhHangSync.js --with-history/
// seedThanhVienHistorySync.js).
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn Nguồn dữ
//      liệu "DSMART16 - Live" — script này DỪNG LẠI báo lỗi rõ ràng nếu
//      chưa có).
//   2. Đã tạo xong VIEW `V_HCRC_DOANHTHU_SKU_NGANHHANG` trên CSDL
//      `DSMART16` — xem "deploy/Thiết lập VIEW Doanh thu theo Mã hàng-Ngành
//      hàng (DSMART16 trung tâm).sql".
//
// Cách dùng:
//   node scripts/seedDoanhThuSkuNganhHangSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'V_HCRC_DOANHTHU_SKU_NGANHHANG';
const TARGET_DOMAIN = 'doanhthu_sku_nganhhang';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước (tạo sẵn Nguồn dữ liệu DSMART16 Live).`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — mirror
// seedNganhHangSync.js:assertViewReady().
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước (xem "deploy/Thiết lập VIEW Doanh thu theo Mã hàng-Ngành hàng (DSMART16 trung tâm).sql") rồi chạy lại script.`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" trên nguồn "${sourceName}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW.`);
  }
}

async function upsertSyncJob(pool, job) {
  const existing = await pool.request().input('name', sql.NVarChar(200), job.name)
    .query('SELECT Id FROM etl.SyncJobs WHERE Name = @name');
  const dimensionColumnsJson = JSON.stringify(job.dimensionColumns);
  const measureColumnsJson = JSON.stringify(job.measureColumns);
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    await pool.request()
      .input('id', sql.Int, id)
      .input('dataSourceId', sql.Int, job.dataSourceId)
      .input('sourceSchema', sql.NVarChar(100), 'dbo')
      .input('sourceTable', sql.NVarChar(100), job.sourceTable)
      .input('keyColumn', sql.NVarChar(100), job.keyColumn)
      .input('dateColumn', sql.NVarChar(100), job.dateColumn)
      .input('updatedAtColumn', sql.NVarChar(100), job.dateColumn)
      .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), dimensionColumnsJson)
      .input('measureColumnsJson', sql.NVarChar(sql.MAX), measureColumnsJson)
      .input('targetDomain', sql.VarChar(50), job.targetDomain)
      .input('cronExpression', sql.VarChar(50), job.cronExpression)
      .query(`
        UPDATE etl.SyncJobs SET
          Type = 'table', DataSourceId = @dataSourceId, SourceSchema = @sourceSchema, SourceTable = @sourceTable,
          KeyColumn = @keyColumn, DateColumn = @dateColumn, UpdatedAtColumn = @updatedAtColumn,
          DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
          JoinSchema = NULL, JoinTable = NULL, JoinType = NULL, MainJoinColumn = NULL, LookupJoinColumn = NULL,
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 1, IsActive = 1
        WHERE Id = @id
      `);
    console.log(`↻ Đã cập nhật job "${job.name}" (Id ${id}).`);
    return id;
  }
  const result = await pool.request()
    .input('name', sql.NVarChar(200), job.name)
    .input('dataSourceId', sql.Int, job.dataSourceId)
    .input('sourceSchema', sql.NVarChar(100), 'dbo')
    .input('sourceTable', sql.NVarChar(100), job.sourceTable)
    .input('keyColumn', sql.NVarChar(100), job.keyColumn)
    .input('dateColumn', sql.NVarChar(100), job.dateColumn)
    .input('updatedAtColumn', sql.NVarChar(100), job.dateColumn)
    .input('dimensionColumnsJson', sql.NVarChar(sql.MAX), dimensionColumnsJson)
    .input('measureColumnsJson', sql.NVarChar(sql.MAX), measureColumnsJson)
    .input('targetDomain', sql.VarChar(50), job.targetDomain)
    .input('cronExpression', sql.VarChar(50), job.cronExpression)
    .query(`
      INSERT INTO etl.SyncJobs (
        Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
        DimensionColumnsJson, MeasureColumnsJson, TargetDomain, CronExpression, KeepHistory
      )
      OUTPUT INSERTED.Id
      VALUES (
        @name, 'table', @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
        @dimensionColumnsJson, @measureColumnsJson, @targetDomain, @cronExpression, 1
      )
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo job "${job.name}" (Id ${id}) — scheduler nạp lại trong tối đa 60 giây, không cần khởi động lại ETL.`);
  return id;
}

async function main() {
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  const job = {
    name: 'Doanh thu theo Mã hàng-Ngành hàng - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
    sourceTable: VIEW_NAME, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
    dimensionColumns: ['STK_ID', 'MaHang', 'MaHangHienThi', 'TenHang', 'MaNganhHang', 'TenNganhHang'],
    measureColumns: ['SoLuongBan', 'DoanhThu', 'DoanhThuBanLe', 'DoanhThuBanBuon', 'LaiGop', 'LaiGopBanLe', 'LaiGopBanBuon', 'GiaTriHongHuy'],
    targetDomain: TARGET_DOMAIN, cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Doanh thu theo Mã hàng-Ngành hàng" đã sẵn sàng.');
  console.log('   Chạy tiếp "node scripts/seedDoanhThuSkuNganhHangReports.js" (thư mục rp-server/) để tạo 2 báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
