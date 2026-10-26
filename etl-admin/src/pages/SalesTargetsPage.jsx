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
import DateInput from '../components/DateInput';
import { useRowSelection } from '../lib/useRowSelection';

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
  // isNganhHangOnly (bản 9.85, theo báo cáo người dùng — "bc ngành hàng là
  // mã ngành hàng ko phải mã siêu thị nhé") — ban đầu CHỈ 2 trang "Chỉ tiêu
  // Doanh thu theo ngành hàng"/"(LDTD)" (bản 9.73, genericNoStoreCode=true
  // ở server), "Nhập hàng theo ngành hàng" CHƯA tính vào (lúc đó nghĩ vẫn
  // cần hỗ trợ CẢ 2 kiểu, theo từng chi nhánh HOẶC toàn công ty).
  //
  // SỬA bản 10.13 (theo yêu cầu người dùng, 26/10/2026 — "Ngành hàng làm gì
  // có mã siêu thị") — thêm 'sales-targets-nganhhang-nh' vào đây: trang
  // này CŨNG LUÔN là "theo toàn công ty" như 2 trang kia, không còn khái
  // niệm siêu thị — genericNoStoreCode cũng đã bật `true` tương ứng ở
  // etl/server.js (route '/admin/sales-targets-nganhhang-nh').
  const isNganhHangOnly = menuCode === 'sales-targets-nganhhang-dt' || menuCode === 'sales-targets-nganhhang-dt-ldtd' || menuCode === 'sales-targets-nganhhang-nh';
  const entityLabel = isNganhHangOnly ? 'ngành hàng' : 'siêu thị';
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  // Xoá chỉ tiêu (bản 9.84, theo yêu cầu người dùng — "chỗ nhập chỉ tiêu
  // có cho xoá đi được không? Tôi muốn chọn xoá một hoặc nhiều") — mẫu
  // chuẩn chọn nhiều + xoá hàng loạt theo CLAUDE.md (xem SyncJobsPage.jsx),
  // getId = row.id (chữ thường — GET '/' trả `id: r.Id`, KHÁC mặc định
  // row.Id của hook).
  const selection = useRowSelection(row => row.id);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    const params = new URLSearchParams();
    if (filterPeriod) params.set('periodMonth', filterPeriod);
    const qs = params.toString();
    api.get(`${apiBase}${qs ? `?${qs}` : ''}`).then(setRows).catch(err => setError(err.message));
  }
  // Bản 9.82, theo báo cáo người dùng — bấm chuyển giữa các trang "Chỉ
  // tiêu ..." ở sidebar (5 route KHÁC NHAU CÙNG DÙNG 1 component này, chỉ
  // khác prop menuCode/apiBase/title — xem App.jsx) KHÔNG đổi dữ liệu hiện
  // trên bảng, phải F5 (tải lại cả trang) mới thấy đúng chỉ tiêu vừa
  // chuyển sang. Nguyên nhân: React Router GIỮ NGUYÊN 1 instance component
  // khi chuyển route (cùng kiểu component tại vị trí tương ứng trong cây),
  // KHÔNG unmount/mount lại — nhưng effect tải dữ liệu trước đây chỉ phụ
  // thuộc `filterPeriod`, KHÔNG phụ thuộc `apiBase`, nên đổi route (= đổi
  // prop apiBase) không kích hoạt tải lại, bảng vẫn hiện dữ liệu của trang
  // TRƯỚC ĐÓ. Thêm `apiBase` vào mảng phụ thuộc — đổi trang giờ tự tải lại
  // ĐÚNG dữ liệu của trang mới, không cần F5. Thêm effect riêng dọn sạch
  // các state hiển thị khác (lọc kỳ/lỗi/kết quả nhập/form sửa) khi đổi
  // trang — tránh còn sót lại báo lỗi/form dở của trang Chỉ tiêu trước đó.
  useEffect(reload, [filterPeriod, apiBase]);
  useEffect(() => {
    setFilterPeriod('');
    setFile(null);
    setImportResult(null);
    setError('');
    setEditForm(EMPTY_EDIT_FORM);
    setEditError('');
    setEditResult('');
    selection.clear();
  }, [apiBase]);

  async function deleteOne(row) {
    if (!confirm(`Xoá chỉ tiêu "${row.entityCode}" ngày ${String(row.periodMonth).slice(0, 10)}?`)) return;
    setDeletingId(row.id);
    try {
      await api.del(`${apiBase}/${row.id}`);
      selection.toggle(row); // bỏ chọn nếu đang tick, tránh sót trong lần xoá hàng loạt kế tiếp
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} chỉ tiêu đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`${apiBase}/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

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
    if (!editForm.entityCode.trim()) return setEditError(`Thiếu mã ${entityLabel}`);
    if (!editForm.periodMonth) return setEditError('Thiếu ngày áp dụng chỉ tiêu');
    let otherTargets;
    try {
      otherTargets = JSON.parse(editForm.otherTargetsJson || '{}');
    } catch {
      return setEditError('Ô "Chỉ tiêu khác" phải là JSON hợp lệ, vd {"ChiTieuDoanhThu": 100000000}');
    }
    setSavingEdit(true);
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
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', file);
    setImporting(true);
    try {
      const result = await api.post(`${apiBase}/import`, formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function downloadTemplate() {
    setError('');
    setDownloadingTemplate(true);
    try {
      await api.downloadFile(`${apiBase}/template`, 'mau-chi-tieu.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function downloadExport() {
    setError('');
    setDownloadingExport(true);
    try {
      const params = new URLSearchParams();
      if (filterPeriod) params.set('periodMonth', filterPeriod);
      const qs = params.toString();
      await api.downloadFile(`${apiBase}/export${qs ? `?${qs}` : ''}`, 'chi-tieu.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingExport(false);
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
        nguyên văn file mẫu thật đang dùng — không cần đổi tên cột trước khi tải lên. Bấm{' '}
        <strong>Tải file mẫu</strong> để lấy file .xlsx đúng khuôn cột của trang này (xoá dòng ví
        dụ mã "VIDU" rồi điền số liệu thật), hoặc <strong>Xuất Excel</strong> ở bảng bên dưới để
        tải về đúng dữ liệu đang lưu (mở sửa tiếp rồi nhập lại được luôn):
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
        tiêu THEO NGÀNH HÀNG thay vì cả siêu thị:
      </p>
      <ul>
        <li>Điền CẢ <code>MaSieuThi</code> VÀ <code>MaNganhHang</code> — mã thực thể lưu lại
          thành <code>&lt;MaSieuThi&gt;_&lt;MaNganhHang&gt;</code> (chỉ tiêu riêng 1 chi
          nhánh + 1 ngành hàng), PHẢI khớp đúng "Cột khoá" ETL của domain thực đạt tương ứng
          (xem hướng_dẫn_báo_cáo.md mục 5).</li>
        <li>Để TRỐNG <code>MaSieuThi</code>, CHỈ điền <code>MaNganhHang</code> — chỉ tiêu
          THEO TOÀN CÔNG TY cho đúng ngành hàng đó (không tách chi nhánh), mã thực thể lưu
          lại CHÍNH LÀ <code>MaNganhHang</code> — dùng cho trang{' '}
          <strong>Chỉ tiêu Doanh thu/Nhập hàng theo ngành hàng</strong> (xem báo cáo "Doanh
          thu/Nhập hàng theo ngành hàng.md").</li>
        <li>
          <strong>Riêng trang "Chỉ tiêu Doanh thu theo ngành hàng"/"(LDTD)"</strong> (bản
          9.73) — file mẫu/xuất KHÔNG CÒN cột <code>MaSieuThi</code> nữa (luôn "theo toàn
          công ty", không có khái niệm siêu thị ở 2 trang này) — chỉ còn{' '}
          <code>Thang</code>, <code>MaNganhHang</code>, và 4 cột chỉ tiêu tách riêng Bán
          lẻ/Bán buôn: <code>ChiTieuDoanhThuBanLe</code>, <code>ChiTieuDoanhThuBanBuon</code>,{' '}
          <code>ChiTieuLaiGopBanLe</code>, <code>ChiTieuLaiGopBanBuon</code> (cột "Total"
          trên báo cáo tự cộng 2 cột Bán lẻ + Bán buôn, không cần điền riêng).{' '}
          <strong>Bản 9.89</strong> — báo cáo có 3 khối riêng (Toàn hệ thống BRG/LFL/NSO),
          mỗi khối cần 1 bộ chỉ tiêu RIÊNG (3 số ĐỘC LẬP, KHÔNG tự cộng Tổng = LFL + NSO) —
          4 cột trên là chỉ tiêu khối <strong>"Toàn hệ thống BRG"</strong> (Total), thêm
          hậu tố <code>_LFL</code>/<code>_NSO</code> cho 2 khối còn lại: {' '}
          <code>ChiTieuDoanhThuBanLe_LFL</code>, <code>ChiTieuDoanhThuBanBuon_LFL</code>,{' '}
          <code>ChiTieuLaiGopBanLe_LFL</code>, <code>ChiTieuLaiGopBanBuon_LFL</code> (khối
          LFL), và tương tự đổi <code>_LFL</code> thành <code>_NSO</code> cho khối NSO — tổng
          12 cột chỉ tiêu. Khối nào CHƯA điền đủ bộ cột riêng sẽ hiện "—" ở "% so chỉ tiêu"
          của đúng khối đó (không còn dùng tạm số của khối khác như trước bản 9.89).
        </li>
      </ul>
      {error && <p className="form-error">{error}</p>}

      {isEditor && (
        <>
          <div className="inline-actions">
            <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
              {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
            </button>
          </div>
          <form className="stacked-form" onSubmit={submitImport}>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập chỉ tiêu'}</button>
          </form>
        </>
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
                ⚠️ {importResult.unknownEntityCodes.length} mã KHÔNG khớp bất kỳ {isNganhHangOnly ? 'ngành hàng' : 'chi nhánh'} nào
                đang có dữ liệu thực đạt — vẫn đã nhập bình thường, nhưng kiểm tra lại chính tả
                (nếu là {entityLabel} mới {isNganhHangOnly ? 'phát sinh' : 'mở'} chưa kịp có dữ liệu đồng bộ thì bỏ qua cảnh báo này):
              </p>
              <ul>{importResult.unknownEntityCodes.map((code, i) => <li key={i}>{code}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <h2>Chỉ tiêu đã nhập</h2>
      <div className="inline-actions">
        <DateInput value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} />
        <button type="button" onClick={downloadExport} disabled={downloadingExport}>
          {downloadingExport ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'entityCode', label: `Mã ${entityLabel}` },
          { key: 'periodMonth', label: 'Ngày áp dụng', render: (r) => String(r.periodMonth).slice(0, 10) },
          { key: 'targets', label: 'Chỉ tiêu', render: (r) => Object.entries(r.targets).map(([k, v]) => `${k}=${v}`).join(', ') },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          ...(isEditor ? [{
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => startEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => deleteOne(r)} disabled={deletingId === r.id}>
                  {deletingId === r.id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }] : [])
        ]}
        rows={rows}
        selection={isEditor ? selection : null}
      />

      {isEditor && selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      {isEditor && (
        <>
          <h2>Sửa / thêm 1 {entityLabel}</h2>
          <p>
            {isNganhHangOnly
              ? 'Dùng khi giữa tháng phát sinh ngành hàng mới hoặc cần sửa riêng 1 ngành hàng — KHÔNG cần chuẩn bị lại cả file Excel. Bấm "Sửa" ở 1 dòng trên để tự điền sẵn dữ liệu hiện có, hoặc "Thêm ngành hàng mới" cho dòng trống. Lưu sẽ GHI ĐÈ nguyên chỉ tiêu của đúng ngành hàng + tháng đó — dữ liệu hiện có đã tự điền sẵn nên không lo mất, chỉ cần sửa đúng phần cần đổi.'
              : 'Dùng khi giữa tháng có siêu thị mới mở hoặc đóng cửa — KHÔNG cần chuẩn bị lại cả file Excel. Bấm "Sửa" ở 1 dòng trên để tự điền sẵn dữ liệu hiện có, hoặc "Thêm siêu thị mới" cho dòng trống. Lưu sẽ GHI ĐÈ nguyên chỉ tiêu của đúng siêu thị + tháng đó — dữ liệu hiện có đã tự điền sẵn nên không lo mất, chỉ cần sửa đúng phần cần đổi.'}
          </p>
          {editError && <p className="form-error">{editError}</p>}
          {editResult && <p className="form-success">{editResult}</p>}

          <form className="stacked-form" onSubmit={submitEdit}>
            <input
              placeholder={isNganhHangOnly ? 'Mã ngành hàng — MaNganhHang (vd THUCPHAM)' : 'Mã thực thể — MaSieuThi (vd BRGHP), hoặc MaSieuThi_MaNganhHang cho chỉ tiêu theo ngành hàng (vd BRGHP_THUCPHAM)'}
              value={editForm.entityCode}
              onChange={(e) => setEditForm({ ...editForm, entityCode: e.target.value })}
              required
            />
            <DateInput
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
              {isNganhHangOnly ? `Ngừng áp dụng (loại ${entityLabel} này khỏi báo cáo tháng này)` : 'Đã đóng cửa (loại khỏi báo cáo tháng này)'}
            </label>
            <textarea
              placeholder={isNganhHangOnly
                ? 'Chỉ tiêu dạng JSON — 3 khối ĐỘC LẬP (Total/LFL/NSO, bản 9.89), vd {"ChiTieuDoanhThuBanLe": 100000000, "ChiTieuDoanhThuBanBuon": 50000000, "ChiTieuLaiGopBanLe": 18000000, "ChiTieuLaiGopBanBuon": 5000000, "ChiTieuDoanhThuBanLe_LFL": 70000000, "ChiTieuDoanhThuBanBuon_LFL": 35000000, "ChiTieuLaiGopBanLe_LFL": 13000000, "ChiTieuLaiGopBanBuon_LFL": 5000000, "ChiTieuDoanhThuBanLe_NSO": 30000000, "ChiTieuDoanhThuBanBuon_NSO": 15000000, "ChiTieuLaiGopBanLe_NSO": 5000000, "ChiTieuLaiGopBanBuon_NSO": 2000000}'
                : 'Chỉ tiêu khác dạng JSON, vd {"ChiTieuDoanhThu": 150000000} — nếu Mã thực thể ở trên là dạng ghép ngành hàng, nên thêm cả {"MaSieuThi": "BRGHP", "MaNganhHang": "THUCPHAM", "ChiTieuDoanhThu": 50000000} để báo cáo đọc thẳng, không phải tự tách chuỗi'}
              rows={4}
              value={editForm.otherTargetsJson}
              onChange={(e) => setEditForm({ ...editForm, otherTargetsJson: e.target.value })}
            />
            <div className="inline-actions">
              <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={startAdd}>Thêm {entityLabel} mới (form trống)</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
