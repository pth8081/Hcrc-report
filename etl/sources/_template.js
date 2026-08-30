// sources/_template.js — MẪU connector nguồn. Đây KHÔNG phải nguồn thật, không
// được require trong sources/index.js. Cách thêm một nguồn mới:
//
//   1. Copy file này thành sources/<ten-nguon>.js
//   2. Đổi key / label / envPrefix / domain cho đúng nguồn thật
//   3. Sửa extract() — câu SQL đúng bảng/cột thật. BẮT BUỘC lọc theo
//      "WHERE UpdatedAt > @lastSyncedAt" và SELECT kèm cột UpdatedAt (dùng để
//      cập nhật mốc đồng bộ sau khi chạy xong — xem jobs/runSync.js).
//   4. Sửa transform() — map 1 dòng nguồn thành đúng khuôn dwh.ReportFacts.
//   5. Thêm require('./<ten-nguon>') vào mảng trong sources/index.js.
//   6. Thêm khối SRC_<TEN>_... vào .env (xem cuối .env.example) — cấp một tài
//      khoản SQL CHỈ ĐỌC trên máy chủ nguồn đó, không dùng chung với tài khoản
//      của phần mềm nghiệp vụ.
//
// Nguồn chưa có cột UpdatedAt đáng tin cậy? Vẫn viết connector được — extract()
// có thể so khớp khoá chính thay vì lọc theo thời gian — nhưng cần bàn trước vì
// ảnh hưởng tải lên máy chủ nguồn mỗi lượt chạy (xem tài liệu kiến trúc, mục 03).
const { sql } = require('../db');

module.exports = {
  key: 'vidu', // định danh duy nhất — dùng làm SourceSystem trong dwh.ReportFacts
               // và tên nguồn trong dwh.SyncState/dwh.SyncLog
  label: 'Ví dụ — đổi tên thật khi copy file này',
  envPrefix: 'SRC_VIDU', // khớp đúng với biến .env: SRC_VIDU_SERVER, SRC_VIDU_DATABASE, ...
  domain: 'ViDu', // giá trị cột Domain — đặt tên theo loại báo cáo, vd 'HopDong', 'DongPhuc'

  async extract(pool, lastSyncedAt) {
    const result = await pool.request()
      .input('lastSyncedAt', sql.DateTime2, lastSyncedAt)
      .query(`
        SELECT MaHoSo, TenPhongBan, NgayPhatSinh, GiaTri, UpdatedAt
        FROM dbo.BangViDu
        WHERE UpdatedAt > @lastSyncedAt
        ORDER BY UpdatedAt ASC
      `);
    return result.recordset;
  },

  transform(row) {
    return {
      sourceSystem: this.key,
      domain: this.domain,
      entityCode: row.MaHoSo,
      eventDate: row.NgayPhatSinh,
      dimensions: { deptName: row.TenPhongBan },
      measures: { giaTri: row.GiaTri }
    };
  }
};
