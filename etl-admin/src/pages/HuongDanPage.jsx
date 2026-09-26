// pages/HuongDanPage.jsx — Module "Hướng dẫn": nội dung viết CỨNG trong
// code (không có CRUD/CMS — sửa chữ thì sửa file này rồi deploy lại, xác
// nhận người dùng), tách riêng theo ĐÚNG nghiệp vụ etl-admin (chuẩn bị dữ
// liệu nguồn cho báo cáo — KHÔNG bao gồm phần tạo báo cáo, đó là việc của
// rp-user, xem module "Hướng dẫn" bên đó). Phân quyền xem: MenuCode
// 'huong-dan' qua quyền Xem thường (giống đa số trang khác — không cần
// quyền Sửa), gán ở trang "Vai trò".
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
              etl-admin là nơi <strong>chuẩn bị dữ liệu nguồn</strong> cho toàn bộ hệ thống báo cáo —
              KHÔNG phải nơi tạo báo cáo (việc đó làm ở rp-user, xem module "Hướng dẫn" bên trang đó).
            </p>
            <p>Luồng dữ liệu tổng quát:</p>
            <ol>
              <li>CSDL vận hành thật của từng siêu thị/trung tâm (DSMART16 hoặc hệ thống tương tự).</li>
              <li><strong>etl-admin (trang này)</strong> — khai kết nối tới CSDL đó, tạo job đồng bộ định kỳ,
                đọc dữ liệu về Data Warehouse dùng chung.</li>
              <li><strong>rp-user</strong> — đọc Data Warehouse, tạo và hiển thị báo cáo cho người dùng cuối.</li>
            </ol>
            <p>
              Vì vậy: muốn 1 báo cáo mới có số liệu, việc ĐẦU TIÊN luôn là đảm bảo đúng dữ liệu đã được
              đồng bộ về đây (khai nguồn + tạo job), rồi mới sang rp-user để dựng báo cáo.
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Đồng bộ dữ liệu',
    items: [
      {
        id: 'nguon-du-lieu',
        icon: '🔌',
        label: 'Khai nguồn dữ liệu',
        content: (
          <>
            <h2>Khai nguồn dữ liệu</h2>
            <p>
              Vào trang <strong>"Nguồn dữ liệu"</strong> — mỗi CSDL cần đồng bộ (CSDL trung tâm, CSDL từng
              siêu thị, CSDL Lịch sử...) khai <strong>1 dòng kết nối</strong> (Server/Database/Username/Password).
            </p>
            <ul>
              <li>Hệ thống TỰ ĐỘNG kiểm tra kết nối ngay khi lưu — báo lỗi rõ ràng nếu sai thông tin, không
                cần đợi tới lúc chạy job mới biết.</li>
              <li>Nhiều siêu thị cùng cấu trúc CSDL: dùng <strong>"Nhập hàng loạt"</strong> (tải file mẫu Excel,
                điền danh sách server/database, upload lại) thay vì tạo tay từng cái.</li>
            </ul>
          </>
        )
      },
      {
        id: 'tao-job',
        icon: '🔄',
        label: 'Tạo job "Theo bảng"',
        content: (
          <>
            <h2>Tạo job "Theo bảng"</h2>
            <p>
              Vào trang <strong>"Đồng bộ dữ liệu"</strong> — đây là loại job DUY NHẤT hiện có: đọc 1 bảng/view
              từ CSDL đã khai, ghi vào kho dữ liệu dùng chung theo đúng khuôn:
            </p>
            <ul>
              <li><strong>Cột khoá (EntityCode)</strong> — mã định danh DUY NHẤT cho 1 dòng dữ liệu (thường là
                mã siêu thị, hoặc ghép "mã siêu thị_mã hàng" nếu cần chi tiết theo mặt hàng). Đây là khoá để
                báo cáo sau này GHÉP đúng dòng dữ liệu lại với nhau.</li>
              <li><strong>Cột ngày (EventDate)</strong> — ngày dữ liệu ĐÓ THẬT SỰ phát sinh (không phải ngày
                chạy job).</li>
              <li><strong>Cột watermark</strong> — cột tăng dần dùng để chỉ đồng bộ phần dữ liệu MỚI, không
                phải chạy lại từ đầu mỗi lần.</li>
              <li><strong>Dimensions</strong> — các cột dùng để HIỂN THỊ/LỌC trên báo cáo (tên siêu thị, tên
                hàng...).</li>
              <li><strong>Measures</strong> — các cột SỐ dùng để TÍNH TOÁN trên báo cáo (doanh thu, số lượng,
                tồn kho...).</li>
              <li><strong>Domain</strong> — tên bạn tự đặt cho "nhóm dữ liệu" này (vd <code>doanhthu_chinhanh</code>) —
                dùng XUYÊN SUỐT khi cấu hình báo cáo bên rp-user, đặt tên rõ ràng, dễ nhớ.</li>
            </ul>
            <h3>Khi nào bật "Giữ lịch sử theo ngày"?</h3>
            <p>
              Mặc định job CHỈ giữ đúng 1 dòng mới nhất/thực thể (ghi đè mỗi lần đồng bộ). BẬT tuỳ chọn này
              khi báo cáo cần SO SÁNH nhiều ngày (cùng kỳ năm trước, 7/30 ngày gần nhất, tồn kho "hôm qua"...) —
              tắt đi thì các phép so sánh đó KHÔNG có dữ liệu để tính, dù job vẫn chạy đúng.
            </p>
          </>
        )
      },
      {
        id: 'theo-doi-dong-bo',
        icon: '🧾',
        label: 'Theo dõi đồng bộ',
        content: (
          <>
            <h2>Theo dõi đồng bộ</h2>
            <p>
              Trang <strong>"Log"</strong> ghi lại MỖI lần job chạy — thành công/thất bại, số dòng đã xử lý,
              thông báo lỗi cụ thể nếu có. Đây là nơi ĐẦU TIÊN cần kiểm tra khi 1 báo cáo bên rp-user "trống"
              hoặc thiếu số liệu — nếu job liên quan CHƯA từng chạy thành công thì báo cáo không có gì để
              hiển thị là đúng, không phải lỗi báo cáo.
            </p>
          </>
        )
      }
    ]
  },
  {
    title: 'Danh mục phục vụ báo cáo',
    items: [
      {
        id: 'chi-tieu',
        icon: '🎯',
        label: 'Nhập chỉ tiêu',
        content: (
          <>
            <h2>Nhập chỉ tiêu</h2>
            <p>
              2 trang riêng <strong>"Chỉ tiêu Lãnh đạo Tập đoàn"</strong> và <strong>"Chỉ tiêu HCRC"</strong> —
              upload file Excel chỉ tiêu doanh thu/giao dịch theo tháng cho từng siêu thị (hoặc theo ngành hàng
              trong từng siêu thị), dùng để báo cáo bên rp-user tính "Tỷ lệ đạt (%)" so với thực đạt. Có thể
              sửa/thêm 1 dòng lẻ trực tiếp trên trang, không bắt buộc upload lại cả file mỗi lần đổi 1 số.
            </p>
          </>
        )
      },
      {
        id: 'diem-stk',
        icon: '🧩',
        label: 'Ánh xạ Điểm - STK_ID',
        content: (
          <>
            <h2>Ánh xạ Điểm - STK_ID</h2>
            <p>
              Mã "Điểm" (dùng trong file chỉ tiêu, ổn định lâu dài) đôi khi KHÁC mã kho STK_ID thật (dùng
              trong dữ liệu doanh thu/tồn kho) — đặc biệt khi 1 siêu thị ĐÓNG CỬA/MỞ LẠI dưới mã kho mới.
              Trang này khai bảng đối chiếu: 1 mã Điểm ứng với mã kho CŨ (kỳ trước) và mã kho MỚI (hiện tại).
            </p>
            <p>
              Không khai đủ ánh xạ cho 1 mã Điểm thì báo cáo doanh thu/giao dịch của siêu thị đó bên rp-user sẽ
              KHÔNG hiện ra (thà ẩn còn hơn hiện sai số) — đây là nguyên nhân phổ biến nhất khi "thiếu 1 siêu
              thị" trên báo cáo LDTD/HCRC.
            </p>
          </>
        )
      },
      {
        id: 'hang-core',
        icon: '📦',
        label: 'Danh sách hàng Core',
        content: (
          <>
            <h2>Danh sách hàng Core</h2>
            <p>
              Danh sách mặt hàng <strong>BẮT BUỘC luôn phải có hàng</strong> ("hàng Core"), khai riêng cho Mart
              và Minimart — dùng cho báo cáo "Core stock = 0" bên rp-user (khác báo cáo "Top bán chạy tồn kho=0",
              vốn tự xếp hạng không cần khai danh sách). Upload file Excel 2 sheet cố định "Core Mart"/"Core
              Minimart" — mỗi lần upload là THAY HẲN toàn bộ danh sách của đúng loại điểm có trong file (không
              cộng dồn) — xoá 1 mã khỏi file rồi nhập lại nghĩa là mã đó không còn thuộc diện Core nữa.
            </p>
            <p className="huong-dan-see-also">
              Xem đầy đủ (kể cả cách so khớp với file Excel gốc của DSMART16): tài liệu kỹ thuật
              <code> bc-core-ton-kho-0.md</code> trong repo.
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
        id: 'audit-log',
        icon: '📜',
        label: 'Nhật ký thao tác',
        content: (
          <>
            <h2>Nhật ký thao tác</h2>
            <p>
              Ghi lại MỌI thao tác thêm/sửa/xoá của mọi tài khoản quản trị (ai, làm gì, lúc nào) — dùng để tra
              soát khi có thay đổi bất thường hoặc cần biết "ai vừa sửa cái gì". Khác trang "Log" (chỉ ghi
              job đồng bộ tự động, không phải thao tác người dùng).
            </p>
          </>
        )
      },
      {
        id: 'phan-quyen',
        icon: '🔐',
        label: 'Phân quyền & Vai trò',
        content: (
          <>
            <h2>Phân quyền & Vai trò</h2>
            <p>
              Trang <strong>"Vai trò"</strong> — tạo vai trò tuỳ ý, gán quyền Xem/Sửa cho từng trang (menu).
              Trang <strong>"Phân quyền"</strong> — tạo tài khoản, gán 1 hay nhiều vai trò cho từng tài khoản.
              Một số trang (Ánh xạ Điểm - STK_ID, Danh sách hàng Core) yêu cầu quyền <strong>Sửa</strong> mới
              vào xem được — vì dữ liệu ở đó ảnh hưởng trực tiếp tới số liệu báo cáo, không có mức "chỉ xem".
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
      <p className="form-hint">Hướng dẫn sử dụng etl-admin theo đúng nghiệp vụ: chuẩn bị dữ liệu nguồn cho báo cáo.</p>
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
