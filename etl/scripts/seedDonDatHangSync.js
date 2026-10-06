// scripts/seedDonDatHangSync.js — Tạo/CẬP NHẬT idempotent job đồng bộ
// BẮT BUỘC (domain `don_dat_hang`) cho 3 báo cáo "Đơn đặt hàng"/"Đơn nhập
// hàng"/"So sánh đặt–nhận" (`bc-don-dat-hang.md`) — thay cho việc bấm tay
// qua etl-admin. Chạy LẠI file này an toàn — khớp theo "Name" để UPDATE
// thay vì tạo trùng.
//
// ĐIỀU KIỆN TRƯỚC KHI CHẠY: đã tạo xong VIEW `dbo.vw_DonDatHangChiNhanh`
// trên CSDL nguồn DSMART16, nguồn `STRANS` (TRANS_CODE 133=đặt/333=nhập —
// SỬA bản 8.92, xem `bc-don-dat-hang.md` mục 2 để biết VIEW chính xác cần
// tạo). Script TỰ KIỂM TRA lại bằng cách duyệt schema thật của nguồn, báo
// lỗi rõ ràng và DỪNG LẠI nếu thiếu VIEW/cột, không tạo job nửa vời.
//
// Cách dùng — điền các biến môi trường sau vào .env (hoặc export trước khi
// chạy), rồi:
//   node scripts/seedDonDatHangSync.js
//
// Bắt buộc:
//   DSMART16_SERVER    Địa chỉ máy chủ SQL Server (vd 192.168.10.20)
//   DSMART16_USER      Tài khoản CHỈ ĐỌC dùng chung cho CSDL DSMART16
//   DSMART16_PASSWORD  Mật khẩu tài khoản trên
// Tuỳ chọn (mặc định hợp lý):
//   DSMART16_PORT      mặc định 1433
//   DSMART16_LIVE_DB   mặc định "DSMART16"
//   DSMART16_ENCRYPT       "false" để tắt mã hoá kết nối (mặc định bật)
//   DSMART16_TRUST_CERT    "true" để tin chứng chỉ tự ký (mặc định tắt)
//
// LƯU Ý: dùng CHUNG tên biến môi trường + CHUNG tên "Nguồn dữ liệu"
// ("DSMART16 - Live") với scripts/seedLdtdHcrcSync.js/seedZeroStockSkuSync.js
// — nếu đã chạy 1 trong 2 script đó trước, script này TỰ DÙNG LẠI đúng
// Nguồn dữ liệu đã có (khớp theo Name), KHÔNG tạo kết nối trùng tới cùng 1
// CSDL. Chạy script này TRƯỚC cũng được — nó tự tạo Nguồn dữ liệu nếu
// chưa có.
require('dotenv').config();
const { sql, getPool } = require('../db');
const { encrypt } = require('../lib/crypto');
const schemaBrowser = require('../lib/schemaBrowser');

const VIEW_NAME = 'vw_DonDatHangChiNhanh';
const LIVE_DATASOURCE_NAME = 'DSMART16 - Live'; // ĐÚNG tên dùng ở seedLdtdHcrcSync.js/seedZeroStockSkuSync.js — khớp để dùng lại, không tạo trùng.
const JOB_NAME = 'Đơn đặt hàng - nhập hàng (DSMART16)';
const TARGET_DOMAIN = 'don_dat_hang';

function readConfig() {
  const server = process.env.DSMART16_SERVER;
  const user = process.env.DSMART16_USER;
  const password = process.env.DSMART16_PASSWORD;
  if (!server || !user || !password) {
    console.error('⛔ Thiếu DSMART16_SERVER/DSMART16_USER/DSMART16_PASSWORD trong .env — xem hướng dẫn ở đầu file này.');
    process.exit(1);
  }
  return {
    name: LIVE_DATASOURCE_NAME,
    server,
    port: parseInt(process.env.DSMART16_PORT || '1433', 10),
    databaseName: process.env.DSMART16_LIVE_DB || 'DSMART16',
    username: user,
    password,
    encryptConn: process.env.DSMART16_ENCRYPT !== 'false',
    trustServerCert: process.env.DSMART16_TRUST_CERT === 'true'
  };
}

// Khớp theo Name trước — có rồi thì DÙNG LẠI NGUYÊN VẸN (có thể do
// seedLdtdHcrcSync.js/seedZeroStockSkuSync.js tạo từ trước với thông tin
// đã đúng) — chỉ tạo mới khi THẬT SỰ chưa có.
async function resolveDataSourceId(pool, cfg) {
  const existing = await pool.request().input('name', sql.NVarChar(200), cfg.name)
    .query('SELECT Id FROM etl.DataSources WHERE Name = @name');
  if (existing.recordset.length) {
    const id = existing.recordset[0].Id;
    console.log(`↻ Dùng lại Nguồn dữ liệu "${cfg.name}" đã có (Id ${id}).`);
    return id;
  }
  const passwordEncrypted = encrypt(cfg.password);
  const result = await pool.request()
    .input('name', sql.NVarChar(200), cfg.name)
    .input('server', sql.NVarChar(200), cfg.server)
    .input('port', sql.Int, cfg.port)
    .input('databaseName', sql.NVarChar(100), cfg.databaseName)
    .input('username', sql.NVarChar(100), cfg.username)
    .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
    .input('encryptConn', sql.Bit, cfg.encryptConn ? 1 : 0)
    .input('trustServerCert', sql.Bit, cfg.trustServerCert ? 1 : 0)
    .query(`
      INSERT INTO etl.DataSources (Name, Server, Port, DatabaseName, Username, PasswordEncrypted, Encrypt, TrustServerCert)
      OUTPUT INSERTED.Id
      VALUES (@name, @server, @port, @databaseName, @username, @passwordEncrypted, @encryptConn, @trustServerCert)
    `);
  const id = result.recordset[0].Id;
  console.log(`✅ Đã tạo Nguồn dữ liệu "${cfg.name}" (Id ${id}).`);
  return id;
}

