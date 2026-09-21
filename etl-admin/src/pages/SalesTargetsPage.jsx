// pages/SalesTargetsPage.jsx — Upload file Excel chỉ tiêu (target/KPI) theo
// tháng, ghi vào dwh.SalesTargets. Component DÙNG CHUNG cho 2 trang ĐỘC LẬP
// ("Chỉ tiêu Lãnh đạo Tập đoàn" + "Chỉ tiêu HCRC" — trước là 1 trang chung
// "Nhập chỉ tiêu", tách ra vì 2 báo cáo do 2 nhóm khác nhau quản lý/nhập
// liệu, xem App.jsx nơi render 2 instance với menuCode/apiBase/title khác
// nhau) — logic HỆT NHAU, chỉ khác quyền (menuCode) và route gọi (apiBase),
// mirror routes/admin/salesTargets.js createSalesTargetsRouter(menuCode, domain)
// phía server.
//
// KHÔNG có ô nhập "Domain" trên trang này nữa (TRƯỚC ĐÂY có, gõ tự do) —
// server đã KHOÁ CỨNG domain theo route (xem routes/admin/salesTargets.js)
// để 2 trang LDTD/HCRC không thể vô tình dùng trùng domain rồi ghi đè chỉ
// tiêu của nhau (dwh.SalesTargets khoá duy nhất theo Domain+EntityCode+
// PeriodMonth) — mọi request từ trang này LUÔN áp domain cố định của đúng
// trang đó, không phụ thuộc gì người dùng gõ.
//
// File .xlsx: hệ thống TỰ NHẬN DIỆN 1 trong 3 định dạng cột (xem
// etl/lib/salesTargetsImport.js) — (1) "MaSieuThi"+"Thang" (chỉ tiêu THEO
// THÁNG, cột sau tuỳ ý); (2) đúng mẫu file thật Lãnh đạo Tập đoàn gửi
// ("Điểm"+"Doanh thu"+"Bill", chỉ tiêu THEO NGÀY); (3) đúng mẫu file thật
// HCRC gửi ("Kỳ"+"Mã đối tượng chứa"+"Mã loại chỉ tiêu"+"Giá trị chỉ
// tiêu", chỉ tiêu THEO NGÀY). Cột "TrangThai"/"MaNganhHang" (cả 2 TUỲ CHỌN,
// CHỈ áp dụng cho định dạng (1)) có ý nghĩa riêng, không trở thành tên chỉ
// tiêu — xem chú thích trong etl/lib/salesTargetsImport.js.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_EDIT_FORM = { entityCode: '', periodMonth: '', trangThai: false, otherTargetsJson: '{}' };

