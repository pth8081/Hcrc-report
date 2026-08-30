import { useState } from 'react';
import ReportCatalogPanel from './ReportCatalogPanel';
import DataSourcesPanel from './DataSourcesPanel';
import ApiConnectionsPanel from './ApiConnectionsPanel';

const PANELS = {
  reports: ReportCatalogPanel,
  sources: DataSourcesPanel,
  apiConnections: ApiConnectionsPanel
};

export default function ReportCatalogPage() {
  const [tab, setTab] = useState('reports');
  const Panel = PANELS[tab];

  return (
    <div className="page">
      <h1>Biểu mẫu</h1>
      <div className="tabs">
        <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Báo cáo</button>
        <button type="button" className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>Nguồn dữ liệu bổ sung</button>
        <button type="button" className={tab === 'apiConnections' ? 'active' : ''} onClick={() => setTab('apiConnections')}>Kết nối API Server</button>
      </div>
      <Panel />
    </div>
  );
}
