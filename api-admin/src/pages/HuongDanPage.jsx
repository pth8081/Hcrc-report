// pages/HuongDanPage.jsx — Module "Hướng dẫn": nội dung viết CỨNG trong
// code (không có CRUD/CMS — sửa chữ thì sửa file này rồi deploy lại), tách
// riêng theo ĐÚNG nghiệp vụ api-admin (phục vụ dữ liệu REALTIME cho báo cáo
// "hôm nay" + cho đối tác ngoài tra cứu/ghi nhận — KHÁC etl-admin, vốn chỉ
// đồng bộ ĐỊNH KỲ vào Data Warehouse). Phân quyền xem: MenuCode
// 'huong-dan' qua quyền Xem thường, gán ở trang "Vai trò".
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
              api-admin quản trị <strong>api-server</strong> — dịch vụ đọc/ghi TRỰC TIẾP vào CSDL vận hành
              thật của từng siêu thị (KHÔNG qua bước đồng bộ định kỳ như etl-admin). Dùng khi:
            </p>
            <ul>
              <li>Báo cáo bên rp-user cần số liệu "hôm nay" theo thời gian thực (không đợi tới lần đồng bộ
                tiếp theo) — vd doanh thu trong ngày.</li>
              <li>1 đối tác/hệ thống NGOÀI cần tra cứu hoặc ghi nhận trực tiếp 1 dữ liệu cụ thể — vd kiểm tra
                trạng thái voucher, báo đã sử dụng.</li>
            </ul>
            <p>
              Khác etl-admin (chuẩn bị dữ liệu LỊCH SỬ, đồng bộ theo lịch, phục vụ báo cáo tổng hợp/so sánh
              nhiều ngày) — api-server luôn đọc số liệu ĐANG CÓ tại đúng thời điểm gọi.
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Kết nối dữ liệu',
    items: [
      {
        id: 'nguon-du-lieu',
        icon: '🔌',
        label: 'Khai nguồn dữ liệu',
        content: (
          <>
            <h2>Khai nguồn dữ liệu</h2>
            <p>
              Vào trang <strong>"Nguồn dữ liệu"</strong> — mỗi siêu thị cần tra cứu/ghi realtime khai
              <strong> 1 dòng kết nối</strong> tới ĐÚNG CSDL vận hành của siêu thị đó (không phải bản sao/lịch
              sử). Hệ thống tự kiểm tra kết nối ngay khi lưu.
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Endpoint',
    items: [
      {
        id: 'endpoint-doc',
        icon: '⚡',
        label: 'Endpoint realtime (đọc)',
        content: (
          <>
            <h2>Endpoint realtime (đọc)</h2>
            <p>
              Vào trang <strong>"Endpoint realtime"</strong> — khai 1 bảng/view muốn cho phép đọc, có thể JOIN
              thêm TỐI ĐA 1 bảng phụ trong cùng CSDL (vd bảng chính + bảng chi tiết). 2 kiểu dùng phổ biến:
            </p>
            <ul>
              <li><strong>Tra theo 1 khoá (lookupField)</strong> — dùng cho báo cáo "tra cứu 1 mã" (vd kiểm tra
                voucher): người gọi truyền đúng 1 giá trị khoá, trả về đúng 1 dòng khớp.</li>
              <li><strong>Danh sách</strong> — trả về nhiều dòng theo bộ lọc, dùng cho khối "hôm nay" trong
                báo cáo composite bên rp-user.</li>
            </ul>
          </>
        )
      },
      {
        id: 'endpoint-ghi',
        icon: '✍️',
        label: 'Endpoint ghi',
        content: (
          <>
            <h2>Endpoint ghi</h2>
            <p>
              Vào trang <strong>"Endpoint ghi"</strong> — cho phép đối tác ngoài GHI NHẬN 1 thay đổi vào CSDL
              vận hành (vd đánh dấu 1 voucher "đã sử dụng"). Mọi yêu cầu ghi đều được ký bằng HMAC (đối tác
              cần đúng khoá bí mật được cấp) để chống giả mạo — xem thêm ở mục "Đối tác".
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Đối tác & bảo mật',
    items: [
      {
        id: 'doi-tac',
        icon: '🤝',
        label: 'Đối tác (API key)',
        content: (
          <>
            <h2>Đối tác (API key)</h2>
            <p>
              Vào trang <strong>"Đối tác"</strong> — tạo 1 hồ sơ đối tác cho MỖI hệ thống ngoài (hoặc chính
              rp-server) cần gọi API. Mỗi đối tác có:
            </p>
            <ul>
              <li><strong>API key riêng</strong> — không dùng chung giữa các đối tác.</li>
              <li><strong>Giới hạn tốc độ gọi</strong> (số lượt/phút) — chống 1 đối tác gọi quá tải làm ảnh
                hưởng đối tác khác.</li>
              <li><strong>Phạm vi truy cập</strong> — chỉ được gọi ĐÚNG những endpoint (đọc/ghi) đã được cấp,
                không tự động thấy hết mọi endpoint đã tạo.</li>
            </ul>
          </>
        )
      }
    ]
  },
  {
    title: 'Giám sát',
    items: [
      {
        id: 'giam-sat',
        icon: '🌐',
        label: 'Kết nối hiện tại / Lịch sử / Top truy vấn',
        content: (
          <>
            <h2>Kết nối hiện tại / Lịch sử / Top truy vấn</h2>
            <p>3 trang giám sát dùng khi cần điều tra sự cố hoặc theo dõi tải hệ thống:</p>
            <ul>
              <li><strong>"Kết nối hiện tại"</strong> — các yêu cầu ĐANG xử lý ngay lúc này.</li>
              <li><strong>"Lịch sử"</strong> — nhật ký mọi yêu cầu đã xử lý (thành công/lỗi, thời gian phản hồi).</li>
              <li><strong>"Top truy vấn"</strong> — endpoint nào được gọi nhiều nhất/chậm nhất, dùng để phát
                hiện đối tác gọi bất thường hoặc endpoint cần tối ưu.</li>
            </ul>
          </>
        )
      },
      {
        id: 'audit-log',
        icon: '📜',
        label: 'Nhật ký thao tác',
        content: (
          <>
            <h2>Nhật ký thao tác</h2>
            <p>
              Ghi lại MỌI thao tác thêm/sửa/xoá của tài khoản quản trị trên chính api-admin (khác "Lịch sử" ở
              trên — đó là nhật ký GỌI API của đối tác, đây là nhật ký THAO TÁC CẤU HÌNH của người quản trị).
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
            <p>
              Trang <strong>"Vai trò"</strong> — tạo vai trò tuỳ ý, gán quyền Xem/Sửa cho từng trang (menu).
              Trang <strong>"Tài khoản quản trị"</strong> — tạo tài khoản, gán 1 hay nhiều vai trò cho từng
              tài khoản. Lưu ý: đây là quyền vào TRANG QUẢN TRỊ api-admin — KHÁC hẳn quyền của 1 "Đối tác"
              (API key) gọi vào chính api-server, xem mục "Đối tác" ở trên.
            </p>
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
      <p className="form-hint">Hướng dẫn sử dụng api-admin theo đúng nghiệp vụ: phục vụ dữ liệu realtime cho báo cáo và đối tác ngoài.</p>
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
