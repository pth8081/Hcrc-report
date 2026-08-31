// lib/syncStatus.js — Tổng hợp tình trạng đồng bộ THEO TỪNG NGUỒN dữ liệu
// (etl.DataSources), dùng cho cột "Đồng bộ" trên trang "Nguồn dữ liệu" —
// khác Dashboard (routes/admin/dashboard.js, đã có sẵn) vốn liệt kê THEO
// JOB, không gộp theo nguồn. Hữu ích khi có hàng chục kết nối (vd 33 siêu
// thị + 1 trung tâm) — rà soát nguồn nào đang lỗi/quá hạn ngay trên đúng
// trang quản lý kết nối, không cần đối chiếu qua Dashboard.
//
// estimateIntervalMinutes() CHỈ nhận diện 2 dạng cron THỰC TẾ đang dùng
// trong hệ thống (etl-admin SyncJobsPage.jsx mặc định "*/15 * * * *", hoặc
// lịch cố định giờ/phút hàng ngày "M H * * *"/"M H * * D1,D2") — KHÔNG phải
// bộ dịch cron đầy đủ. Cron phức tạp hơn (nhiều giờ trong ngày, bước nhảy
// giờ...) rơi về mặc định "1 ngày/lần" — thà báo quá hạn hơi sớm còn hơn
// im lặng bỏ sót một nguồn đang thực sự có vấn đề.
function estimateIntervalMinutes(cronExpression) {
  const parts = String(cronExpression || '').trim().split(/\s+/);
  if (parts.length !== 5) return 24 * 60;
  const [minute, hour] = parts;
  const everyNMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyNMinutes && hour === '*') return Number(everyNMinutes[1]);
  return 24 * 60;
}

// "Quá hạn" = job ĐANG BẬT nhưng chưa từng chạy lần nào, HOẶC lần chạy gần
// nhất (thành công hay lỗi đều tính — job VẪN đang cố chạy) đã quá lâu so
// với chu kỳ mong đợi của chính nó (× 3 — cho phép bỏ lỡ tối đa 2 lượt liền
// mà chưa báo động, vd nguồn tạm mất kết nối vài chu kỳ rồi tự phục hồi).
function isJobOverdue(job, now) {
  if (!job.LastRunAt) return true;
  const thresholdMinutes = Math.max(30, estimateIntervalMinutes(job.CronExpression) * 3);
  return now - new Date(job.LastRunAt).getTime() > thresholdMinutes * 60 * 1000;
}

// jobs = mọi etl.SyncJobs của 1 DataSource, mỗi phần tử kèm lần chạy
// (etl.SyncLog) GẦN NHẤT của đúng job đó — { Id, CronExpression, IsActive,
// LastRunAt, LastStatus, LastError }. Trả về null khi nguồn CHƯA gắn job
// đồng bộ nào (không phải "lỗi", chỉ là chưa cấu hình dùng tới).
function summarizeSourceSyncStatus(jobs, now = Date.now()) {
  if (!jobs || !jobs.length) return null;

  const activeJobs = jobs.filter(j => j.IsActive);
  const runs = jobs.filter(j => j.LastRunAt);
  const lastRun = runs.length
    ? runs.reduce((a, b) => (new Date(a.LastRunAt) > new Date(b.LastRunAt) ? a : b))
    : null;
  const overdueJobCount = activeJobs.filter(j => isJobOverdue(j, now)).length;

  return {
    totalJobs: jobs.length,
    activeJobs: activeJobs.length,
    lastRunAt: lastRun ? lastRun.LastRunAt : null,
    lastStatus: lastRun ? lastRun.LastStatus : null,
    lastError: lastRun ? lastRun.LastError : null,
    overdueJobCount
  };
}

module.exports = { estimateIntervalMinutes, isJobOverdue, summarizeSourceSyncStatus };
