import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Render modal trực tiếp vào document.body (Portal) thay vì lồng trong cây
// component của trang — một số trình duyệt trong app (Zalo, Facebook...) và
// WebView di động xử lý sai `position: fixed` khi phần tử nằm bên trong 1
// khối có cuộn ngang (vd bảng dữ liệu .table-scroll), khiến modal hiện lệch/
// kẹt theo từng dòng bảng thay vì phủ toàn màn hình (lỗi thật gặp trên
// mobile — xem CLAUDE.md "Mọi modal PHẢI render qua Portal"). Portal loại bỏ
// hẳn phụ thuộc vào vị trí trong cây DOM gốc; khoá cuộn nền trong lúc mở để
// tránh WebView tính sai lại vị trí fixed khi nền vẫn cuộn được.
export default function Modal({ children }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(<div className="modal">{children}</div>, document.body);
}
