// pages/PromoCampaignsPage.jsx — Trang "Chiến dịch khuyến mãi (BRG Weekly
// Post)": quản lý "dữ liệu gốc" của TỪNG chiến dịch khuyến mãi (Báo cáo 3
// MKT) — admin tạo chiến dịch, upload file SKU (chỉ tiêu cả chuỗi) + file
// trọng số siêu thị (chia chỉ tiêu về từng siêu thị) — xem
// "bc-brg-weekly-post.md" + etl/routes/admin/promoCampaigns.js. Số liệu
// THỰC TẾ (bán hàng/tồn kho) KHÔNG upload ở đây — báo cáo tự đọc từ domain
// đã có sẵn.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';

const EMPTY_CAMPAIGN_FORM = { name: '', startDate: '', endDate: '', dataUpdatedThrough: '' };

export default function PromoCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');
  const [campaignForm, setCampaignForm] = useState(EMPTY_CAMPAIGN_FORM);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  function reloadCampaigns() {
    api.get('/promo-campaigns').then(setCampaigns).catch(err => setError(err.message));
  }
  useEffect(reloadCampaigns, []);

  function startEditCampaign(c) {
    setEditingCampaignId(c.id);
    setCampaignForm({
      name: c.name,
      startDate: (c.startDate || '').slice(0, 10),
      endDate: (c.endDate || '').slice(0, 10),
      dataUpdatedThrough: (c.dataUpdatedThrough || '').slice(0, 10)
    });
  }
  function startAddCampaign() {
    setEditingCampaignId(null);
    setCampaignForm(EMPTY_CAMPAIGN_FORM);
  }

  async function submitCampaign(e) {
    e.preventDefault();
    setError('');
    if (!campaignForm.name.trim()) return setError('Thiếu tên chiến dịch');
    if (!campaignForm.startDate || !campaignForm.endDate) return setError('Thiếu ngày bắt đầu/kết thúc');
    setSavingCampaign(true);
    try {
      const payload = {
        name: campaignForm.name.trim(),
        startDate: campaignForm.startDate,
        endDate: campaignForm.endDate,
        dataUpdatedThrough: campaignForm.dataUpdatedThrough || null
      };
      if (editingCampaignId) {
        await api.put(`/promo-campaigns/${editingCampaignId}`, payload);
      } else {
        await api.post('/promo-campaigns', payload);
      }
      setCampaignForm(EMPTY_CAMPAIGN_FORM);
      setEditingCampaignId(null);
      reloadCampaigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCampaign(false);
    }
  }

  async function removeCampaign(c) {
    if (!window.confirm(`Xoá chiến dịch "${c.name}"? Sẽ xoá kèm TOÀN BỘ SKU/trọng số siêu thị đã upload.`)) return;
    setDeletingCampaignId(c.id);
    try {
      await api.del(`/promo-campaigns/${c.id}`);
      if (selectedCampaignId === c.id) setSelectedCampaignId(null);
      reloadCampaigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingCampaignId(null);
    }
  }

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || null;

  return (
    <div className="page">
      <h1>Chiến dịch khuyến mãi (BRG Weekly Post)</h1>
      <p>
        Mỗi chiến dịch khuyến mãi cần 2 file Excel RIÊNG (admin tự chuẩn bị, KHÔNG phải file báo
        cáo MKT đã gửi — đó là báo cáo ĐẦU RA): <strong>SKU</strong> (giá/scope/chỉ tiêu Số lượng-
        Doanh thu CẢ CHUỖI cho từng mã hàng) và <strong>Trọng số siêu thị</strong> (1 số/siêu thị,
        dùng để CHIA chỉ tiêu cả chuỗi của mỗi SKU về từng siêu thị theo tỉ lệ trọng số đó so với
        tổng trọng số mọi siêu thị trong chiến dịch). Số liệu THỰC TẾ (bán hàng/tồn kho) KHÔNG
        upload ở đây — báo cáo tự đọc từ dữ liệu đã đồng bộ.
      </p>
      {error && <div className="form-error"><p>{error}</p></div>}

      <h2>Danh sách chiến dịch</h2>
      <DataTable
        columns={[
          { key: 'name', label: 'Tên chiến dịch' },
          { key: 'startDate', label: 'Bắt đầu', render: (r) => (r.startDate || '').slice(0, 10) },
          { key: 'endDate', label: 'Kết thúc', render: (r) => (r.endDate || '').slice(0, 10) },
          { key: 'dataUpdatedThrough', label: 'Cập nhật số liệu tới', render: (r) => (r.dataUpdatedThrough || '').slice(0, 10) || '—' },
          { key: 'skuCount', label: 'Số SKU' },
          { key: 'storeWeightCount', label: 'Số siêu thị (trọng số)' },
          { key: 'isActive', label: 'Trạng thái', render: (r) => (r.isActive ? 'Đang hoạt động' : 'Đã khoá') },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => setSelectedCampaignId(r.id)}>Quản lý SKU/Trọng số</button>{' '}
                <button type="button" onClick={() => startEditCampaign(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => removeCampaign(r)} disabled={deletingCampaignId === r.id}>
                  {deletingCampaignId === r.id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ]}
        rows={campaigns}
      />

      <h2>{editingCampaignId ? 'Sửa chiến dịch' : 'Thêm chiến dịch mới'}</h2>
      <form className="stacked-form" onSubmit={submitCampaign}>
        <input
          placeholder="Tên chiến dịch (vd Gia Đình Là Số 1 - T6 Kỳ 2)"
          value={campaignForm.name}
          onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
          required
        />
        <label>
          Ngày bắt đầu CTKM
          <input type="date" value={campaignForm.startDate} onChange={(e) => setCampaignForm({ ...campaignForm, startDate: e.target.value })} required />
        </label>
        <label>
          Ngày kết thúc CTKM
          <input type="date" value={campaignForm.endDate} onChange={(e) => setCampaignForm({ ...campaignForm, endDate: e.target.value })} required />
        </label>
        <label>
          Cập nhật số liệu tới ngày (tuỳ chọn — mặc định báo cáo tính tới hôm nay)
          <input type="date" value={campaignForm.dataUpdatedThrough} onChange={(e) => setCampaignForm({ ...campaignForm, dataUpdatedThrough: e.target.value })} />
        </label>
        <div className="inline-actions">
          <button type="submit" disabled={savingCampaign}>{savingCampaign ? 'Đang lưu...' : 'Lưu'}</button>
          <button type="button" onClick={startAddCampaign}>Thêm chiến dịch mới (form trống)</button>
        </div>
      </form>

      {selectedCampaign && <CampaignDetail campaign={selectedCampaign} onClose={() => setSelectedCampaignId(null)} />}
    </div>
  );
}

