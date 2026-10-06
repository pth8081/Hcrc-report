// modules/system/permissions/PermissionMatrixPage.jsx — "Ma trận phân
// quyền" (bản 8.94, theo yêu cầu người dùng: "thiết kế lại phân quyền
// nhóm, phân quyền user cho chuyên nghiệp hơn, tạo theo kiểu ma trận phân
// quyền báo cáo cho dễ nhìn"). BỔ SUNG thêm cách xem/sửa quyền — KHÔNG thay
// thế UsersPage.jsx/RolesPage.jsx (vẫn giữ nguyên, dùng cho các thao tác
// khác như tạo/khoá/gán vai trò/gán quyền riêng từng người).
//
// 3 tab, mỗi tab 1 bảng lưới (hàng × cột), bấm trực tiếp vào ô để bật/tắt —
// TỰ LƯU NGAY (không có nút "Lưu" chung), theo đúng quy ước khoá nút khi
// gửi server (CLAUDE.md) áp dụng cho TỪNG Ô thay vì 1 nút submit:
//   - "Theo Nhóm": Vai trò × Báo cáo (app.RoleReportAccess)
//   - "Theo Người dùng": Người dùng × Báo cáo, quyền RIÊNG cộng dồn
//     (app.UserReportAccess) — KHÔNG thay thế quyền theo Vai trò, chỉ cộng
//     thêm, giống hệt ý nghĩa nút "Gán quyền riêng" ở UsersPage.jsx.
//   - "Ma trận Dashboard": Vai trò × (Dashboard, nhóm) — 2 cột con mỗi
//     nhóm (Xem/Xuất), app.RoleDashboardGroupAccess.
//
// LƯU Ý THIẾT KẾ: mỗi route ghi (PUT .../:id/report-access,
// .../:id/dashboard-group-access) đã có sẵn từ trước (RolesPage.jsx/
// UsersPage.jsx cũ) và THAY THẾ TOÀN BỘ danh sách của đúng 1 hàng (Vai
// trò/Người dùng) đó — vì ma trận giữ ĐỦ state của mọi ô trong 1 hàng ngay
// trên client, bấm 1 ô chỉ cần tính lại mảng đầy đủ của hàng đó rồi gọi
// LẠI ĐÚNG route cũ, không cần thêm route "sửa 1 ô" riêng ở backend.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';

function groupReportsByDomain(reports) {
  const groups = [];
  const byDomain = new Map();
  for (const r of reports) {
    const key = r.domain || '(Khác)';
    if (!byDomain.has(key)) {
      const group = { domain: key, reports: [] };
      byDomain.set(key, group);
      groups.push(group);
    }
    byDomain.get(key).reports.push(r);
  }
  return groups;
}

