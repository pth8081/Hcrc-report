// scripts/seedDoanhThuTongHopHcrcSync.js — Tạo/CẬP NHẬT idempotent job đồng
// bộ cho báo cáo MỚI "Báo cáo tổng hợp doanh thu siêu thị hàng ngày" (bản
// 10.82, theo yêu cầu người dùng, dựa trên file mẫu thật đội vận hành đang
// tự tổng hợp tay) — xem "bc-doanh-thu-tong-hop-hcrc.md".
//
// ⚠️ KHÔNG CÒN DÙNG TỪ BẢN 10.86 — báo cáo đã đổi sang tái dùng domain
// `doanhthu_nganhhang`/`doanhthu_chinhanh` có sẵn thay vì domain
// `doanhthu_tonghop_hcrc` job này tạo ra (xem "bc-doanh-thu-tong-hop-hcrc.md"
// mục ghi chú bản 10.86). GIỮ LẠI file này chỉ để tham khảo — KHÔNG chạy
// nữa; nếu đã lỡ chạy ở bản 10.82, vào etl-admin xoá job "Doanh thu tổng
// hợp HCRC - Live (DSMART16)" đi (không ảnh hưởng gì nếu không xoá, chỉ
// là job thừa không ai đọc dữ liệu).
//
// ⚠️ CHỈ "Phase 1 — hệ gốc/trung tâm" (domain mới `doanhthu_tonghop_hcrc`,
// đọc DSMART16 trung tâm Live) — CHƯA làm bản "Lịch sử (DSMART16_EOM)" ở
// bản này (có thể thêm sau nếu cần, mirror seedLdtdHcrcSync.js, vì báo cáo
// cần CỘNG DỒN theo năm — khoảng ngày xa quá khứ có thể cần dữ liệu Lịch
// sử nếu Live không giữ đủ lâu).
//
// KeepHistory=1 (BẮT BUỘC, khác các domain "Tồn kho" ghi đè) — báo cáo cần
// CỘNG DỒN theo THÁNG/NĂM (nhiều ngày khác nhau), phải giữ lại dữ liệu
// TỪNG NGÀY, không ghi đè.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY:
//   1. Đã chạy xong `seedLdtdHcrcSync.js` ít nhất 1 lần.
//   2. Đã tạo xong VIEW `vw_DoanhThuTongHopHCRC` trên CSDL `DSMART16` — xem
//      "deploy/VIEW DSMART16 (trung tâm)/Thiết lập VIEW Doanh thu tổng
//      hợp theo siêu thị HCRC (DSMART16 trung tâm).sql".
//
// Cách dùng:
//   node scripts/seedDoanhThuTongHopHcrcSync.js
require('dotenv').config();
const { sql, getPool } = require('../db');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'vw_DoanhThuTongHopHCRC';
const TARGET_DOMAIN = 'doanhthu_tonghop_hcrc';

async function findDataSourceId(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (!result.recordset.length) {
    console.error(`⛔ Chưa có Nguồn dữ liệu "${name}" — chạy "node scripts/seedLdtdHcrcSync.js" trước.`);
    process.exit(1);
  }
  return result.recordset[0].Id;
}

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
    name: 'Doanh thu tổng hợp HCRC - Live (DSMART16)', dataSourceId: liveId,
    sourceTable: VIEW_NAME, keyColumn: 'MaThucThe', dateColumn: 'WORK_DATE',
    dimensionColumns: ['DienTich', 'DiaDiem', 'Chain'],
    measureColumns: ['DoanhThu', 'DoanhThuBanLe', 'DoanhThuBanBuon', 'LaiGop'],
    targetDomain: TARGET_DOMAIN, cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(job.dataSourceId, 'DSMART16 - Live', job.sourceTable, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, job);

  console.log('');
  console.log('✅ Xong — job đồng bộ "Doanh thu tổng hợp HCRC" đã sẵn sàng.');
  console.log('   Chạy tiếp "node scripts/seedDoanhThuTongHopHcrcReport.js" (thư mục rp-server/) để tạo báo cáo.');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
