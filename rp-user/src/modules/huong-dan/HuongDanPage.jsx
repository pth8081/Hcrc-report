// modules/huong-dan/HuongDanPage.jsx — Module "Hướng dẫn": nội dung viết
// CỨNG trong code (không có CRUD/CMS — sửa chữ thì sửa file này rồi deploy
// lại), tách riêng theo ĐÚNG nghiệp vụ rp-user (TẠO và XEM báo cáo — KHÔNG
// bao gồm phần chuẩn bị dữ liệu nguồn, đó là việc của etl-admin/api-admin,
// xem module "Hướng dẫn" ở 2 trang đó). Phân quyền xem: MenuCode
// 'huong-dan' qua RequireMenuAccess (quyền Xem thường, gán ở "Hệ thống →
// Phân quyền").
import { useState } from 'react';

const SECTIONS = [
  {
    title: 'Bắt đầu',
    items: [
      {
        id: 'tong-quan',
        icon: '🧭',
        label: 'Tổng quan hệ thống',
        content: (
          <>
            <h2>Tổng quan hệ thống</h2>
            <p>
              rp-user là nơi <strong>tạo và xem báo cáo</strong> — dữ liệu hiển thị đã được etl-admin/api-admin
              chuẩn bị sẵn (đồng bộ định kỳ hoặc đọc realtime). Muốn 1 báo cáo mới có số liệu, luôn kiểm tra
              dữ liệu nguồn đã sẵn sàng TRƯỚC (hỏi team etl-admin/api-admin), rồi mới tạo báo cáo ở đây.
            </p>
            <p>Báo cáo được tạo/cấu hình ở <strong>Hệ thống → Biểu mẫu</strong>, mỗi báo cáo chọn đúng 1 trong
              các "loại nguồn" (SourceType) dưới đây tuỳ tình huống.</p>
          </>
        )
      }
    ]
  },
  {
    title: 'Tạo báo cáo',
    items: [
      {
        id: 'direct-db',
        icon: '📄',
        label: 'Đọc thẳng 1 nguồn (directDb)',
        content: (
          <>
            <h2>Đọc thẳng 1 nguồn (directDb)</h2>
            <p>
              Loại ĐƠN GIẢN NHẤT — báo cáo hiện thẳng dữ liệu của 1 domain (1 "nhóm dữ liệu" đã đồng bộ bên
              etl-admin), cột hiển thị = cột dữ liệu hoặc công thức tính từ đó. Dùng khi không cần so sánh
              cùng kỳ/chỉ tiêu, không cần ghép nhiều nguồn.
            </p>
          </>
        )
      },
      {
        id: 'composite',
        icon: '🧩',
        label: 'Ghép nhiều nguồn (composite)',
        content: (
          <>
            <h2>Ghép nhiều nguồn (composite)</h2>
            <p>
              Dùng khi 1 báo cáo cần trộn NHIỀU khối dữ liệu vào chung 1 dòng theo mã thực thể (vd siêu thị) —
              ví dụ điển hình: "Thực đạt hôm nay" (đọc DWH hoặc gọi API Server realtime) + "Cùng kỳ năm trước"
              (đọc DWH) + "Chỉ tiêu" (đọc bảng chỉ tiêu). Cột hiển thị LUÔN là công thức tham chiếu theo tên
              khối (vd <code>current.measures.doanhThu</code>), không phải cột dữ liệu thô đơn giản.
            </p>
            <p>
              Hỗ trợ thêm dòng "Tổng cộng" theo nhóm (vd tổng theo MART/MINIMART) — cấu hình <code>groupBy</code>
              trong Biểu mẫu.
            </p>
          </>
        )
      },
      {
        id: 'api-report',
        icon: '🌐',
        label: 'Qua API Server (apiReport/apiRealtime)',
        content: (
          <>
            <h2>Qua API Server (apiReport/apiRealtime)</h2>
            <p>
              Dùng khi cần đọc số liệu REALTIME (đúng lúc gọi, không đợi đồng bộ định kỳ) — báo cáo gọi sang
              api-admin/api-server thay vì đọc thẳng Data Warehouse. Cần đã có kết nối API Server khai sẵn
              (Hệ thống → Biểu mẫu, mục kết nối) và đúng endpoint đã được api-admin tạo.
            </p>
            <p><strong>apiReport</strong> — dùng độc lập, cả báo cáo đọc qua API.
              <strong> apiRealtime</strong> — thường dùng làm 1 khối TRONG báo cáo composite (vd khối "hôm nay"),
              kết hợp với khối "Cùng kỳ"/"Chỉ tiêu" vẫn đọc Data Warehouse như thường.</p>
          </>
        )
      },
      {
        id: 'ton-kho',
        icon: '📦',
        label: 'Báo cáo tồn kho = 0 (đặc biệt)',
        content: (
          <>
            <h2>Báo cáo tồn kho = 0 (đặc biệt)</h2>
            <p>Có 2 báo cáo tồn kho = 0, cơ chế tính RIÊNG (không dùng cột thường như trên):</p>
            <ul>
              <li><strong>"Top bán chạy đang tồn kho = 0"</strong> — tự xếp hạng mặt hàng bán chạy nhất mỗi
                chi nhánh, không cần khai danh sách mặt hàng.</li>
              <li><strong>"Core stock = 0"</strong> (Mart/Minimart) — dùng danh sách mặt hàng "Core" cố định do
                etl-admin khai (không tự xếp hạng).</li>
            </ul>
            <p className="huong-dan-see-also">
              2 báo cáo này đã được tạo sẵn qua script (không cần dán tay DefinitionJson) — tài liệu kỹ thuật:
              <code> bc-ton-kho-0.md</code> / <code>bc-core-ton-kho-0.md</code> trong repo.
            </p>
          </>
        )
      },
      {
        id: 'bao-cao-tu-do',
        icon: '🔍',
        label: 'Báo cáo tự do (self-service)',
        content: (
          <>
            <h2>Báo cáo tự do (self-service)</h2>
            <p>
              Vào <strong>"Báo cáo tự do"</strong> — người dùng cuối (không cần admin tạo sẵn) tự chọn 1
              domain được cấp quyền, tự chọn cột/bộ lọc/sắp xếp, LƯU LẠI để dùng lại sau — giống trải nghiệm
              Power BI ở mức đơn giản. Chỉ thấy được domain nào đã được cấp quyền ở "Phân quyền".
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Trình bày báo cáo',
    items: [
      {
        id: 'bieu-do',
        icon: '📈',
        label: 'Biểu đồ',
        content: (
          <>
            <h2>Biểu đồ</h2>
            <p>
              Thêm biểu đồ (cột/đường/tròn...) cho báo cáo đã có bằng cách khai thêm 1 khoá trong
              DefinitionJson (Hệ thống → Biểu mẫu) — KHÔNG cần sửa <code>columns</code>/<code>blocks</code>
              đã có, biểu đồ dùng lại đúng dữ liệu báo cáo đã tính.
            </p>
          </>
        )
      },
      {
        id: 'dashboard',
        icon: '📊',
        label: 'Dashboard',
        content: (
          <>
            <h2>Dashboard</h2>
            <p>
              Gộp NHIỀU báo cáo/biểu đồ đã có sẵn vào 1 màn hình duy nhất, có ô lọc chung (vd chọn ngày) áp
              dụng cho mọi ô cùng lúc — dùng khi cần "màn hình tổng quan" thay vì mở từng báo cáo riêng lẻ.
            </p>
          </>
        )
      },
      {
        id: 'canh-bao',
        icon: '⚠️',
        label: 'Cảnh báo bất thường',
        content: (
          <>
            <h2>Cảnh báo bất thường</h2>
            <p>
              Tự động phát hiện chi nhánh/thực thể có số liệu LỆCH KHÁC THƯỜNG — 2 chế độ: so với kỳ trước
              (tỷ lệ % thay đổi vượt ngưỡng) hoặc ngưỡng tuyệt đối (vd cảnh báo sắp hết hàng khi tồn kho dưới
              1 mức cố định). Cấu hình ở Hệ thống → Cảnh báo bất thường.
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Vận hành',
    items: [
      {
        id: 'lich-email',
        icon: '⏱️',
        label: 'Lịch gửi email báo cáo',
        content: (
          <>
            <h2>Lịch gửi email báo cáo</h2>
            <p>
              Gửi TỰ ĐỘNG 1 báo cáo qua email theo lịch (nhiều giờ gửi/ngày nếu cần), dạng file đính kèm
              Excel/PDF hoặc dán thẳng nội dung vào email. Cấu hình ở Hệ thống → Lịch gửi email báo cáo —
              báo cáo BẤT KỲ đã có trong "Biểu mẫu" đều chọn được, không cần code thêm gì riêng cho từng
              báo cáo.
            </p>
          </>
        )
      },
      {
        id: 'xuat-file',
        icon: '⬇️',
        label: 'Xuất Excel/PDF',
        content: (
          <>
            <h2>Xuất Excel/PDF</h2>
            <p>
              Mọi báo cáo đều xuất được Excel/PDF ngay trên màn hình xem báo cáo — số liệu xuất ra LUÔN khớp
              đúng bảng đang xem trên web (cùng bộ lọc đang chọn).
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Quản trị hệ thống',
    items: [
      {
        id: 'phan-quyen',
        icon: '🔐',
        label: 'Phân quyền & Vai trò',
        content: (
          <>
            <h2>Phân quyền & Vai trò</h2>
            <p>Ở "Hệ thống → Phân quyền" — tạo vai trò, gán 3 LỚP quyền độc lập cho từng vai trò:</p>
            <ul>
              <li><strong>Menu</strong> — trang nào thấy được (vd "Hướng dẫn" đang xem chính là 1 menu).</li>
              <li><strong>Báo cáo</strong> — báo cáo cụ thể nào xem được (trong "Biểu mẫu").</li>
              <li><strong>Domain</strong> — chỉ áp dụng cho "Báo cáo tự do": nhóm dữ liệu nào được tự truy vấn.</li>
            </ul>
          </>
        )
      }
    ]
  }
];

export default function HuongDanPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].items[0].id);
  const active = SECTIONS.flatMap(s => s.items).find(i => i.id === activeId) || SECTIONS[0].items[0];

  return (
    <div className="page">
      <h1>Hướng dẫn</h1>
      <p className="form-hint">Hướng dẫn sử dụng rp-user theo đúng nghiệp vụ: tạo và xem báo cáo.</p>
      <div className="huong-dan-layout">
        <aside className="huong-dan-nav">
          {SECTIONS.map(section => (
            <div key={section.title} className="huong-dan-section">
              <div className="huong-dan-section-title">{section.title}</div>
              <ul>
                {section.items.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.id === activeId ? 'active' : ''}
                      onClick={() => setActiveId(item.id)}
                    >
                      <span className="huong-dan-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
        <div className="huong-dan-content">{active.content}</div>
      </div>
    </div>
  );
}
