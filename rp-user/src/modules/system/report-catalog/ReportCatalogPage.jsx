import { useState } from 'react';
import ReportCatalogPanel from './ReportCatalogPanel';
import DataSourcesPanel from './DataSourcesPanel';

export default function ReportCatalogPage() {
  const [tab, setTab] = useState('reports');

  return (
    <div className="page">
      <h1>Biểu mẫu</h1>
      <div className="tabs">
        <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Báo cáo</button>
        <button type="button" className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>Nguồn dữ liệu bổ sung</button>
      </div>
      {tab === 'reports' ? <ReportCatalogPanel /> : <DataSourcesPanel />}
    </div>
  );
}
