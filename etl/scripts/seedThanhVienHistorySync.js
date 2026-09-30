// scripts/seedThanhVienHistorySync.js — Tạo/CẬP NHẬT idempotent 2 job đồng
// bộ "Lịch sử" cho domain "Thành viên" (bản 8.13 — xem "báo cáo doanh thu
// thành viên.md"): 2 báo cáo mới "Báo cáo doanh thu hcrc/LDTD (Thành viên)"
// lấy phần Live TRỰC TIẾP từ từng cửa hàng (Nguồn dữ liệu + Sync Job của
// từng cửa hàng do người dùng tự tạo qua etl-admin — xem tài liệu), nhưng
// phần Lịch sử ("Cùng kỳ năm trước") VẪN lấy tập trung tại trung tâm — TÁI
// DÙNG nguyên vẹn Nguồn dữ liệu "DSMART16 - Lịch sử" và 2 VIEW Script B
// (`V_HCRC_DOANHTHU_CHINHANH`/`V_HCRC_GIAODICH_CHINHANH` trên
// DSMART16_EOM) đã có sẵn từ scripts/seedLdtdHcrcSync.js — KHÔNG tạo Nguồn
// dữ liệu mới, KHÔNG cần sửa VIEW gì ở CSDL trung tâm, chỉ thêm 2 Sync Job
// mới trỏ domain "Thành viên" vào ĐÚNG nguồn/VIEW đó.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã chạy scripts/seedLdtdHcrcSync.js trước đó ít
// nhất 1 lần (Nguồn dữ liệu "DSMART16 - Lịch sử" đã tồn tại) — script này
// KHÔNG tạo lại nguồn đó, chỉ tra cứu theo Tên rồi DỪNG LẠI báo lỗi rõ ràng
// nếu chưa có.
//
// Cách dùng — không cần biến môi trường riêng (dùng lại kết nối ADMIN sẵn
// có trong .env như mọi script khác):
//   node scripts/seedThanhVienHistorySync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const DOANHTHU_VIEW = 'V_HCRC_DOANHTHU_CHINHANH';
const GIAODICH_VIEW = 'V_HCRC_GIAODICH_CHINHANH';
const HISTORY_SOURCE_NAME = 'DSMART16 - Lịch sử';

// Mirror assertViewReady ở scripts/seedLdtdHcrcSync.js (không import lại vì
// hàm đó không export) — đối chiếu VIEW + cột cần dùng với schema THẬT,
// DỪNG LẠI nếu thiếu, không tạo job cấu hình sai âm thầm.
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — VIEW này lẽ ra đã có sẵn (dùng chung với 2 báo cáo cũ) — kiểm tra lại đã chạy đúng Script B trong "báo cáo doanh thu cuối ngày.md" chưa.`);
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = requiredColumns.filter(c => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${tableName}" trên nguồn "${sourceName}" thiếu cột: ${missing.join(', ')}.`);
  }
}

async function upsertSyncJob(pool, job) {
  const existing = await pool.request().input('name', sql.NVarChar(200), job.name)
    .query('SELECT Id FROM etl.SyncJobs WHERE Name = @name');
  const dimensionColumnsJson = JSON.stringify(job.dimensionColumns || []);
  const measureColumnsJson = JSON.stringify(job.measureColumns || []);
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

  const sourceResult = await pool.request().input('name', sql.NVarChar(200), HISTORY_SOURCE_NAME)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!sourceResult.recordset.length) {
    console.error(`⛔ Không tìm thấy Nguồn dữ liệu "${HISTORY_SOURCE_NAME}" — chạy scripts/seedLdtdHcrcSync.js trước (script đó tạo nguồn này cùng 2 báo cáo LDTD/HCRC gốc).`);
    process.exit(1);
    return;
  }
  const eomId = sourceResult.recordset[0].Id;

  // dimensionColumns/measureColumns GIỐNG HỆT 2 job "Lịch sử" gốc (xem
  // scripts/seedLdtdHcrcSync.js) — cùng VIEW, cùng cột, chỉ khác Tên/Domain.
  const jobs = [
    {
      name: 'Doanh thu chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)', dataSourceId: eomId,
      sourceTable: DOANHTHU_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: ['dienTich', 'chain'], measureColumns: ['doanhThu', 'laiGop'],
      targetDomain: 'doanhthu_chinhanh_thanhvien', cronExpression: '0 3 * * *'
    },
    {
      name: 'Giao dịch chi nhánh (Thành viên) - Lịch sử (DSMART16_EOM)', dataSourceId: eomId,
      sourceTable: GIAODICH_VIEW, keyColumn: 'BU_ID', dateColumn: 'TRAN_DATE',
      dimensionColumns: [], measureColumns: ['SoGiaoDich'],
      targetDomain: 'giaodich_chinhanh_thanhvien', cronExpression: '0 3 * * *'
    }
  ];

  for (const job of jobs) {
    const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(job.dataSourceId, HISTORY_SOURCE_NAME, job.sourceTable, requiredColumns);
    } catch (err) {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
      return;
    }
  }
  for (const job of jobs) {
    await upsertSyncJob(pool, job);
  }

  console.log('');
  console.log('✅ Xong — 2 job đồng bộ Lịch sử (Thành viên) đã sẵn sàng, dùng chung Nguồn dữ liệu "DSMART16 - Lịch sử" đã có.');
  console.log('Phần Live (mỗi cửa hàng) vẫn cần tự tạo Nguồn dữ liệu + Sync Job riêng qua etl-admin — xem "báo cáo doanh thu thành viên.md".');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