// Đối chiếu VIEW + cột cần dùng với schema THẬT của nguồn — DỪNG LẠI ngay
// (không tạo job) nếu thiếu, để không lưu job cấu hình sai âm thầm chờ tới
// lúc chạy thật mới lộ lỗi. Mirror assertViewReady ở seedZeroStockSkuSync.js.
async function assertViewReady(dataSourceId, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const exists = tables.some((t) => t.schemaName === 'dbo' && t.tableName === VIEW_NAME);
  if (!exists) {
    throw new Error(
      `Không tìm thấy VIEW "dbo.${VIEW_NAME}" trên nguồn "${LIVE_DATASOURCE_NAME}" — tạo VIEW này trước ` +
      `(xem mục 2, "bc-don-dat-hang.md") rồi chạy lại script.`
    );
  }
  const cols = await schemaBrowser.listColumns(dataSourceId, 'dbo', VIEW_NAME);
  const colNames = new Set(cols.map((c) => c.columnName));
  const missing = requiredColumns.filter((c) => !colNames.has(c));
  if (missing.length) {
    throw new Error(`VIEW "dbo.${VIEW_NAME}" trên nguồn "${LIVE_DATASOURCE_NAME}" thiếu cột: ${missing.join(', ')} — đối chiếu lại câu CREATE VIEW ở "bc-don-dat-hang.md".`);
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
      .input('updatedAtColumn', sql.NVarChar(100), job.updatedAtColumn)
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
    .input('updatedAtColumn', sql.NVarChar(100), job.updatedAtColumn)
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
  const config = readConfig();
  const pool = await getPool('ADMIN');
  const dataSourceId = await resolveDataSourceId(pool, config);

  // Dimensions/Measures ĐÚNG TÊN ALIAS trong VIEW mẫu ở bc-don-dat-hang.md
  // mục 2 — KeepHistory=1 BẮT BUỘC (báo cáo cần lọc/giữ "theo ngày cả quá
  // khứ", không chỉ 1 dòng mới nhất/thực thể).
  //
  // SỬA bản 8.92 — nguồn đổi sang STRANS (TRANS_CODE 133=đặt/333=nhập, MỖI
  // LOẠI 1 DÒNG RIÊNG thay vì SL đặt+SL nhận chung 1 dòng như bản 8.75) —
  // thêm `LoaiGiaoDich` (TRANS_CODE thô) để lib/purchaseOrderRunner.js lọc/
  // gộp đúng loại; `SoLuongTheoDon`/`SoLuongThucNhan` gộp lại thành 1
  // measure `SoLuong` DUY NHẤT (ý nghĩa tuỳ theo `LoaiGiaoDich` của dòng đó).
  const dimensionColumns = ['MaDiem', 'TenDiem', 'SoDon', 'LoaiGiaoDich', 'NgayGiao', 'MaNCC', 'TenNCC', 'NguoiDat', 'MaHang', 'TenHang', 'DVT', 'TrangThai', 'TrangThaiLabel'];
  const measureColumns = ['SoLuong', 'DonGia', 'ThanhTien'];
  const job = {
    name: JOB_NAME, sourceTable: VIEW_NAME,
    keyColumn: 'MaThucThe', dateColumn: 'EventDate', updatedAtColumn: 'UpdatedAt',
    dimensionColumns, measureColumns, targetDomain: TARGET_DOMAIN,
    cronExpression: '*/15 * * * *'
  };

  const requiredColumns = [job.keyColumn, job.dateColumn, job.updatedAtColumn, ...job.dimensionColumns, ...job.measureColumns];
  try {
    await assertViewReady(dataSourceId, requiredColumns);
  } catch (err) {
    console.error(`⛔ ${err.message}`);
    process.exit(1);
    return;
  }
  await upsertSyncJob(pool, { ...job, dataSourceId });

  console.log('');
  console.log('✅ Xong — job đồng bộ "don_dat_hang" đã sẵn sàng.');
  console.log('   Bước tiếp theo: node scripts/seedPurchaseOrderReports.js (trong thư mục rp-server)');
  console.log('   để đăng ký 3 báo cáo "Đơn đặt hàng"/"Đơn nhập hàng"/"So sánh đặt–nhận".');
  process.exit(0);
}

main().catch((err) => {
  console.error('⛔ Lỗi:', err.message);
  process.exit(1);
});
