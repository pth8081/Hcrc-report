// components/ReportSummaryCards.jsx — Khối 3 thẻ "Tổng doanh thu toàn hệ
// thống"/"Doanh thu khối <nhóm>" vẽ phía TRÊN bảng chi tiết báo cáo (bản
// 10.21, theo yêu cầu người dùng — "nó thể hiện được cái doanh thu của
// tổng, doanh thu của Minimart và doanh thu của Mart nó rõ ràng hơn, không
// phải nhìn vào một cái dòng... màu sắc hiện đại, giống các cái đơn vị tổ
// chức quốc tế tài chính" — xem demo đã gửi qua Artifact trước khi code).
// CHỈ hiện khi `cards` có dữ liệu (result.summaryCards từ POST /:reportId/run
// — xem routes/reports.js + rp-server/lib/reportCellFormat.js:computeSummaryCards()).
// KHÔNG đổi gì bảng chi tiết bên dưới (ReportBody/DataTable.jsx).
import { formatCellValue } from '../lib/formatCell';

function Trend({ lfl }) {
  if (lfl === null || lfl === undefined) return null;
  const delta = Math.round(lfl) - 100;
  const up = delta >= 0;
  return (
    <span className={`rsc-chip ${up ? 'rsc-chip--up' : 'rsc-chip--down'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}% cùng kỳ
    </span>
  );
}

function Card({ hero, icon, label, card, extra }) {
  if (!card) return null;
  return (
    <div className={`rsc-card ${hero ? 'rsc-card--hero' : 'rsc-card--light'}`}>
      <div className="rsc-label"><span className="rsc-icon">{icon}</span> {label}</div>
      <div className="rsc-row">
        <span className="rsc-value">{formatCellValue(card.thucDat)}<span className="rsc-unit">đ</span></span>
        {card.tyLeDat !== null && <span className="rsc-chip rsc-chip--warn">{formatCellValue(card.tyLeDat, { format: 'percent' })} chỉ tiêu</span>}
        <Trend lfl={card.lfl} />
      </div>
      {card.chiTieu !== null && (
        <div className="rsc-target">Chỉ tiêu: <b>{formatCellValue(card.chiTieu)} đ</b>{extra ? ` · ${extra}` : ''}</div>
      )}
    </div>
  );
}

export default function ReportSummaryCards({ cards }) {
  if (!cards?.grand) return null;
  return (
    <div className="rsc-grid">
      <Card hero icon="Σ" label="Tổng doanh thu toàn hệ thống" card={cards.grand} />
      {cards.groups.map(g => (
        <Card key={g.label} icon={(g.label || '?').replace('Tổng cộng ', '').slice(0, 1)} label={`Doanh thu khối ${(g.label || '').replace('Tổng cộng ', '')}`} card={g} />
      ))}
    </div>
  );
}