function ReportMatrix({ rowsLabel, loadUrl, saveUrlFor, rowKey, rowLabelOf }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [savingCell, setSavingCell] = useState(null); // `${rowId}:${reportId}`

  function reload() {
    api.get(loadUrl).then(setData).catch(err => setError(err.message));
  }
  useEffect(reload, [loadUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data ? (data.roles || data.users) : [];
  const reports = data?.reports || [];
  const filteredReports = useMemo(
    () => (search.trim() ? reports.filter(r => r.title.toLowerCase().includes(search.trim().toLowerCase())) : reports),
    [reports, search]
  );
  const domainGroups = useMemo(() => groupReportsByDomain(filteredReports), [filteredReports]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="form-hint">Đang tải...</p>;

  function toggleCell(row) {
    const id = rowKey(row);
    return async (reportId) => {
      const cellKey = `${id}:${reportId}`;
      const originalIds = data.access[id] || [];
      const current = new Set(originalIds);
      if (current.has(reportId)) current.delete(reportId); else current.add(reportId);
      const nextIds = Array.from(current);
      // Cập nhật lạc quan (optimistic) ngay trên giao diện — khoá ĐÚNG ô
      // vừa bấm trong lúc chờ server (không khoá cả hàng/cả bảng).
      setData(prev => ({ ...prev, access: { ...prev.access, [id]: nextIds } }));
      setSavingCell(cellKey);
      try {
        await api.put(saveUrlFor(id), { reportIds: nextIds });
      } catch (err) {
        // Lỗi — hoàn tác lại ĐÚNG giá trị trước khi bấm, báo lỗi.
        setData(prev => ({ ...prev, access: { ...prev.access, [id]: originalIds } }));
        setError(err.message);
      } finally {
        setSavingCell(null);
      }
    };
  }

  return (
    <>
      <div className="matrix-toolbar">
        <input placeholder="🔎 Tìm báo cáo theo tên..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="form-hint">{rows.length} {rowsLabel} × {filteredReports.length} báo cáo — bấm ô để bật/tắt, tự lưu ngay.</span>
      </div>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr className="domain-row">
              <th rowSpan={2}></th>
              {domainGroups.map(g => <th key={g.domain} colSpan={g.reports.length}>{g.domain}</th>)}
            </tr>
            <tr className="report-row">
              {domainGroups.map(g => g.reports.map(r => <th key={r.reportId} title={r.title}>{r.title}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const id = rowKey(row);
              const granted = new Set(data.access[id] || []);
              const onToggle = toggleCell(row);
              return (
                <tr key={id}>
                  <th>{rowLabelOf(row)}</th>
                  {domainGroups.map(g => g.reports.map(r => {
                    const cellKey = `${id}:${r.reportId}`;
                    const isOn = granted.has(r.reportId);
                    const isSaving = savingCell === cellKey;
                    return (
                      <td
                        key={r.reportId}
                        className={isOn ? 'on' : 'off'}
                        aria-disabled={isSaving}
                        style={isSaving ? { opacity: 0.5, cursor: 'wait' } : undefined}
                        onClick={() => { if (!isSaving) onToggle(r.reportId); }}
                      />
                    );
                  }))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="matrix-legend">
        <span className="legend-dot"><span className="legend-box legend-box--on"></span> Có quyền xem</span>
        <span className="legend-dot"><span className="legend-box"></span> Không có quyền</span>
      </div>
    </>
  );
}

function DashboardMatrix() {
  const [catalog, setCatalog] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [savingCell, setSavingCell] = useState(null);

  function reload() {
    api.get('/system/roles/dashboard-groups-catalog').then(setCatalog).catch(err => setError(err.message));
    api.get('/system/roles/dashboard-access-matrix').then(setData).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!catalog || !data) return <p className="form-hint">Đang tải...</p>;

  async function toggleCell(roleId, group, field) {
    const cellKey = `${roleId}:${group.dashboardId}::${group.groupKey}:${field}`;
    const roleAccess = { ...(data.access[roleId] || {}) };
    const mapKey = `${group.dashboardId}::${group.groupKey}`;
    const current = roleAccess[mapKey] || { canView: false, canExport: false };
    const next = { ...current, [field]: !current[field] };
    if (field === 'canView' && !next.canView) next.canExport = false;
    const nextRoleAccess = { ...roleAccess, [mapKey]: next };
    setData(prev => ({ ...prev, access: { ...prev.access, [roleId]: nextRoleAccess } }));
    setSavingCell(cellKey);
    try {
      const entries = catalog.map(g => {
        const k = `${g.dashboardId}::${g.groupKey}`;
        const a = nextRoleAccess[k] || { canView: false, canExport: false };
        return { dashboardId: g.dashboardId, groupKey: g.groupKey, canView: a.canView, canExport: a.canExport };
      });
      await api.put(`/system/roles/${roleId}/dashboard-group-access`, { entries });
    } catch (err) {
      setData(prev => ({ ...prev, access: { ...prev.access, [roleId]: roleAccess } }));
      setError(err.message);
    } finally {
      setSavingCell(null);
    }
  }

  return (
    <>
      <p className="form-hint">{data.roles.length} nhóm × {catalog.length} nhóm Dashboard — mỗi nhóm có 2 cột: "Xem" (vào được dashboard) và "Xuất" (xem chi tiết/xuất Excel-PDF, chỉ bật được khi đã bật "Xem").</p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr className="domain-row">
              <th rowSpan={2}></th>
              {catalog.map(g => <th key={`${g.dashboardId}::${g.groupKey}`} colSpan={2}>{g.groupIcon} {g.groupLabel}</th>)}
            </tr>
            <tr className="report-row">
              {catalog.map(g => (
                <Fragment key={`${g.dashboardId}::${g.groupKey}`}>
                  <th>Xem</th>
                  <th>Xuất</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.roles.map(role => (
              <tr key={role.id}>
                <th>{role.name}</th>
                {catalog.map(g => {
                  const mapKey = `${g.dashboardId}::${g.groupKey}`;
                  const a = (data.access[role.id] || {})[mapKey] || { canView: false, canExport: false };
                  const viewKey = `${role.id}:${mapKey}:canView`;
                  const exportKey = `${role.id}:${mapKey}:canExport`;
                  return (
                    <Fragment key={mapKey}>
                      <td
                        className={a.canView ? 'on' : 'off'}
                        style={savingCell === viewKey ? { opacity: 0.5, cursor: 'wait' } : undefined}
                        onClick={() => { if (savingCell !== viewKey) toggleCell(role.id, g, 'canView'); }}
                      />
                      <td
                        className={a.canExport ? 'on' : 'off'}
                        style={!a.canView ? { opacity: 0.35 } : (savingCell === exportKey ? { opacity: 0.5, cursor: 'wait' } : undefined)}
                        onClick={() => { if (a.canView && savingCell !== exportKey) toggleCell(role.id, g, 'canExport'); }}
                      />
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="matrix-legend">
        <span className="legend-dot"><span className="legend-box legend-box--on"></span> Có quyền</span>
        <span className="legend-dot"><span className="legend-box"></span> Không có quyền (cột "Xuất" mờ = chưa bật "Xem")</span>
      </div>
    </>
  );
}

export default function PermissionMatrixPage() {
  const [tab, setTab] = useState('roles');

  return (
    <div>
      <h2>Ma trận phân quyền báo cáo</h2>
      <div className="tabs">
        <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Theo Nhóm (Vai trò)</button>
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Theo Người dùng (quyền riêng)</button>
        <button type="button" className={tab === 'dashboards' ? 'active' : ''} onClick={() => setTab('dashboards')}>Ma trận Dashboard</button>
      </div>
      {tab === 'roles' && (
        <ReportMatrix
          rowsLabel="vai trò"
          loadUrl="/system/roles/access-matrix"
          saveUrlFor={(id) => `/system/roles/${id}/report-access`}
          rowKey={(row) => row.id}
          rowLabelOf={(row) => row.name}
        />
      )}
      {tab === 'users' && (
        <>
          <p className="form-hint">
            Quyền ở đây CỘNG THÊM vào quyền theo vai trò đang giữ, không thay thế — giống hệt nút
            "Gán quyền riêng" ở trang "Người dùng", chỉ xem được tổng quan nhiều người cùng lúc.
          </p>
          <ReportMatrix
            rowsLabel="người dùng"
            loadUrl="/system/users/access-matrix"
            saveUrlFor={(id) => `/system/users/${id}/report-access`}
            rowKey={(row) => row.id}
            rowLabelOf={(row) => row.fullName || row.username}
          />
        </>
      )}
      {tab === 'dashboards' && <DashboardMatrix />}
    </div>
  );
}
