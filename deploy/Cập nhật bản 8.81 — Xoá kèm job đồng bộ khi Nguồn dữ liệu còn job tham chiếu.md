# Cập nhật bản 8.81 — Xoá kèm job đồng bộ khi Nguồn dữ liệu còn job tham chiếu (ETL)

## Báo cáo của người dùng

Ảnh chụp trang "Nguồn dữ liệu" (etl-admin, điện thoại) — bấm "Xoá" 1
nguồn, trang báo đỏ:

> Không thể xoá — còn 2 job đồng bộ đang dùng nguồn này: Doanh thu (TV) -
> BRGMart 1 Lý Nam Đế, Giao dịch (TV) - BRGMart 1 Lý Nam Đế. Xoá/đổi
> nguồn của các job đó trước.

Kèm lời nhắn: "Tôi đã tắt cả nguồn và job mà ko xoá được."

## Xác nhận: đúng thiết kế, không phải lỗi

Đã hỏi lại người dùng để xác nhận trước khi đổi gì — câu trả lời: đây là
hành vi **có chủ đích** từ bản 8.76 (`DELETE /data-sources/:id` chặn xoá
khi còn Sync Job tham chiếu, `etl.SyncJobs.DataSourceId` KHÔNG có
`ON DELETE CASCADE`), để KHÔNG BAO GIỜ âm thầm xoá mất cấu hình job khi
chỉ định xoá 1 nguồn dữ liệu. Bật/Tắt (`IsActive`) và việc xoá được hay
không là 2 việc KHÔNG liên quan — tắt job không gỡ được tham chiếu
`DataSourceId`, nên "tắt cả nguồn và job" không giải quyết được gì.

Người dùng chọn phương án: **thêm nút "Xoá kèm job"** thay vì phải tự
qua trang "Đồng bộ" xoá 2 job đó trước rồi quay lại xoá nguồn.

## Đã làm

### 1. Backend — `DELETE /admin/data-sources/:id` nhận thêm `cascadeJobs`

```js
router.delete('/:id', requireMenuEdit('data-sources'), async (req, res, next) => {
  const referencing = await pool.request()...query('SELECT Id, Name FROM etl.SyncJobs WHERE DataSourceId = @id');
  if (referencing.recordset.length && !req.body?.cascadeJobs) {
    return res.status(400).json({ error: '...', blockingJobs: referencing.recordset.map(r => ({ id: r.Id, name: r.Name })) });
  }
  for (const job of referencing.recordset) {
    await pool.request()...query('DELETE FROM etl.SyncJobs WHERE Id = @jid');
    await rescheduleJob(job.Id); // gỡ khỏi lịch cron ngay
    await logAction(...);
  }
  await pool.request()...query('DELETE FROM etl.DataSources WHERE Id = @id');
  ...
  res.json({ ok: true, deletedJobs: referencing.recordset.length });
});
```

- **Không có `cascadeJobs`** (mặc định — hành vi CŨ không đổi): vẫn chặn
  y hệt bản 8.76, chỉ thêm trả kèm `blockingJobs` (mảng `{id, name}`) để
  frontend hiển thị chính xác, không phải tự đoán từ chuỗi lỗi.
- **`cascadeJobs: true`**: xoá HẾT các Sync Job đang tham chiếu nguồn đó
  TRƯỚC (gỡ đúng khỏi lịch cron qua `rescheduleJob()`, ghi log riêng cho
  từng job bị xoá), RỒI MỚI xoá nguồn — thứ tự này đảm bảo nếu có lỗi
  giữa chừng, không bao giờ để lại 1 Sync Job "mồ côi" trỏ tới nguồn đã
  mất.

### 2. Frontend — `DataSourcesPage.jsx`: hỏi RIÊNG 1 lần nữa

Bấm "Xoá" bị chặn (bắt được lỗi 400 kèm `blockingJobs`) → hiện NGAY hộp
thoại xác nhận THỨ 2, nêu ĐÚNG tên từng job đang chặn:

> Nguồn "..." còn 2 job đồng bộ đang dùng: Doanh thu (TV) - BRGMart 1 Lý
> Nam Đế, Giao dịch (TV) - BRGMart 1 Lý Nam Đế.
>
> Xoá CẢ 2 job này CÙNG LÚC với nguồn?

Đồng ý mới gọi lại `DELETE` với `{ cascadeJobs: true }`. Bấm "Huỷ" ở
bước này → không xoá gì cả, hiện lại đúng thông báo lỗi gốc. **Không có
bước nào tự động xoá job mà không hỏi** — giữ nguyên tinh thần "không
bao giờ âm thầm" của bản 8.76, chỉ gộp 2 thao tác (xoá job + xoá nguồn)
vào 1 lượt thay vì bắt người dùng tự qua trang "Đồng bộ" xoá job trước.

`api.del()` (`lib/api.js`) được sửa để nhận thêm tham số `body` tuỳ
chọn (DELETE kèm body) — trước đây chỉ gọi được `api.del(path)`.

## Đã kiểm chứng

- **Mock CSDL THẬT, gọi thẳng route handler** (không giả logic nghiệp
  vụ): mặc định (không `cascadeJobs`) vẫn chặn đúng, trả đủ
  `blockingJobs` (tên 2 job đúng theo kịch bản); `cascadeJobs: true` xoá
  đúng CHỈ 2 job của ĐÚNG nguồn đang xoá (job của 1 nguồn KHÁC trong
  cùng CSDL test vẫn còn nguyên, không bị đụng tới), gọi đúng
  `rescheduleJob()` cho cả 2 job vừa xoá; nguồn không ai dùng vẫn xoá
  bình thường như cũ (`deletedJobs: 0`, không đổi hành vi).
- **Demo Playwright** (mock backend, dùng ĐÚNG tên 2 job từ ảnh chụp
  người dùng gửi): bấm "Xoá" → hộp thoại 1 ("Xoá nguồn...?") → hộp thoại
  2 nêu đúng tên "Doanh thu (TV) - BRGMart 1 Lý Nam Đế, Giao dịch (TV) -
  BRGMart 1 Lý Nam Đế" → đồng ý cả 2 → nguồn biến mất khỏi danh sách.
- Build `etl-admin && npx vite build` sạch.

## Các bước triển khai

1. `git pull origin main`.
2. `pm2 restart hcrc-etl` (BẮT BUỘC — route `DELETE` đổi logic).
3. `cd etl-admin && npm run build`, copy `dist/` mới.
4. Kiểm tra: "Nguồn dữ liệu" → bấm "Xoá" 1 nguồn còn Sync Job tham chiếu
   → hộp thoại thứ 2 hiện đúng tên các job đang chặn → đồng ý → cả nguồn
   lẫn các job đó đều biến mất khỏi danh sách tương ứng; bấm "Huỷ" ở hộp
   thoại thứ 2 → không mất gì, trang hiện lại đúng thông báo lỗi gốc.

## File thay đổi

- `etl/routes/admin/dataSources.js` — `DELETE /:id` nhận thêm
  `cascadeJobs`, xoá kèm Sync Job tham chiếu khi được yêu cầu, trả thêm
  `blockingJobs`/`deletedJobs`.
- `etl-admin/src/lib/api.js` — `api.del()` nhận thêm tham số `body` tuỳ
  chọn.
- `etl-admin/src/pages/DataSourcesPage.jsx` — `deleteSource()` hỏi lại
  riêng khi bị chặn, gọi lại với `cascadeJobs: true` nếu đồng ý.