export default function SalesTargetsPage({ menuCode, apiBase, title }) {
  // Server đã chặn đúng (requireMenuEdit(menuCode)) nếu tài khoản chỉ được
  // cấp quyền XEM trang này — nhưng trước đây giao diện vẫn hiện đủ 2 form
  // nhập/sửa bất kể quyền, khiến người chỉ-xem bấm "Nhập chỉ tiêu"/"Lưu"
  // mới thấy lỗi 403 (UX gây hiểu lầm, không phải lỗ hổng — rà soát nghiệp
  // vụ). Ẩn hẳn 2 form khi không có quyền sửa, khớp cách
  // DataSourcesPage.jsx/SyncJobsPage.jsx đã làm.
  const { canEdit } = useAuth();
  const isEditor = canEdit(menuCode);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');

  function reload() {
    const params = new URLSearchParams();
    if (filterPeriod) params.set('periodMonth', filterPeriod);
    const qs = params.toString();
    api.get(`${apiBase}${qs ? `?${qs}` : ''}`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [filterPeriod]);

  // Điền sẵn dữ liệu HIỆN CÓ của dòng đó lên form — sửa xong gửi lại NGUYÊN
  // targets (route PUT `${apiBase}/one` ghi đè cả TargetsJson, không tự
  // merge từng phần ở server), tránh mất chỉ tiêu khác chỉ vì tick 1 ô.
  function startEdit(row) {
    const { TrangThai, ...otherTargets } = row.targets;
    setEditForm({
      entityCode: row.entityCode,
      periodMonth: String(row.periodMonth).slice(0, 10),
      trangThai: TrangThai === 'DaDong',
      otherTargetsJson: JSON.stringify(otherTargets, null, 2)
    });
    setEditError('');
    setEditResult('');
  }

  function startAdd() {
    setEditForm({ ...EMPTY_EDIT_FORM, periodMonth: filterPeriod || '' });
    setEditError('');
    setEditResult('');
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditResult('');
    if (!editForm.entityCode.trim()) return setEditError('Thiếu mã siêu thị');
    if (!editForm.periodMonth) return setEditError('Thiếu ngày áp dụng chỉ tiêu');
    let otherTargets;
    try {
      otherTargets = JSON.parse(editForm.otherTargetsJson || '{}');
    } catch {
      return setEditError('Ô "Chỉ tiêu khác" phải là JSON hợp lệ, vd {"ChiTieuDoanhThu": 100000000}');
    }
    try {
      await api.put(`${apiBase}/one`, {
        entityCode: editForm.entityCode.trim(),
        periodMonth: editForm.periodMonth,
        trangThai: editForm.trangThai ? 'DaDong' : '',
        targets: otherTargets
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) {
      setEditError(err.message);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api.post(`${apiBase}/import`, formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>{title}</h1>
      <p>
        Tải lên file Excel (.xlsx) chỉ tiêu cho từng siêu thị — nhập lại đúng ngày/tháng sẽ
        GHI ĐÈ số liệu cũ, không cộng dồn. Chỉ tiêu nhập ở trang này ĐỘC LẬP hoàn toàn với
        chỉ tiêu ở trang kia (2 domain khác nhau đã khoá cứng sẵn, không thể trùng) — không
        cần lo ghi đè lẫn nhau. Hệ thống tự nhận diện định dạng file theo tên cột, hỗ trợ
        nguyên văn file mẫu thật đang dùng — không cần đổi tên cột trước khi tải lên:
      </p>
      <ul>
        <li>Mẫu <strong>Lãnh đạo Tập đoàn</strong>: cột <code>Ngày/tháng</code>,{' '}
          <code>Điểm</code>, <code>Nhóm điểm</code> (tuỳ chọn), <code>Doanh thu</code>,{' '}
          <code>Bill</code> — chỉ tiêu THEO NGÀY.</li>
        <li>Mẫu <strong>HCRC</strong>: cột <code>Kỳ</code>, <code>Mã đối tượng chứa</code>,{' '}
          <code>Mã loại chỉ tiêu</code>, <code>Giá trị chỉ tiêu</code> — chỉ tiêu THEO NGÀY
          (mỗi dòng 1 loại chỉ tiêu, hệ thống tự ghép các dòng cùng ngày/chi nhánh).</li>
        <li>Mẫu tổng quát (cũ): dòng 1 header, cột <code>MaSieuThi</code> +{' '}
          <code>Thang</code> (dạng <code>YYYY-MM</code>), các cột sau tuỳ ý trở thành tên
          chỉ tiêu — chỉ tiêu THEO THÁNG.</li>
      </ul>
      <p>
        Cột <code>TrangThai</code>/<code>MaNganhHang</code> (cả 2 TUỲ CHỌN, CHỈ áp dụng cho
        mẫu tổng quát ở trên — 2 mẫu thật Lãnh đạo Tập đoàn/HCRC không có 2 cột này): ghi{' '}
        <code>DaDong</code> ở cột <code>TrangThai</code> để LOẠI HẲN siêu thị đó khỏi báo cáo
        tháng này (để trống/<code>HoatDong</code> = hiện bình thường, bỏ trống KHÔNG loại —
        chỉ đánh dấu rõ <code>DaDong</code> mới loại). Cột <code>MaNganhHang</code> điền chỉ
        tiêu THEO NGÀNH HÀNG thay vì cả siêu thị — mã thực thể lưu lại thành
        <code>&lt;MaSieuThi&gt;_&lt;MaNganhHang&gt;</code>, PHẢI khớp đúng "Cột khoá" ETL của
        domain thực đạt tương ứng (xem hướng_dẫn_báo_cáo.md mục 5).
      </p>
      {error && <p className="form-error">{error}</p>}

      {isEditor && (
        <form className="stacked-form" onSubmit={submitImport}>
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          <button type="submit">Nhập chỉ tiêu</button>
        </form>
      )}

      {importResult && (
        <div className="import-result">
          <p>✅ Đã thêm mới {importResult.inserted}, cập nhật {importResult.updated} dòng.</p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
          {importResult.unknownEntityCodes?.length > 0 && (
            <>
              <p>
                ⚠️ {importResult.unknownEntityCodes.length} mã KHÔNG khớp bất kỳ chi nhánh nào
                đang có dữ liệu thực đạt — vẫn đã nhập bình thường, nhưng kiểm tra lại chính tả
                (nếu là siêu thị mới mở chưa kịp có dữ liệu đồng bộ thì bỏ qua cảnh báo này):
              </p>
              <ul>{importResult.unknownEntityCodes.map((code, i) => <li key={i}>{code}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <h2>Chỉ tiêu đã nhập</h2>
      <div className="inline-actions">
        <input type="date" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} />
      </div>

      <DataTable
        columns={[
          { key: 'entityCode', label: 'Mã siêu thị' },
          { key: 'periodMonth', label: 'Ngày áp dụng', render: (r) => String(r.periodMonth).slice(0, 10) },
          { key: 'targets', label: 'Chỉ tiêu', render: (r) => Object.entries(r.targets).map(([k, v]) => `${k}=${v}`).join(', ') },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          ...(isEditor ? [{ key: 'actions', label: '', render: (r) => <button type="button" onClick={() => startEdit(r)}>Sửa</button> }] : [])
        ]}
        rows={rows}
      />

      {isEditor && (
        <>
          <h2>Sửa / thêm 1 siêu thị</h2>
          <p>
            Dùng khi giữa tháng có siêu thị mới mở hoặc đóng cửa — KHÔNG cần chuẩn bị lại cả file
            Excel. Bấm "Sửa" ở 1 dòng trên để tự điền sẵn dữ liệu hiện có, hoặc "Thêm siêu thị mới"
            cho dòng trống. Lưu sẽ GHI ĐÈ nguyên chỉ tiêu của đúng siêu thị + tháng đó — dữ liệu
            hiện có đã tự điền sẵn nên không lo mất, chỉ cần sửa đúng phần cần đổi.
          </p>
          {editError && <p className="form-error">{editError}</p>}
          {editResult && <p className="form-success">{editResult}</p>}

          <form className="stacked-form" onSubmit={submitEdit}>
            <input
              placeholder="Mã thực thể — MaSieuThi (vd BRGHP), hoặc MaSieuThi_MaNganhHang cho chỉ tiêu theo ngành hàng (vd BRGHP_THUCPHAM)"
              value={editForm.entityCode}
              onChange={(e) => setEditForm({ ...editForm, entityCode: e.target.value })}
              required
            />
            <input
              type="date"
              value={editForm.periodMonth}
              onChange={(e) => setEditForm({ ...editForm, periodMonth: e.target.value })}
              required
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={editForm.trangThai}
                onChange={(e) => setEditForm({ ...editForm, trangThai: e.target.checked })}
              />
              Đã đóng cửa (loại khỏi báo cáo tháng này)
            </label>
            <textarea
              placeholder='Chỉ tiêu khác dạng JSON, vd {"ChiTieuDoanhThu": 150000000} — nếu Mã thực thể ở trên là dạng ghép ngành hàng, nên thêm cả {"MaSieuThi": "BRGHP", "MaNganhHang": "THUCPHAM", "ChiTieuDoanhThu": 50000000} để báo cáo đọc thẳng, không phải tự tách chuỗi'
              rows={4}
              value={editForm.otherTargetsJson}
              onChange={(e) => setEditForm({ ...editForm, otherTargetsJson: e.target.value })}
            />
            <div className="inline-actions">
              <button type="submit">Lưu</button>
              <button type="button" onClick={startAdd}>Thêm siêu thị mới (form trống)</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
