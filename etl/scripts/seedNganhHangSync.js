// scripts/seedNganhHangSync.js — Tạo/CẬP NHẬT idempotent 2 job đồng bộ
// (Doanh thu/Nhập hàng theo Ngành hàng, Live DSMART16) cho 2 báo cáo mới
// "Doanh thu theo ngành hàng"/"Nhập hàng theo ngành hàng" — tái dùng
// NGUYÊN VẸN 2 "Nguồn dữ liệu" đã có sẵn từ seedLdtdHcrcSync.js ("DSMART16
// - Live"/"DSMART16 - Lịch sử"), KHÔNG tạo nguồn dữ liệu mới. Domain MỚI
// hoàn toàn (`doanhthu_nganhhang`/`nhaphang_nganhhang`), độc lập với domain
// `doanhthu_chinhanh` đã có — không đụng tới báo cáo doanh thu cuối ngày
// hiện tại.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần (cần sẵn 2 Nguồn
//      dữ liệu "DSMART16 - Live"/"DSMART16 - Lịch sử" — script này DỪNG
//      LẠI báo lỗi rõ ràng nếu chưa có).
//   2. Đã tạo xong VIEW `V_HCRC_DOANHTHU_NGANHHANG`/`V_HCRC_NHAPHANG_NGANHHANG`
//      trên CSDL `DSMART16` (Live) — xem SQL mẫu đã gửi kèm, hoặc tài liệu
//      báo cáo riêng khi hoàn thiện.
//   3. (TUỲ CHỌN, cho "Cùng kỳ năm trước") — nếu đã có VIEW tương ứng trên
//      `DSMART16_EOM`, script này CŨNG tạo job Lịch sử đọc nguồn đó; CHƯA
//      có thì chỉ tạo 2 job Live, "Cùng kỳ năm trước" tạm trống cho tới
//      khi job Lịch sử được tạo sau (chạy lại script này, không cần sửa gì
//      2 job Live đã có).
//
// Cách dùng:
//   node scripts/seedNganhHangSync.js
//   node scripts/seedNganhHangSync.js --with-history   (khi ĐÃ có VIEW Lịch sử)
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const DOANHTHU_VIEW = 'V_HCRC_DOANHTHU_NGANHHANG';
const NHAPHANG_VIEW = 'V_HCRC_NHAPHANG_NGANHHANG';
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
      .query(`
        UPDATE etl.SyncJobs SET
          Type = 'table', DataSourceId = @dataSourceId, SourceSchema = @sourceSchema, SourceTable = @sourceTable,
          KeyColumn = @keyColumn, DateColumn = @dateColumn, UpdatedAtColumn = @updatedAtColumn,
          DimensionColumnsJson = @dimensionColumnsJson, MeasureColumnsJson = @measureColumnsJson,
          JoinSchema = NULL, JoinTable = NULL, JoinType = NULL, MainJoinColumn = NULL, LookupJoinColumn = NULL,
          TargetDomain = @targetDomain, CronExpression = @cronExpression, KeepHistory = 1,
          BranchCodeMapType = NULL, IsActive = 1
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

  const jobs = [
    {
      name: 'Doanh thu theo ngành hàng - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
      sourceTable: DOANHTHU_VIEW, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
      dimensionColumns: ['STK_ID', 'DEPT_ID', 'TenNganhHang'], measureColumns: ['SoLuongBan', 'DoanhThu', 'LaiGop'],
      targetDomain: 'doanhthu_nganhhang', cronExpression: '*/15 * * * *'
    },
    {
      name: 'Nhập hàng theo ngành hàng - Live (DSMART16)', dataSourceId: liveId, sourceName: 'DSMART16 - Live',
      sourceTable: NHAPHANG_VIEW, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
      dimensionColumns: ['STK_ID', 'DEPT_ID', 'TenNganhHang'], measureColumns: ['SoLuongNhap', 'GiaTriNhap'],
      targetDomain: 'nhaphang_nganhhang', cronExpression: '*/15 * * * *'
    }
  ];

  if (WITH_HISTORY) {
    const eomId = await findDataSourceId(pool, 'DSMART16 - Lịch sử');
    jobs.push(
      {
        name: 'Doanh thu theo ngành hàng - Lịch sử (DSMART16_EOM)', dataSourceId: eomId, sourceName: 'DSMART16 - Lịch sử',
        sourceTable: DOANHTHU_VIEW, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
        dimensionColumns: ['STK_ID', 'DEPT_ID', 'TenNganhHang'], measureColumns: ['SoLuongBan', 'DoanhThu', 'LaiGop'],
        targetDomain: 'doanhthu_nganhhang', cronExpression: '0 3 * * *'
      },
      {
        name: 'Nhập hàng theo ngành hàng - Lịch sử (DSMART16_EOM)', dataSourceId: eomId, sourceName: 'DSMART16 - Lịch sử',
        sourceTable: NHAPHANG_VIEW, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
        dimensionColumns: ['STK_ID', 'DEPT_ID', 'TenNganhHang'], measureColumns: ['SoLuongNhap', 'GiaTriNhap'],
        targetDomain: 'nhaphang_nganhhang', cronExpression: '0 3 * * *'
      }
    );
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
  console.log(`✅ Xong — ${jobs.length} job đồng bộ "theo ngành hàng" đã sẵn sàng.`);
  if (!WITH_HISTORY) {
    console.log('ℹ️  Chưa tạo job Lịch sử (DSMART16_EOM) — "Cùng kỳ năm trước" tạm trống. Tạo xong VIEW Lịch sử rồi chạy lại: node scripts/seedNganhHangSync.js --with-history');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
