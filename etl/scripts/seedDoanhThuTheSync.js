// scripts/seedDoanhThuTheSync.js — Tạo/CẬP NHẬT idempotent job đồng bộ
// (Doanh thu theo Thẻ chi nhánh, Live DSMART16 + tuỳ chọn Lịch sử
// DSMART16_EOM) cho domain MỚI `doanhthu_the_chinhanh`, phục vụ 2 báo cáo
// MKT "Báo cáo kinh doanh theo tuần"/"Báo cáo khách hàng theo tuần" — tái
// dùng NGUYÊN VẸN 2 "Nguồn dữ liệu" đã có sẵn từ seedLdtdHcrcSync.js
// ("DSMART16 - Live"/"DSMART16 - Lịch sử"), KHÔNG tạo nguồn dữ liệu mới.
// Domain MỚI hoàn toàn, độc lập với domain `doanhthu_chinhanh`/
// `giaodich_chinhanh` đã có — không đụng tới báo cáo doanh thu cuối ngày
// hiện tại.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn 2 Nguồn
//      dữ liệu "DSMART16 - Live"/"DSMART16 - Lịch sử" — script này DỪNG
//      LẠI báo lỗi rõ ràng nếu chưa có).
//   2. Đã tạo xong VIEW `V_HCRC_DOANHTHU_THE_CHINHANH` trên CSDL `DSMART16`
//      (Live) — xem "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh
//      thu theo Thẻ chi nhánh (Script A+B, DSMART16 + DSMART16_EOM).sql",
//      Script A.
//   3. (TUỲ CHỌN, cho "Cùng kỳ năm trước") — nếu đã chạy Script B trên
//      `DSMART16_EOM` (file trên), script này CŨNG tạo job Lịch sử đọc
//      nguồn đó; CHƯA có thì chỉ tạo job Live, "Cùng kỳ năm trước" tạm
//      trống cho tới khi job Lịch sử được tạo sau (chạy lại script này với
//      --with-history, không cần sửa gì job Live đã có).
//
// Cách dùng:
//   node scripts/seedDoanhThuTheSync.js
//   node scripts/seedDoanhThuTheSync.js --with-history   (khi ĐÃ có VIEW Lịch sử)
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const DOANHTHU_THE_VIEW = 'V_HCRC_DOANHTHU_THE_CHINHANH';
const WITH_HISTORY = process.argv.includes('--with-history');

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước (tạo sẵn 2 Nguồn dữ liệu DSMART16 Live/Lịch sử).`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — xem chú thích
// đầy đủ ở seedLdtdHcrcSync.js:assertViewReady() (mirror y hệt).
async function assertViewReady(dataSourceId, sourceName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some(t => t.schemaName === 'dbo' && t.tableName === tableName);
  if (!exists) {
    throw new Error(`Không tìm thấy VIEW "dbo.${tableName}" trên nguồn "${sourceName}" — tạo VIEW này trước rồi chạy lại script.`);
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
      .input('rescanLookbackDays', sql.Int, job.rescanLookbackDays || 0)
      .query(`
        UPDATE etl.SyncJobs SET
          Type = 'table', DataSourceId = @dataSourceId, SourceSchema = @sourceSchema, SourceTable = @sourceTable,
          KeyColumn = @keyColumn, DateColumn = @dateColumn, UpdatedAtColumn = @updatedAtColumn,
          DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
          JoinSchema = NULL, JoinTable = NULL, JoinType = NULL, MainJoinColumn = NULL, LookupJoinColumn = NULL,
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 1,
          BranchCodeMapType = NULL, IsActive = 1, RescanLookbackDays = @rescanLookbackDays
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
    .input('rescanLookbackDays', sql.Int, job.rescanLookbackDays || 0)
    .query(`
      INSERT INTO etl.SyncJobs (
        Name, Type, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
        DimensionColumnsJson, MeasureColumnsJson, TargetDomain, CronExpression, KeepHistory, RescanLookbackDays
      )
      OUTPUT INSERTED.Id
      VALUES (
        @name, 'table', @dataSourceId, @sourceSchema, @sourceTable, @keyColumn, @dateColumn, @updatedAtColumn,
        @dimensionColumnsJson, @measureColumnsJson, @targetDomain, @cronExpression, 1, @rescanLookbackDays
      )
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo job "${job.name}" (Id ${id}) — scheduler nạp lại trong tối đa 60 giây, không cần khởi động lại ETL.`);
  return id;
}

async function main() {
  const pool = await getPool('ADMIN');
  const liveId = await findDataSourceId(pool, 'DSMART16 - Live');

  const jobs = [
    {
      name: 'Doanh thu theo Thẻ chi nhánh - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
      sourceTable: DOANHTHU_THE_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: [],
      measureColumns: ['SoBillTotal', 'SoBillThe', 'DoanhSoTotal', 'DoanhSoThe'],
      targetDomain: 'doanhthu_the_chinhanh', cronExpression: '*/15 * * * *', rescanLookbackDays: 7
    }
  ];

  if (WITH_HISTORY) {
    const eomId = await findDataSourceId(pool, 'DSMART16 - Lịch sử');
    jobs.push({
      name: 'Doanh thu theo Thẻ chi nhánh - Lịch sử (DSMART16_EOM)', dataSourceId: eomId, sourceName: 'DSMART16 - Lịch sử',
      sourceTable: DOANHTHU_THE_VIEW, keyColumn: 'STK_ID', dateColumn: 'WORK_DATE',
      dimensionColumns: [],
      measureColumns: ['SoBillTotal', 'SoBillThe', 'DoanhSoTotal', 'DoanhSoThe'],
      targetDomain: 'doanhthu_the_chinhanh', cronExpression: '0 3 * * *',
      // RescanLookbackDays=40 — cùng lý do các job "Lịch sử" khác (xem
      // seedLdtdHcrcSync.js): dữ liệu đã chuyển sang DSMART16_EOM vẫn có
      // thể bị sửa ngày quá khứ/sửa đơn/huỷ đơn sau đó.
      rescanLookbackDays: 40
    });
  }

  // Kiểm tra ĐỦ mọi job trước khi ghi bất kỳ job nào — không lỡ tạo nửa vời.
  for (const job of jobs) {
    const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
    try {
      await assertViewReady(job.dataSourceId, job.sourceName, job.sourceTable, requiredColumns);
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
  console.log(`✅ Xong — ${jobs.length} job đồng bộ "Doanh thu theo Thẻ chi nhánh" đã sẵn sàng.`);
  if (!WITH_HISTORY) {
    console.log('ℹ️  Chưa tạo job Lịch sử (DSMART16_EOM) — "Cùng kỳ năm trước" tạm trống. Chạy Script B rồi chạy lại: node scripts/seedDoanhThuTheSync.js --with-history');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
