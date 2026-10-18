/* etl-db/grants.sql — MẪU quyền hạn chế tối thiểu (least privilege) cho CSDL
   quản trị ETL (HCRC_ETL). KHÔNG tự chạy trong quy trình cài đặt (khác
   schema.sql) — DBA/operator xem lại, ĐỔI MẬT KHẨU thật, rồi mới chạy tay
   trên CSDL HCRC_ETL. An toàn chạy lại nhiều lần.

   1 tài khoản duy nhất khớp etl/.env.example (ADMIN_USER=etl_admin) — tiến
   trình etl/ ĐỌC LẪN GHI cả 2 schema (admin.AdminUsers cho đăng nhập trang
   quản trị, etl.* cho DataSources/SyncJobs/SyncState/SyncLog), không tách
   quyền đọc/ghi riêng vì cùng 1 tiến trình luôn cần cả hai.

   LƯU Ý: etl_admin KHÔNG cần và KHÔNG nên có quyền gì trên các nguồn dữ liệu
   THẬT mà admin cấu hình trong etl.DataSources (các CSDL OLTP nguồn của
   từng chi nhánh/siêu thị) — những kết nối đó dùng tài khoản CHỈ ĐỌC riêng
   do admin tự khai khi tạo DataSource qua etl-admin/, không liên quan gì
   tới login etl_admin ở đây (đó là tài khoản cho CSDL QUẢN TRỊ của chính
   ETL, không phải nguồn dữ liệu ETL đi đồng bộ).

   2 tài khoản trong file này:
     - etl_admin           — tiến trình etl/ (đọc lẫn ghi cả 2 schema).
     - etl_diem_stk_reader (rp-server/.env.example ETL_DIEM_STK_USER) —
       CHỈ ĐỌC, CHỈ ĐÚNG 4 BẢNG etl.DiemStkMapping + etl.CoreItemList +
       etl.StockAlertThresholds + etl.NsoStores (dùng CHUNG 1 login/pool —
       cả 4 bảng đều là dữ liệu rp-server cần ĐỌC từ CSDL etl để phục vụ báo
       cáo, không cần tách login riêng) — chiều NGƯỢC với dwh_target_importer
       (dwh/grants.sql: etl đọc/ghi CSDL dwh) — ở đây rp-server đọc CSDL etl
       để lấy ánh xạ mã Điểm (BU_ID) <-> nhiều mã kho STK_ID (xem
       rp-server/lib/diemStkMapping.js), danh sách hàng Core (xem
       rp-server/lib/coreItemList.js), ngưỡng cảnh báo tồn kho (xem
       rp-server/lib/stockAlertThresholds.js), và danh sách siêu thị NSO
       (bản 9.63, xem rp-server/lib/nsoStores.js). Không được cấp SCHEMA::etl
       (sẽ lộ luôn etl.DataSources — chứa mật khẩu mã hoá các nguồn dữ liệu
       OLTP thật) — GRANT theo TỪNG BẢNG như dwh_target_importer đã làm với
       dwh.SalesTargets.

   SỬA bản 9.51 (theo báo cáo người dùng — báo cáo "Core stock = 0" báo lỗi
   thật "The SELECT permission was denied on the object 'CoreItemList'"
   trên server đang chạy) — GRANT SELECT ON etl.CoreItemList đã có sẵn
   trong file này nhưng CHƯA được chạy lại trên CSDL thật sau khi dòng này
   được thêm vào (tính năng Core thêm SAU khi login etl_diem_stk_reader đã
   tạo xong cho riêng DiemStkMapping) — NHẮC chạy lại TOÀN BỘ file này (an
   toàn chạy lại nhiều lần, idempotent) mỗi khi thêm bảng mới vào danh sách
   các bảng ở trên (bản 9.63 vừa thêm etl.NsoStores — NHỚ chạy lại file này
   trên CSDL thật, không chỉ chạy etl-db/schema.sql, nếu không báo cáo mới
   sẽ gặp đúng lỗi "SELECT permission was denied" như Core Item List trước
   đây). Nhân tiện phát hiện etl.StockAlertThresholds (dùng CHUNG login này
   từ trước, xem rp-server/lib/stockAlertThresholds.js) CHƯA TỪNG có dòng
   GRANT trong file này — thêm luôn, tránh lặp lại đúng lỗi này cho báo cáo
   "Cảnh báo hàng tồn". */

USE HCRC_ETL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_admin')
BEGIN
    CREATE LOGIN etl_admin WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_admin')
BEGIN
    CREATE USER etl_admin FOR LOGIN etl_admin;
END
GO
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::admin TO etl_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::etl TO etl_admin;
GO

-- ===== etl_diem_stk_reader — rp-server CHỈ đọc etl.DiemStkMapping (TUỲ CHỌN,
--       chỉ cần tạo nếu có báo cáo composite bật block.useDiemStkMapping —
--       xem rp-server/.env.example ETL_DIEM_STK_*) =====
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'etl_diem_stk_reader')
BEGIN
    CREATE LOGIN etl_diem_stk_reader WITH PASSWORD = 'DOI-MAT-KHAU-NAY-THANH-GIA-TRI-NGAU-NHIEN-THAT';
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'etl_diem_stk_reader')
BEGIN
    CREATE USER etl_diem_stk_reader FOR LOGIN etl_diem_stk_reader;
END
GO
-- CỐ Ý GRANT theo TỪNG BẢNG, KHÔNG theo SCHEMA::etl — tài khoản này KHÔNG
-- được đọc/ghi bất kỳ bảng nào khác trong schema etl (đặc biệt
-- etl.DataSources chứa mật khẩu mã hoá các nguồn dữ liệu OLTP thật).
GRANT SELECT ON etl.DiemStkMapping TO etl_diem_stk_reader;
GRANT SELECT ON etl.CoreItemList TO etl_diem_stk_reader;
GRANT SELECT ON etl.StockAlertThresholds TO etl_diem_stk_reader;
GRANT SELECT ON etl.NsoStores TO etl_diem_stk_reader;
GO