function CampaignDetail({ campaign, onClose }) {
  return (
    <div style={{ marginTop: 24, borderTop: '2px solid #ccc', paddingTop: 16 }}>
      <h2>Chi tiết chiến dịch: {campaign.name} <button type="button" onClick={onClose}>Đóng</button></h2>
      <SkuPanel campaignId={campaign.id} />
      <StoreWeightPanel campaignId={campaign.id} />
    </div>
  );
}

function SkuPanel({ campaignId }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const selection = useRowSelection(row => row.id);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get(`/promo-campaigns/${campaignId}/skus`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [campaignId]);

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');
    const formData = new FormData();
    formData.append('file', file);
    setImporting(true);
    try {
      const result = await api.post(`/promo-campaigns/${campaignId}/skus/import`, formData, true);
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
    setDownloadingTemplate(true);
    try {
      await api.downloadFile('/promo-campaigns/skus/template', 'mau-sku-chien-dich-km.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  // exportSkus (bản 11.39, theo yêu cầu người dùng) — xuất ĐÚNG danh sách
  // SKU đang lưu (KHÁC "Tải file mẫu" — 2 dòng ví dụ cố định).
  async function exportSkus() {
    setExporting(true);
    try {
      await api.downloadFile(`/promo-campaigns/${campaignId}/skus/export`, 'sku-chien-dich-km.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Xoá SKU "${row.maHang}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.del(`/promo-campaigns/${campaignId}/skus/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} SKU đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/promo-campaigns/${campaignId}/skus/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  return (
    <div>
      <h3>SKU (chỉ tiêu cả chuỗi)</h3>
      {error && <div className="form-error"><p>{error}</p></div>}
      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
          {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
        </button>
        <button type="button" onClick={exportSkus} disabled={exporting || !rows.length}>
          {exporting ? 'Đang xuất...' : 'Xuất file'}
        </button>
      </div>
      <form className="stacked-form" onSubmit={submitImport}>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập file SKU'}</button>
      </form>
      {importResult && (
        <div className="import-result">
          <p>✅ Đã thêm mới {importResult.inserted}, cập nhật {importResult.updated} dòng.</p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}
      <DataTable
        columns={[
          { key: 'maHang', label: 'Mã hàng' },
          { key: 'skuCode', label: 'Mã hiển thị' },
          { key: 'skuName', label: 'Tên hàng' },
          { key: 'deptName', label: 'Ngành hàng' },
          { key: 'giaBanLe', label: 'Giá bán lẻ' },
          { key: 'giaKmMart', label: 'Giá KM Mart' },
          { key: 'giaKmMini', label: 'Giá KM Mini' },
          { key: 'applyScope', label: 'Áp dụng' },
          { key: 'soLuongKeHoachTotal', label: 'SL kế hoạch (cả chuỗi)' },
          { key: 'doanhThuKeHoachTotal', label: 'DT kế hoạch (cả chuỗi)' },
          {
            key: 'actions', label: '', render: (r) => (
              <button type="button" onClick={() => removeRow(r)} disabled={deletingId === r.id}>
                {deletingId === r.id ? 'Đang xoá...' : 'Xoá'}
              </button>
            )
          }
        ]}
        rows={rows}
        selection={selection}
      />
      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}
    </div>
  );
}

function StoreWeightPanel({ campaignId }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const selection = useRowSelection(row => row.id);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get(`/promo-campaigns/${campaignId}/store-weights`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [campaignId]);

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');
    const formData = new FormData();
    formData.append('file', file);
    setImporting(true);
    try {
      const result = await api.post(`/promo-campaigns/${campaignId}/store-weights/import`, formData, true);
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
    setDownloadingTemplate(true);
    try {
      await api.downloadFile('/promo-campaigns/store-weights/template', 'mau-trong-so-sieu-thi-km.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  // exportStoreWeights (bản 11.39, theo yêu cầu người dùng) — xuất ĐÚNG
  // danh sách trọng số đang lưu (KHÁC "Tải file mẫu" — 2 dòng ví dụ cố định).
  async function exportStoreWeights() {
    setExporting(true);
    try {
      await api.downloadFile(`/promo-campaigns/${campaignId}/store-weights/export`, 'trong-so-sieu-thi-km.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Xoá trọng số mã Điểm "${row.maDiem}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.del(`/promo-campaigns/${campaignId}/store-weights/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} dòng đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/promo-campaigns/${campaignId}/store-weights/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  const totalWeight = rows.reduce((s, r) => s + (r.storeWeight || 0), 0);

  return (
    <div style={{ marginTop: 24 }}>
      <h3>Trọng số siêu thị</h3>
      {error && <div className="form-error"><p>{error}</p></div>}
      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
          {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
        </button>
        <button type="button" onClick={exportStoreWeights} disabled={exporting || !rows.length}>
          {exporting ? 'Đang xuất...' : 'Xuất file'}
        </button>
      </div>
      <form className="stacked-form" onSubmit={submitImport}>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập file trọng số'}</button>
      </form>
      {importResult && (
        <div className="import-result">
          <p>✅ Đã thêm mới {importResult.inserted}, cập nhật {importResult.updated} dòng.</p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}
      <p>Tổng trọng số hiện có: {totalWeight.toLocaleString('vi-VN')} ({rows.length} siêu thị)</p>
      <DataTable
        columns={[
          { key: 'maDiem', label: 'Mã điểm' },
          { key: 'storeWeight', label: 'Trọng số', render: (r) => r.storeWeight?.toLocaleString('vi-VN') },
          {
            key: 'shareOfTotal', label: 'Tỉ lệ / tổng',
            render: (r) => (totalWeight > 0 ? `${((r.storeWeight / totalWeight) * 100).toFixed(2)}%` : '—')
          },
          {
            key: 'actions', label: '', render: (r) => (
              <button type="button" onClick={() => removeRow(r)} disabled={deletingId === r.id}>
                {deletingId === r.id ? 'Đang xoá...' : 'Xoá'}
              </button>
            )
          }
        ]}
        rows={rows}
        selection={selection}
      />
      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}
    </div>
  );
}
